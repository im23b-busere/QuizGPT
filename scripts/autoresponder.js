import { authService } from './auth.js';

// Initialize auth state
let isInitialized = false;
const answeredIndexes = new Set();
const inflightIndexes = new Set();
const billedIndexes = new Set();

async function initializeAuth() {
    if (isInitialized) return;

    try {
        await authService.loadAuthData();
        isInitialized = true;
        console.log('[AutoResponder] Auth initialized successfully');
    } catch (error) {
        console.error('[AutoResponder] Error initializing auth:', error);
    }
}

initializeAuth();

// Clear abandoned public-quiz cache leftovers from older builds
chrome.storage.local.remove(['quizgptLastQuiz', 'quizgptHostQuiz']).catch(() => {});

function resolveChoiceIndexFromAnswer(answer, choices) {
    if (!answer || !Array.isArray(choices) || choices.length === 0) return undefined;

    let answerLower = String(answer)
        .toLowerCase()
        .trim()
        .replace(/^["'«»]|["'«»]$/g, '')
        .replace(/^\d+[\.)]\s*/, '')
        .replace(/^(die|der|das|the|answer|antwort)\s*[:\-]?\s*/i, '')
        .trim();

    // Prefer the longest choice that appears inside the AI reply
    let bestIdx = -1;
    let bestScore = 0;

    choices.forEach((c, i) => {
        const text = String(c || '').toLowerCase().trim();
        if (!text) return;

        let score = 0;
        if (text === answerLower) score = 100;
        else if (answerLower.includes(text) && text.length >= 3) score = 85 + Math.min(10, text.length / 10);
        else if (text.includes(answerLower) && answerLower.length >= 3) score = 80;
        else {
            const words1 = text.split(/\s+/).filter(Boolean);
            const words2 = answerLower.split(/\s+/).filter(Boolean);
            const common = words1.filter(w => w.length > 2 && words2.includes(w));
            if (common.length) {
                score = (common.length / Math.max(words1.length, words2.length)) * 70;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
        }
    });

    return bestScore >= 50 ? bestIdx : undefined;
}

function buildHighlightOptions(settings, source) {
    return {
        highlight: settings.highlightOption !== false,
        autoClick: settings.autoClickOption !== false,
        // Default 0 — never invent a 3s delay when the setting is missing
        answerDelay: typeof settings.answerDelay === 'number' ? settings.answerDelay : 0,
        silentMode: settings.silentMode || false,
        source: source || 'ai'
    };
}

async function sendAnswerToTab(tabId, { answer, choiceIndex, questionIndex, settings, source }) {
    await chrome.tabs.sendMessage(tabId, {
        action: 'highlightAnswer',
        answer: answer || '',
        choiceIndex: typeof choiceIndex === 'number' ? choiceIndex : undefined,
        questionIndex: typeof questionIndex === 'number' ? questionIndex : undefined,
        options: buildHighlightOptions(settings, source)
    });
}

/** Membership status: single-flight + cache + 429 backoff (content/popup were flooding /status). */
let membershipCache = {
    data: null,
    fetchedAt: 0,
    inflight: null,
    backoffUntil: 0,
    _lastLocalWriteAt: 0,
    _lastSyncWriteAt: 0,
    _pendingLocal: null,
    _localWriteTimer: null
};

const MEMBERSHIP_MIN_INTERVAL_MS = 60_000;
const MEMBERSHIP_429_BACKOFF_MS = 120_000;
const MEMBERSHIP_LOCAL_WRITE_MS = 5_000;
const MEMBERSHIP_SYNC_WRITE_MS = 5 * 60_000; // sync quota is tiny — rare mirrors only

function normalizeMembership(data) {
    return {
        planType: String(data.plan_type || data.planType || 'free').toLowerCase(),
        usage: data.usage ?? data.used ?? 0,
        limit: data.limit ?? data.monthly_limit ?? 5,
        updatedAt: Date.now()
    };
}

function isPaidPlanName(plan) {
    const p = String(plan || '').toLowerCase();
    return p === 'premium' || p === 'enterprise' || p === 'ultra';
}

/** Prefer the freshest snapshot. Never keep a stale paid plan over a newer free from the API. */
function preferMembership(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
}

function membershipUnchanged(a, b) {
    if (!a || !b) return false;
    return a.planType === b.planType
        && Number(a.usage) === Number(b.usage)
        && Number(b.limit) === Number(a.limit);
}

async function readStoredMembership() {
    try {
        // Prefer local (high write quota). Sync is only a rare mirror for cross-device.
        const [local, sync] = await Promise.all([
            chrome.storage.local.get(['membershipStatus']).catch(() => ({})),
            chrome.storage.sync.get(['membershipStatus']).catch(() => ({}))
        ]);
        return preferMembership(local.membershipStatus, sync.membershipStatus);
    } catch (_) {
        return null;
    }
}

async function writeStoredMembership(ms) {
    if (!ms || typeof ms !== 'object') return;
    const prev = membershipCache.data;
    membershipCache.data = ms;
    membershipCache.fetchedAt = Date.now();

    // Skip disk entirely when nothing meaningful changed
    if (membershipUnchanged(prev, ms)) return;

    const usageOrPlanChanged = !prev
        || prev.planType !== ms.planType
        || Number(prev.usage) !== Number(ms.usage)
        || Number(prev.limit) !== Number(ms.limit);

    const flushLocal = async (payload) => {
        membershipCache._lastLocalWriteAt = Date.now();
        try {
            await chrome.storage.local.set({ membershipStatus: payload });
        } catch (err) {
            console.warn('[AutoResponder] membership local write failed:', err?.message || err);
        }
    };

    const flushSyncRarely = async (payload) => {
        const now = Date.now();
        const planChanged = !prev || prev.planType !== payload.planType;
        const syncDue = !membershipCache._lastSyncWriteAt
            || now - membershipCache._lastSyncWriteAt >= MEMBERSHIP_SYNC_WRITE_MS;
        // Mirror plan changes (upgrade OR downgrade) so sync can't resurrect an old paid plan
        if (!planChanged && !syncDue) return;
        membershipCache._lastSyncWriteAt = now;
        try {
            await chrome.storage.sync.set({ membershipStatus: payload });
        } catch (err) {
            console.warn('[AutoResponder] membership sync write skipped:', err?.message || err);
            // If sync is stuck on an old paid plan, drop it so local free/new plan wins on read
            if (planChanged) {
                try {
                    await chrome.storage.sync.remove(['membershipStatus']);
                } catch (_) { /* ignore */ }
            }
        }
    };

    // Usage/plan changes must hit local immediately so the Kahoot panel counter stays live
    if (usageOrPlanChanged) {
        if (membershipCache._localWriteTimer) {
            clearTimeout(membershipCache._localWriteTimer);
            membershipCache._localWriteTimer = null;
            membershipCache._pendingLocal = null;
        }
        await flushLocal(ms);
        await flushSyncRarely(ms);
        return;
    }

    const now = Date.now();
    if (membershipCache._lastLocalWriteAt && now - membershipCache._lastLocalWriteAt < MEMBERSHIP_LOCAL_WRITE_MS) {
        membershipCache._pendingLocal = ms;
        if (!membershipCache._localWriteTimer) {
            membershipCache._localWriteTimer = setTimeout(async () => {
                membershipCache._localWriteTimer = null;
                const pending = membershipCache._pendingLocal;
                membershipCache._pendingLocal = null;
                if (!pending) return;
                await flushLocal(pending);
                await flushSyncRarely(pending);
            }, MEMBERSHIP_LOCAL_WRITE_MS);
        }
        return;
    }

    await flushLocal(ms);
    await flushSyncRarely(ms);
}

/**
 * Optimistic +1 after each AI answer so the Kahoot panel usage counter updates immediately.
 * Applies to all plans (server increments for free/premium/enterprise alike).
 */
async function bumpLocalUsage() {
    const current = membershipCache.data || await readStoredMembership() || {
        planType: 'free', usage: 0, limit: 5, updatedAt: Date.now()
    };
    const next = {
        ...current,
        usage: (current.usage || 0) + 1,
        updatedAt: Date.now()
    };
    await writeStoredMembership(next);
    return next;
}

async function fetchMembershipStatus({ force = false } = {}) {
    const now = Date.now();

    // Force must not wait on a non-force in-flight request that may resolve from cache
    if (membershipCache.inflight && !force) {
        return membershipCache.inflight;
    }

    const cached = membershipCache.data || await readStoredMembership();
    if (cached && !membershipCache.data) {
        membershipCache.data = cached;
        // Don't treat disk hydrate as a fresh network fetch — allow reconcile soon
        membershipCache.fetchedAt = Math.min(cached.updatedAt || 0, now - MEMBERSHIP_MIN_INTERVAL_MS);
    }

    if (!force && membershipCache.data && (now - membershipCache.fetchedAt < MEMBERSHIP_MIN_INTERVAL_MS)) {
        return { ok: true, membership: membershipCache.data, cached: true };
    }

    if (!force && now < membershipCache.backoffUntil) {
        if (membershipCache.data || cached) {
            return { ok: true, membership: membershipCache.data || cached, cached: true, rateLimited: true };
        }
        return { ok: false, status: 429, error: 'rate limited', cached: false };
    }

    // Force clears backoff so admin/DB plan changes show up immediately
    if (force) {
        membershipCache.backoffUntil = 0;
        membershipCache.fetchedAt = 0;
    }

    const run = (async () => {
        try {
            await initializeAuth();
            const response = await authService.makeAuthenticatedRequest(
                'https://api.quizgpt.site/api/membership/status',
                { method: 'GET' }
            );

            if (response.status === 429) {
                membershipCache.backoffUntil = Date.now() + MEMBERSHIP_429_BACKOFF_MS;
                console.warn('[AutoResponder] membership/status 429 — backing off 2 min');
                const fallback = membershipCache.data || await readStoredMembership();
                if (fallback) return { ok: true, membership: fallback, cached: true, rateLimited: true };
                return { ok: false, status: 429, error: 'Too many requests' };
            }

            if (!response.ok) {
                const fallback = membershipCache.data || await readStoredMembership();
                if (fallback) return { ok: true, membership: fallback, cached: true };
                return { ok: false, status: response.status };
            }

            const data = await response.json();
            const ms = normalizeMembership(data);
            membershipCache.backoffUntil = 0;
            // Always persist live API truth (including free downgrades)
            await writeStoredMembership(ms);
            console.log('[AutoResponder] membership refreshed from API:', ms);
            return { ok: true, membership: ms, cached: false };
        } catch (err) {
            const msg = String(err?.message || err);
            if (msg.includes('429')) {
                membershipCache.backoffUntil = Date.now() + MEMBERSHIP_429_BACKOFF_MS;
            }
            console.error('[AutoResponder] getMembershipStatus error:', err);
            const fallback = membershipCache.data || await readStoredMembership();
            if (fallback) return { ok: true, membership: fallback, cached: true, error: msg };
            return { ok: false, error: msg };
        } finally {
            membershipCache.inflight = null;
        }
    })();

    membershipCache.inflight = run;
    return run;
}

// Hydrate from disk so SW wake doesn't re-fetch immediately
readStoredMembership().then((ms) => {
    if (ms && !membershipCache.data) {
        membershipCache.data = ms;
        membershipCache.fetchedAt = ms.updatedAt || Date.now();
    }
}).catch(() => {});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[AutoResponder] Received message:', request);

    if (request.action === 'getMembershipStatus') {
        fetchMembershipStatus({ force: !!request.force })
            .then((result) => sendResponse(result))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
    }

    if (request.action === 'processQuestion') {
        sendResponse({ received: true });
        processQuestionWithBackend(request.question, sender.tab.id)
            .then(() => console.log('[AutoResponder] Question processed successfully'))
            .catch(error => console.error('[AutoResponder] Error processing question:', error));
        return true;
    }

    if (request.action === 'openLoginPage') {
        const fallbackToTab = () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('pages/login.html') });
        };
        try {
            if (chrome.action && typeof chrome.action.openPopup === 'function') {
                chrome.action.openPopup().catch(fallbackToTab);
            } else {
                fallbackToTab();
            }
        } catch (_) {
            fallbackToTab();
        }
        sendResponse({ ok: true });
        return true;
    }

    if (request.action === 'checkStatus') {
        sendResponse({
            status: 'running',
            authInitialized: isInitialized,
            timestamp: new Date().toISOString()
        });
        return true;
    }

    if (request.action === 'resetGameState') {
        answeredIndexes.clear();
        inflightIndexes.clear();
        billedIndexes.clear();
        sendResponse({ ok: true });
        return true;
    }

    return true;
});

async function processQuestionWithBackend(question, tabId) {
    const questionIndex = typeof question?.questionIndex === 'number' ? question.questionIndex : null;
    let claimedInflight = false;

    try {
        console.log('[AutoResponder] Starting to process question:', question);

        await initializeAuth();

        const authData = await authService.loadAuthData();
        console.log('[AutoResponder] Auth status:', authData);

        if (!authData.isLoggedIn) {
            console.log('[AutoResponder] Not authenticated, skipping question');
            await chrome.tabs.sendMessage(tabId, {
                action: 'showAuthError',
                message: 'Please log in to use the auto-responder. Click the extension icon to log in.'
            });
            return;
        }

        const settings = await chrome.storage.sync.get(['highlightOption', 'autoClickOption', 'answerDelay', 'silentMode']);
        console.log('[AutoResponder] User settings:', settings);

        const hasText = !!(question.title && Array.isArray(question.choices) && question.choices.length > 0);

        if (!hasText) {
            console.log('[AutoResponder] No visible question text yet — waiting for choices/title');
            return;
        }

        // One AI call per question index. Claim immediately to stop concurrent races.
        if (questionIndex != null) {
            if (answeredIndexes.has(questionIndex) || inflightIndexes.has(questionIndex)) {
                // Real reconnect may retry once; GetReady fallback must never re-bill.
                if (question._reconnectAnswer && !inflightIndexes.has(questionIndex)
                    && !billedIndexes.has(questionIndex)) {
                    answeredIndexes.delete(questionIndex);
                } else {
                    console.log('[AutoResponder] Already handled question index', questionIndex);
                    return;
                }
            }
            inflightIndexes.add(questionIndex);
            claimedInflight = true;
        }

        const fullQuestion = `${question.title}\n\nOptions:\n${question.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
        console.log('[AutoResponder] Sending question to backend:', fullQuestion);

        const response = await authService.makeAuthenticatedRequest('https://api.quizgpt.site/api/questions/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: fullQuestion })
        });

        console.log('[AutoResponder] Backend response status:', response.status);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.log('[AutoResponder] Backend error:', errorData);

            if (response.status === 403 && errorData.message === 'Free tier limit reached') {
                chrome.runtime.sendMessage({
                    action: 'showAuthError',
                    message: 'Free tier limit reached. You have used all 5 free quiz attempts. Please upgrade to premium for full access!'
                });
                return;
            }

            chrome.runtime.sendMessage({
                action: 'showAuthError',
                message: errorData.message || 'Failed to get answer. Please try again.'
            });
            return;
        }

        const result = await response.json();
        console.log('[AutoResponder] Answer from backend:', result.answer);

        if (questionIndex != null) answeredIndexes.add(questionIndex);

        const choiceIndex = resolveChoiceIndexFromAnswer(result.answer, question.choices);
        console.log('[AutoResponder] Resolved AI choiceIndex:', choiceIndex, 'from', result.answer);

        try {
            await chrome.tabs.sendMessage(tabId, {
                action: 'clearAnsweredQuestion',
                questionIndex
            });
        } catch (_) { /* ignore */ }

        await sendAnswerToTab(tabId, {
            answer: result.answer,
            choiceIndex,
            questionIndex,
            settings,
            source: 'ai'
        });

        // Server already increments usage on /answer — keep local UI in sync once per question.
        let membership = null;
        try {
            const alreadyBilled = questionIndex != null && billedIndexes.has(questionIndex);
            if (!alreadyBilled) {
                if (questionIndex != null) billedIndexes.add(questionIndex);
                if (typeof result.usage === 'number') {
                    const current = membershipCache.data || await readStoredMembership() || {
                        planType: 'free', usage: 0, limit: 5, updatedAt: Date.now()
                    };
                    membership = {
                        ...current,
                        usage: result.usage,
                        limit: result.limit ?? current.limit,
                        planType: String(result.plan_type || result.planType || current.planType || 'free').toLowerCase(),
                        updatedAt: Date.now()
                    };
                    await writeStoredMembership(membership);
                } else {
                    membership = await bumpLocalUsage();
                }
            } else {
                membership = membershipCache.data || await readStoredMembership();
            }
        } catch (_) { /* ignore */ }
        try {
            await chrome.tabs.sendMessage(tabId, {
                action: 'updateUsage',
                membership: membership || membershipCache.data || null
            });
        } catch (_) { /* fine */ }

        setTimeout(() => {
            fetchMembershipStatus({ force: true }).catch(() => {});
        }, 5000);

        console.log('[AutoResponder] Answer sent to content script successfully');

    } catch (err) {
        console.error('[AutoResponder] Error processing question:', err);

        if (err.message && err.message.includes('status: 403')) {
            chrome.runtime.sendMessage({
                action: 'updateAnswer',
                answer: 'Du hast dein kostenloses Kontingent aufgebraucht. Upgrade auf Premium für unbegrenzten Zugriff auf QuizGPT!'
            });
            return;
        }

        chrome.runtime.sendMessage({
            action: 'updateAnswer',
            answer: 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.'
        });
    } finally {
        if (claimedInflight && questionIndex != null) {
            inflightIndexes.delete(questionIndex);
        }
    }
}
