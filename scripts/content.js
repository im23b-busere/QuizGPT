// Inject the WebSocket hook script once per document
(function injectPageHook() {
    try {
        const root = document.documentElement;
        if (root && root.dataset.quizgptHook === '1') return;
        if (root) root.dataset.quizgptHook = '1';
    } catch (_) { /* ignore */ }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('scripts/injected.js');
    script.onload = () => {
        console.log('[Content] Injected script loaded');
        script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
})();

// Store the current question
let currentQuestion = null;

/* ------------------------------------------------------------------ */
/*  QuizGPT on-page panel                                             */
/* ------------------------------------------------------------------ */

const QGPT_PANEL_ID = 'quizgpt-panel';
const QGPT_STYLE_ID = 'quizgpt-panel-styles';
// Never fetch the API from this content script (CORS blocks kahoot.it).
// Membership always goes: content → background service worker → api.quizgpt.site

const qgptState = {
    mounted: false,
    collapsed: false,
    user: null,
    signedIn: false,
    plan: 'free',
    usage: 0,
    limit: 5,
    status: 'Ready',
    statusTone: 'idle',
    limitPopupDismissed: false,
    settings: {
        highlight: true,
        autoClick: true,
        silentMode: false,
        answerDelay: 0
    }
};

const QGPT_IS_TOP_FRAME = (() => {
    try { return window.top === window.self; } catch (_) { return false; }
})();

function whenBodyReady(cb) {
    if (document.body) return cb();
    const obs = new MutationObserver(() => {
        if (document.body) {
            obs.disconnect();
            cb();
        }
    });
    obs.observe(document.documentElement, { childList: true });
}

function injectPanelStyles() {
    if (document.getElementById(QGPT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = QGPT_STYLE_ID;
    style.textContent = `
        #${QGPT_PANEL_ID} {
            position: fixed;
            top: 14px;
            right: 14px;
            z-index: 2147483600;
            font-family: "Segoe UI", Tahoma, system-ui, sans-serif;
            color: #f5f5f5;
            font-size: 12.5px;
            line-height: 1.35;
            -webkit-font-smoothing: antialiased;
            pointer-events: none;
        }
        #${QGPT_PANEL_ID} * { box-sizing: border-box; }
        #${QGPT_PANEL_ID} .qgpt-card,
        #${QGPT_PANEL_ID} .qgpt-pill {
            pointer-events: auto;
            background: linear-gradient(180deg, #1f1f24 0%, #17171c 100%);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.35);
            backdrop-filter: blur(6px);
        }
        #${QGPT_PANEL_ID}[data-collapsed="true"] .qgpt-card { display: none; }
        #${QGPT_PANEL_ID}[data-collapsed="false"] .qgpt-pill { display: none; }

        /* Collapsed pill */
        #${QGPT_PANEL_ID} .qgpt-pill {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px 6px 6px;
            cursor: pointer;
            transition: transform .15s ease, border-color .15s ease;
            user-select: none;
        }
        #${QGPT_PANEL_ID} .qgpt-pill:hover { transform: translateY(-1px); border-color: rgba(218,112,214,0.5); }
        #${QGPT_PANEL_ID} .qgpt-logo {
            width: 24px; height: 24px;
            border-radius: 6px;
            display: block;
            flex-shrink: 0;
            object-fit: contain;
            image-rendering: -webkit-optimize-contrast;
        }
        #${QGPT_PANEL_ID} .qgpt-pill-label { font-weight: 600; font-size: 12px; color: #eee; }

        /* Expanded card */
        #${QGPT_PANEL_ID} .qgpt-card {
            width: 270px;
            overflow: hidden;
            position: relative;
        }

        /* Free-limit overlay (GeoGPT-style) */
        #${QGPT_PANEL_ID} .qgpt-limit-overlay {
            position: absolute;
            inset: 0;
            z-index: 40;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 14px;
            pointer-events: auto;
        }
        #${QGPT_PANEL_ID} .qgpt-limit-overlay[hidden] { display: none !important; }
        #${QGPT_PANEL_ID} .qgpt-limit-backdrop {
            position: absolute;
            inset: 0;
            border-radius: 12px;
            background: rgba(8, 8, 12, 0.52);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }
        #${QGPT_PANEL_ID} .qgpt-limit-popup {
            position: relative;
            z-index: 1;
            width: 100%;
            max-width: 230px;
            padding: 22px 16px 18px;
            border-radius: 14px;
            text-align: center;
            background: rgba(22, 22, 28, 0.97);
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 16px 40px rgba(0,0,0,0.55);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
        }
        #${QGPT_PANEL_ID} .qgpt-limit-close {
            position: absolute; top: 8px; right: 8px;
            width: 26px; height: 26px; padding: 0; margin: 0;
            border: 0; border-radius: 8px;
            background: transparent; color: rgba(255,255,255,0.55);
            cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
            font-size: 18px; line-height: 1;
        }
        #${QGPT_PANEL_ID} .qgpt-limit-close:hover {
            color: #fff; background: rgba(255,255,255,0.08);
        }
        #${QGPT_PANEL_ID} .qgpt-limit-title {
            margin-top: 4px;
            font-weight: 800;
            font-size: 15px;
            letter-spacing: 0.01em;
            color: #ff7b7b;
        }
        #${QGPT_PANEL_ID} .qgpt-limit-copy {
            font-weight: 600;
            font-size: 12px;
            line-height: 1.4;
            color: rgba(255,255,255,0.88);
            max-width: 190px;
        }
        #${QGPT_PANEL_ID} .qgpt-limit-upgrade {
            margin-top: 4px;
            width: 100%;
            padding: 10px 12px;
            border: 0;
            border-radius: 10px;
            background: linear-gradient(135deg, #8A2BE2, #DA70D6);
            color: #fff;
            font: inherit;
            font-size: 12.5px;
            font-weight: 600;
            letter-spacing: 0.03em;
            line-height: 1.25;
            -webkit-font-smoothing: antialiased;
            text-rendering: optimizeLegibility;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            box-shadow: 0 8px 18px rgba(138, 43, 226, 0.28);
            transition: 300ms;
        }
        #${QGPT_PANEL_ID} .qgpt-limit-upgrade:hover {
            animation: qgptPulseBtn 1.5s infinite;
        }
        @keyframes qgptPulseBtn {
            0% { box-shadow: 0 0 0 0 #8A2BE266; }
            70% { box-shadow: 0 0 0 10px #DA70D600; }
            100% { box-shadow: 0 0 0 0 #DA70D600; }
        }
        #${QGPT_PANEL_ID} .qgpt-limit-upgrade svg {
            width: 14px; height: 14px; flex: 0 0 auto;
        }
        #${QGPT_PANEL_ID} .qgpt-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            background: linear-gradient(90deg, rgba(138,43,226,0.12), rgba(218,112,214,0.05));
        }
        #${QGPT_PANEL_ID} .qgpt-identity {
            flex: 1 1 auto;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 6px;
            overflow: hidden;
        }
        #${QGPT_PANEL_ID} .qgpt-name {
            flex: 0 1 auto;
            min-width: 0;
            font-weight: 600; font-size: 13px; color: #fff;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #${QGPT_PANEL_ID} .qgpt-plan {
            flex-shrink: 0;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            line-height: 1.6;
        }
        #${QGPT_PANEL_ID} .qgpt-plan[hidden] { display: none; }
        #${QGPT_PANEL_ID} .qgpt-plan--free { background: #3a3a3a; color: #ddd; }
        #${QGPT_PANEL_ID} .qgpt-plan--premium { background: linear-gradient(45deg, #FFD700, #FFA500); color: #333; }
        #${QGPT_PANEL_ID} .qgpt-plan--ultra,
        #${QGPT_PANEL_ID} .qgpt-plan--enterprise { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }

        #${QGPT_PANEL_ID} .qgpt-icon-btn {
            all: unset;
            box-sizing: border-box;
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px;
            cursor: pointer;
            color: #b0b0b0;
            transition: background .15s ease, color .15s ease;
            flex-shrink: 0;
            position: relative;
            z-index: 2;
            pointer-events: auto;
        }
        #${QGPT_PANEL_ID} .qgpt-icon-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
        #${QGPT_PANEL_ID} .qgpt-header { position: relative; z-index: 2; }

        #${QGPT_PANEL_ID} .qgpt-section { padding: 10px 12px; }
        #${QGPT_PANEL_ID} .qgpt-section + .qgpt-section { border-top: 1px solid rgba(255,255,255,0.05); }

        #${QGPT_PANEL_ID} .qgpt-usage-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            gap: 10px;
            font-size: 11px;
            margin-bottom: 7px;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-label {
            font-weight: 700;
            letter-spacing: 0.02em;
            color: #9aa3ae;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-value {
            color: rgba(255, 255, 255, 0.78);
            font-weight: 700;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-bar {
            height: 6px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 999px;
            overflow: hidden;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-fill {
            height: 100%;
            width: 0%;
            border-radius: inherit;
            background: linear-gradient(90deg, #8A2BE2, #DA70D6);
            transition: width 0.35s ease;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-bar--limit .qgpt-usage-fill {
            background: linear-gradient(90deg, #e25b5b, #ff7b7b);
        }
        #${QGPT_PANEL_ID} .qgpt-usage-note {
            margin: 7px 0 0;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.35;
            color: #9aa3ae;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-note[hidden] {
            display: none !important;
        }

        /* Settings rows */
        #${QGPT_PANEL_ID} .qgpt-row {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 0;
            font-size: 12px;
            color: #ddd;
        }
        #${QGPT_PANEL_ID} .qgpt-row + .qgpt-row { border-top: 1px solid rgba(255,255,255,0.04); }
        #${QGPT_PANEL_ID} .qgpt-row-label {
            flex: 1; min-width: 0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #${QGPT_PANEL_ID} .qgpt-lock {
            display: inline-flex; align-items: center; gap: 3px;
            font-size: 9px; font-weight: 700;
            padding: 1px 5px; border-radius: 8px;
            text-transform: uppercase; letter-spacing: 0.04em;
        }
        #${QGPT_PANEL_ID} .qgpt-lock--premium { background: linear-gradient(45deg, #FFD700, #FFA500); color: #333; }
        #${QGPT_PANEL_ID} .qgpt-lock--ultra { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }
        #${QGPT_PANEL_ID} .qgpt-lock svg { width: 9px; height: 9px; }

        /* Toggle switch (GeoGPT-style) */
        #${QGPT_PANEL_ID} .qgpt-toggle {
            appearance: none;
            -webkit-appearance: none;
            margin: 0;
            width: 42px; height: 24px;
            background: #3a3f48;
            border-radius: 999px;
            position: relative;
            cursor: pointer;
            transition: background .15s ease;
            flex-shrink: 0;
            border: none;
            outline: none;
        }
        #${QGPT_PANEL_ID} .qgpt-toggle::after {
            content: '';
            position: absolute;
            top: 3px; left: 3px;
            width: 18px; height: 18px;
            border-radius: 50%;
            background: #fff;
            transition: transform .15s ease;
            box-shadow: 0 1px 2px rgba(0,0,0,0.35);
        }
        #${QGPT_PANEL_ID} .qgpt-toggle:checked {
            background: linear-gradient(135deg, #8A2BE2, #DA70D6);
        }
        #${QGPT_PANEL_ID} .qgpt-toggle:checked::after { transform: translateX(18px); }
        #${QGPT_PANEL_ID} .qgpt-toggle:disabled { opacity: 0.45; }

        #${QGPT_PANEL_ID} .qgpt-row--locked { cursor: pointer; }
        #${QGPT_PANEL_ID} .qgpt-row--locked .qgpt-row-label { color: #8a8a8a; }

        /* Delay slider row */
        #${QGPT_PANEL_ID} .qgpt-delay-row {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 0 4px;
            font-size: 12px;
            color: #ddd;
            border-top: 1px solid rgba(255,255,255,0.04);
        }
        #${QGPT_PANEL_ID} .qgpt-delay-label {
            flex-shrink: 0;
        }
        #${QGPT_PANEL_ID} .qgpt-delay-slider {
            -webkit-appearance: none;
            appearance: none;
            flex: 1;
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            outline: none;
            cursor: pointer;
            min-width: 0;
        }
        #${QGPT_PANEL_ID} .qgpt-delay-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 12px; height: 12px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8A2BE2, #DA70D6);
            cursor: pointer;
            border: none;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }
        #${QGPT_PANEL_ID} .qgpt-delay-slider::-moz-range-thumb {
            width: 12px; height: 12px;
            border-radius: 50%;
            background: linear-gradient(135deg, #8A2BE2, #DA70D6);
            cursor: pointer;
            border: none;
        }
        #${QGPT_PANEL_ID} .qgpt-delay-slider:disabled { opacity: 0.45; cursor: not-allowed; }
        #${QGPT_PANEL_ID} .qgpt-delay-value {
            width: 34px;
            text-align: right;
            font-variant-numeric: tabular-nums;
            color: #fff; font-weight: 600;
            flex-shrink: 0;
        }

        /* Status row */
        #${QGPT_PANEL_ID} .qgpt-status-section {
            padding: 8px 12px;
            border-top: 1px solid rgba(255,255,255,0.05);
        }
        #${QGPT_PANEL_ID} .qgpt-status {
            display: flex; align-items: center; gap: 8px;
            font-size: 11.5px; color: #cfcfcf;
        }
        #${QGPT_PANEL_ID} .qgpt-status-dot {
            width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
            background: #4CAF50;
            box-shadow: 0 0 6px rgba(76,175,80,0.45);
            transition: background .2s ease, box-shadow .2s ease;
        }
        #${QGPT_PANEL_ID} .qgpt-status[data-tone="busy"] .qgpt-status-dot {
            background: #FFB74D;
            box-shadow: 0 0 6px rgba(255,183,77,0.6);
            animation: qgptPulse 1.2s ease-in-out infinite;
        }
        #${QGPT_PANEL_ID} .qgpt-status[data-tone="success"] .qgpt-status-dot { background: #4CAF50; }
        #${QGPT_PANEL_ID} .qgpt-status[data-tone="error"] .qgpt-status-dot {
            background: #ff6b6b;
            box-shadow: 0 0 6px rgba(255,107,107,0.6);
        }
        #${QGPT_PANEL_ID} .qgpt-status-text {
            flex: 1; min-width: 0;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        @keyframes qgptPulse { 0%,100%{opacity:1} 50%{opacity:.45} }

        /* Signed-out CTA */
        #${QGPT_PANEL_ID} .qgpt-empty {
            padding: 16px 14px 14px;
            text-align: center;
        }
        #${QGPT_PANEL_ID} .qgpt-empty-title {
            font-weight: 600; font-size: 13px; color: #fff;
            margin-bottom: 4px;
        }
        #${QGPT_PANEL_ID} .qgpt-empty-desc {
            font-size: 11.5px; color: #9a9a9a;
            margin-bottom: 12px;
            line-height: 1.4;
        }
        #${QGPT_PANEL_ID} .qgpt-signin-btn {
            display: inline-flex; align-items: center; justify-content: center;
            gap: 6px;
            width: 100%;
            padding: 8px 12px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(90deg, #8A2BE2, #DA70D6);
            color: #fff; font-weight: 600; font-size: 12.5px;
            cursor: pointer;
            transition: 300ms;
            box-shadow: 0 4px 12px rgba(138,43,226,0.35);
        }
        #${QGPT_PANEL_ID} .qgpt-signin-btn:hover { animation: qgptPulseBtn 1.5s infinite; }
        #${QGPT_PANEL_ID} .qgpt-signin-btn svg { width: 12px; height: 12px; }
        #${QGPT_PANEL_ID} .qgpt-empty-hint {
            margin-top: 10px;
            font-size: 10.5px;
            color: #8a8a8a;
            line-height: 1.45;
        }
        #${QGPT_PANEL_ID} .qgpt-empty-hint strong { color: #c0a6e8; font-weight: 600; }
    `;
    (document.head || document.documentElement).appendChild(style);
}

function formatPlanLabel(plan) {
    const p = (plan || 'free').toLowerCase();
    if (p === 'enterprise' || p === 'ultra') return 'Ultra';
    if (p === 'premium') return 'Premium';
    return 'Free';
}

function planClass(plan) {
    const p = (plan || 'free').toLowerCase();
    if (p === 'enterprise' || p === 'ultra') return 'qgpt-plan--ultra';
    if (p === 'premium') return 'qgpt-plan--premium';
    return 'qgpt-plan--free';
}

function isPaidPlanName(plan) {
    const p = String(plan || '').toLowerCase();
    return p === 'premium' || p === 'enterprise' || p === 'ultra';
}

/** Apply membership to panel state — never let a stale free cache wipe Ultra/Premium. */
function applyMembershipState(ms, { source = 'unknown', allowDowngrade = false } = {}) {
    if (!ms || typeof ms !== 'object') return false;
    const nextPlan = String(ms.planType || ms.plan_type || 'free').toLowerCase();
    const nextUsage = ms.usage ?? ms.used ?? 0;
    const nextLimit = ms.limit ?? ms.monthly_limit ?? (isPaidPlanName(nextPlan) ? 1000 : 5);

    const curPlan = String(qgptState.plan || 'free').toLowerCase();
    // Live API refresh may downgrade; storage/cache must not.
    const fromLiveApi = allowDowngrade || source === 'refresh';
    if (isPaidPlanName(curPlan) && !isPaidPlanName(nextPlan) && !fromLiveApi) {
        console.warn('[QuizGPT] Ignoring free membership overwrite of', curPlan, 'from', source);
        // Still allow usage/limit refresh for the paid plan
        if (typeof nextUsage === 'number' && nextUsage >= (qgptState.usage || 0)) {
            qgptState.usage = nextUsage;
        }
        if (typeof nextLimit === 'number' && nextLimit > (isPaidPlanName(curPlan) ? 5 : 0)) {
            qgptState.limit = nextLimit;
        }
        return true;
    }

    qgptState.plan = nextPlan;
    qgptState.usage = nextUsage;
    qgptState.limit = nextLimit;
    return true;
}

function qgptLogoUrl() {
    try { return chrome.runtime.getURL('icons/icon48.png'); } catch (_) { return ''; }
}

function mountPanel() {
    if (qgptState.mounted) return;
    if (!QGPT_IS_TOP_FRAME) return;
    injectPanelStyles();

    const root = document.createElement('div');
    root.id = QGPT_PANEL_ID;
    root.setAttribute('data-collapsed', qgptState.collapsed ? 'true' : 'false');

    const logoSrc = qgptLogoUrl();
    const lockSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

    root.innerHTML = `
        <div class="qgpt-pill" role="button" title="Expand QuizGPT">
            <img class="qgpt-logo" src="${logoSrc}" alt="QuizGPT"/>
            <span class="qgpt-pill-label">QuizGPT</span>
        </div>
        <div class="qgpt-card" role="region" aria-label="QuizGPT panel">
            <div class="qgpt-header">
                <img class="qgpt-logo" src="${logoSrc}" alt="QuizGPT"/>
                <div class="qgpt-identity">
                    <span class="qgpt-name" data-qgpt="name">QuizGPT</span>
                    <span class="qgpt-plan qgpt-plan--free" data-qgpt="plan">Free</span>
                </div>
                <button type="button" class="qgpt-icon-btn" data-qgpt="collapse" title="Collapse" aria-label="Collapse QuizGPT">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none"><path d="M5 12h14"/></svg>
                </button>
            </div>

            <div class="qgpt-empty" data-qgpt="empty-state" style="display:none">
                <div class="qgpt-empty-title">Sign in to QuizGPT</div>
                <div class="qgpt-empty-desc">You need an account to detect and answer Kahoot questions.</div>
                <button class="qgpt-signin-btn" data-qgpt="signin-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    Sign in / Create account
                </button>
                <div class="qgpt-empty-hint">
                    If nothing opens, click the <strong>puzzle-piece icon</strong> in your browser toolbar, find <strong>QuizGPT</strong> in the list and pin it, then click it to sign in.
                </div>
            </div>

            <div class="qgpt-section" data-qgpt="usage-section">
                <div class="qgpt-usage-row">
                    <span class="qgpt-usage-label">Monthly usage</span>
                    <span class="qgpt-usage-value" data-qgpt="usage-value">0 / 5</span>
                </div>
                <div class="qgpt-usage-bar" data-qgpt="usage-bar" aria-hidden="true">
                    <div class="qgpt-usage-fill" data-qgpt="usage-fill"></div>
                </div>
                <p class="qgpt-usage-note" data-qgpt="usage-note">Upgrade for more answers each month.</p>
            </div>
            <div class="qgpt-section" data-qgpt="settings-section">
                <label class="qgpt-row" data-qgpt="row-highlight">
                    <span class="qgpt-row-label">Highlight answer</span>
                    <input type="checkbox" class="qgpt-toggle" data-qgpt="t-highlight"/>
                </label>
                <label class="qgpt-row" data-qgpt="row-autoclick">
                    <span class="qgpt-row-label">Auto-click</span>
                    <input type="checkbox" class="qgpt-toggle" data-qgpt="t-autoclick"/>
                </label>
                <label class="qgpt-row" data-qgpt="row-silent">
                    <span class="qgpt-row-label">Incognito mode</span>
                    <span class="qgpt-lock qgpt-lock--ultra" data-qgpt="lock-silent" style="display:none">${lockSvg} Ultra</span>
                    <input type="checkbox" class="qgpt-toggle" data-qgpt="t-silent"/>
                </label>
                <div class="qgpt-delay-row" data-qgpt="row-delay">
                    <span class="qgpt-delay-label">Delay</span>
                    <span class="qgpt-lock qgpt-lock--premium" data-qgpt="lock-delay" style="display:none">${lockSvg} Premium</span>
                    <input type="range" class="qgpt-delay-slider" data-qgpt="delay-slider" min="0" max="10" step="0.5" value="0"/>
                    <span class="qgpt-delay-value" data-qgpt="delay-value">0s</span>
                </div>
            </div>
            <div class="qgpt-status-section" data-qgpt="status-section">
                <div class="qgpt-status" data-qgpt="status" data-tone="idle">
                    <span class="qgpt-status-dot"></span>
                    <span class="qgpt-status-text" data-qgpt="status-text">Ready</span>
                </div>
            </div>

            <div class="qgpt-limit-overlay" data-qgpt="limit-overlay" hidden>
                <div class="qgpt-limit-backdrop" data-qgpt="limit-backdrop" aria-hidden="true"></div>
                <div class="qgpt-limit-popup" role="dialog" aria-modal="true" aria-label="Free limit reached">
                    <button type="button" class="qgpt-limit-close" data-qgpt="limit-close" aria-label="Close">&times;</button>
                    <div class="qgpt-limit-title">Free Limit Reached!</div>
                    <div class="qgpt-limit-copy">Upgrade to Premium now for more answers.</div>
                    <button type="button" class="qgpt-limit-upgrade" data-qgpt="limit-upgrade">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z"/>
                            <path d="M5 20h14"/>
                        </svg>
                        Upgrade to Premium
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(root);

    // Collapse/expand — capture + stop so Kahoot doesn't steal the event.
    // Use click only (not pointerdown): collapsing on pointerdown can make the
    // subsequent click land on the expand pill and immediately re-open the panel.
    const collapseBtn = root.querySelector('[data-qgpt="collapse"]');
    const expandPill = root.querySelector('.qgpt-pill');
    let collapseGuardUntil = 0;
    const onCollapse = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        collapseGuardUntil = Date.now() + 400;
        setCollapsed(true);
    };
    const onExpand = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (Date.now() < collapseGuardUntil) return;
        setCollapsed(false);
    };
    collapseBtn.addEventListener('click', onCollapse, true);
    expandPill.addEventListener('click', onExpand, true);

    // Free-limit overlay (GeoGPT-style)
    root.querySelector('[data-qgpt="limit-close"]')?.addEventListener('click', hideFreeLimitOverlay);
    root.querySelector('[data-qgpt="limit-backdrop"]')?.addEventListener('click', hideFreeLimitOverlay);
    root.querySelector('[data-qgpt="limit-upgrade"]')?.addEventListener('click', () => {
        openUpgrade();
    });

    // Sign-in button: ask the background service worker to open the extension popup,
    // falling back to opening the login page as a tab (both avoid the page's popup blocker).
    root.querySelector('[data-qgpt="signin-btn"]').addEventListener('click', () => {
        try {
            chrome.runtime.sendMessage({ action: 'openLoginPage' }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('[QuizGPT] openLoginPage failed:', chrome.runtime.lastError.message);
                }
            });
        } catch (_) { /* ignore */ }
    });

    // Toggles: highlight / autoclick
    const tHighlight = root.querySelector('[data-qgpt="t-highlight"]');
    tHighlight.addEventListener('change', () => {
        qgptState.settings.highlight = tHighlight.checked;
        chrome.storage.sync.set({ highlightOption: tHighlight.checked }).catch(() => {});
    });
    const tAutoclick = root.querySelector('[data-qgpt="t-autoclick"]');
    tAutoclick.addEventListener('change', () => {
        qgptState.settings.autoClick = tAutoclick.checked;
        chrome.storage.sync.set({ autoClickOption: tAutoclick.checked }).catch(() => {});
    });

    // Silent (Ultra-locked)
    const tSilent = root.querySelector('[data-qgpt="t-silent"]');
    tSilent.addEventListener('change', () => {
        if (tSilent.disabled) { tSilent.checked = false; return; }
        qgptState.settings.silentMode = tSilent.checked;
        chrome.storage.sync.set({ silentMode: tSilent.checked }).catch(() => {});
    });
    root.querySelector('[data-qgpt="row-silent"]').addEventListener('click', (e) => {
        if (isPlanUnlocked('ultra')) return;
        e.preventDefault();
        openUpgrade();
    });

    // Delay slider (Premium-locked)
    const slider = root.querySelector('[data-qgpt="delay-slider"]');
    const delayValue = root.querySelector('[data-qgpt="delay-value"]');
    slider.addEventListener('input', () => {
        if (slider.disabled) { slider.value = 0; delayValue.textContent = '0s'; return; }
        const v = parseFloat(slider.value);
        qgptState.settings.answerDelay = v;
        delayValue.textContent = `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}s`;
        chrome.storage.sync.set({ answerDelay: v }).catch(() => {});
    });
    root.querySelector('[data-qgpt="row-delay"]').addEventListener('click', (e) => {
        if (isPlanUnlocked('premium')) return;
        if (e.target === slider) return;
        e.preventDefault();
        openUpgrade();
    });

    qgptState.mounted = true;
    renderPanel();
    startUsagePolling();
}

function isPlanUnlocked(required) {
    const p = (qgptState.plan || 'free').toLowerCase();
    if (required === 'premium') return p === 'premium' || p === 'enterprise' || p === 'ultra';
    if (required === 'ultra') return p === 'enterprise' || p === 'ultra';
    return true;
}

function openUpgrade() {
    chrome.storage.sync.get(['token'], (data) => {
        const token = data.token;
        const url = token
            ? `https://quizgpt.site/pricing.html?token=${encodeURIComponent(token)}`
            : 'https://quizgpt.site/pricing.html';
        window.open(url, '_blank', 'noopener,noreferrer');
    });
}

function showFreeLimitOverlay({ force = false } = {}) {
    if (!QGPT_IS_TOP_FRAME) return;
    if (qgptState.settings.silentMode) return;
    if (qgptState.limitPopupDismissed && !force) return;
    ensurePanel(true);
    setCollapsed(false);
    const root = document.getElementById(QGPT_PANEL_ID);
    const overlay = root?.querySelector('[data-qgpt="limit-overlay"]');
    if (overlay) overlay.hidden = false;
}

function hideFreeLimitOverlay() {
    const root = document.getElementById(QGPT_PANEL_ID);
    const overlay = root?.querySelector('[data-qgpt="limit-overlay"]');
    if (overlay) overlay.hidden = true;
    qgptState.limitPopupDismissed = true;
}

function maybeShowFreeLimitFromState() {
    const plan = String(qgptState.plan || 'free').toLowerCase();
    const isFree = plan === 'free';
    const usage = Number(qgptState.usage || 0);
    const limit = Number(qgptState.limit || 5);
    if (isFree && limit > 0 && usage >= limit) {
        showFreeLimitOverlay();
        return;
    }
    // Not at limit — clear overlay without marking dismissed
    const root = document.getElementById(QGPT_PANEL_ID);
    const overlay = root?.querySelector('[data-qgpt="limit-overlay"]');
    if (overlay) overlay.hidden = true;
    qgptState.limitPopupDismissed = false;
}

function destroyPanel() {
    const root = document.getElementById(QGPT_PANEL_ID);
    if (root) root.remove();
    qgptState.mounted = false;
    stopUsagePolling();
}

function setCollapsed(collapsed) {
    qgptState.collapsed = !!collapsed;
    const root = document.getElementById(QGPT_PANEL_ID);
    if (root) root.setAttribute('data-collapsed', qgptState.collapsed ? 'true' : 'false');
    try {
        chrome.storage.local.set({ quizgptPanelCollapsed: qgptState.collapsed }).catch(() => {});
    } catch (_) {}
}

function renderPanel() {
    if (!qgptState.mounted) return;
    const root = document.getElementById(QGPT_PANEL_ID);
    if (!root) return;

    // Keep collapse attribute in sync even when only membership re-renders
    root.setAttribute('data-collapsed', qgptState.collapsed ? 'true' : 'false');

    const $ = (sel) => root.querySelector(`[data-qgpt="${sel}"]`);

    const name = qgptState.signedIn && qgptState.user && qgptState.user.username
        ? qgptState.user.username
        : 'QuizGPT';
    const nameEl = $('name');
    if (nameEl) nameEl.textContent = name;

    const planEl = $('plan');
    if (planEl) {
        if (qgptState.signedIn) {
            planEl.hidden = false;
            planEl.removeAttribute('hidden');
            planEl.textContent = formatPlanLabel(qgptState.plan);
            planEl.className = `qgpt-plan ${planClass(qgptState.plan)}`;
        } else {
            planEl.hidden = true;
        }
    }

    // Signed-out: show only the CTA, hide usage/settings/status
    const emptyState = $('empty-state');
    const usageSection = $('usage-section');
    const settingsSection = $('settings-section');
    const statusSection = $('status-section');

    if (!qgptState.signedIn) {
        if (emptyState) emptyState.style.display = '';
        if (usageSection) usageSection.style.display = 'none';
        if (settingsSection) settingsSection.style.display = 'none';
        if (statusSection) statusSection.style.display = 'none';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (usageSection) usageSection.style.display = '';
    if (settingsSection) settingsSection.style.display = '';
    if (statusSection) statusSection.style.display = '';

    // Usage — match extension bar + animate fill width
    const limit = qgptState.limit;
    const unlimited = !limit || limit > 9999;
    const usage = qgptState.usage || 0;
    const isPaid = isPaidPlanName(qgptState.plan);
    const pct = unlimited ? 0 : Math.min((usage / Math.max(limit, 1)) * 100, 100);
    const usageValue = $('usage-value');
    if (usageValue) usageValue.textContent = unlimited ? `${usage} / ∞` : `${usage} / ${limit}`;

    const fill = $('usage-fill');
    const bar = $('usage-bar');
    const note = $('usage-note');
    if (bar) {
        bar.classList.toggle('qgpt-usage-bar--limit', !isPaid && !unlimited && pct >= 90);
    }
    if (note) {
        if (isPaid || unlimited) {
            note.hidden = true;
        } else {
            note.hidden = false;
            note.textContent = pct >= 90
                ? 'Free limit nearly reached — upgrade for more answers.'
                : 'Upgrade for more answers each month.';
        }
    }
    if (fill) {
        const target = unlimited ? '0%' : `${pct}%`;
        const playIntro = !fill.dataset.qgptUsageReady;
        if (playIntro) {
            fill.dataset.qgptUsageReady = '1';
            fill.style.transition = 'none';
            fill.style.width = '0%';
            // Double rAF so the 0% paint lands before the animated width.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    fill.style.transition = '';
                    fill.style.width = target;
                });
            });
        } else {
            fill.style.width = target;
        }
    }

    // Toggles reflect current settings
    const tHighlight = $('t-highlight');
    const tAutoclick = $('t-autoclick');
    if (tHighlight) tHighlight.checked = !!qgptState.settings.highlight;
    if (tAutoclick) tAutoclick.checked = !!qgptState.settings.autoClick;

    // Silent (Ultra-locked)
    const silentUnlocked = isPlanUnlocked('ultra');
    const tSilent = $('t-silent');
    if (tSilent) {
        tSilent.checked = silentUnlocked ? !!qgptState.settings.silentMode : false;
        tSilent.disabled = !silentUnlocked;
    }
    const lockSilent = $('lock-silent');
    if (lockSilent) lockSilent.style.display = silentUnlocked ? 'none' : 'inline-flex';
    const rowSilent = $('row-silent');
    if (rowSilent) rowSilent.classList.toggle('qgpt-row--locked', !silentUnlocked);

    // Delay (Premium-locked)
    const delayUnlocked = isPlanUnlocked('premium');
    const slider = $('delay-slider');
    const delayValue = $('delay-value');
    const v = delayUnlocked ? (qgptState.settings.answerDelay || 0) : 0;
    if (slider) {
        slider.value = String(v);
        slider.disabled = !delayUnlocked;
    }
    if (delayValue) delayValue.textContent = `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}s`;
    const lockDelay = $('lock-delay');
    if (lockDelay) lockDelay.style.display = delayUnlocked ? 'none' : 'inline-flex';
    const rowDelay = $('row-delay');
    if (rowDelay) rowDelay.classList.toggle('qgpt-row--locked', !delayUnlocked);

    // Status
    const statusEl = $('status');
    if (statusEl) statusEl.setAttribute('data-tone', qgptState.statusTone || 'idle');
    const statusText = $('status-text');
    if (statusText) statusText.textContent = qgptState.status || 'Ready';

    maybeShowFreeLimitFromState();
}

async function loadPanelData() {
    // Only the top frame owns the on-page panel / membership UI
    if (!QGPT_IS_TOP_FRAME) return;

    const data = await new Promise(res =>
        chrome.storage.sync.get([
            'token', 'user',
            'highlightOption', 'autoClickOption', 'silentMode', 'answerDelay',
            'quizgptPanelCollapsed'
        ], res)
    );

    // Membership lives in local storage now (avoids sync write-quota storms)
    let membershipStatus = null;
    try {
        const local = await chrome.storage.local.get(['membershipStatus', 'quizgptPanelCollapsed']);
        membershipStatus = local.membershipStatus || null;
        if (typeof local.quizgptPanelCollapsed === 'boolean') {
            data.quizgptPanelCollapsed = local.quizgptPanelCollapsed;
        }
    } catch (_) { /* ignore */ }
    try {
        const syncMs = await chrome.storage.sync.get(['membershipStatus']);
        const syncMembership = syncMs.membershipStatus || null;
        if (!membershipStatus) {
            membershipStatus = syncMembership;
        } else if (syncMembership) {
            // Freshest snapshot wins (API free downgrade must beat stale paid sync)
            if ((syncMembership.updatedAt || 0) > (membershipStatus.updatedAt || 0)) {
                membershipStatus = syncMembership;
            }
        }
    } catch (_) { /* ignore */ }

    qgptState.user = data.user || null;
    qgptState.signedIn = !!data.token && !!data.user;
    qgptState.settings = {
        highlight: data.highlightOption !== false,
        autoClick: data.autoClickOption !== false,
        silentMode: !!data.silentMode,
        answerDelay: typeof data.answerDelay === 'number' ? data.answerDelay : 0
    };
    if (typeof data.quizgptPanelCollapsed === 'boolean') {
        qgptState.collapsed = data.quizgptPanelCollapsed;
    }
    if (membershipStatus) {
        applyMembershipState(membershipStatus, { source: 'loadPanelData' });
    }

    // Silent mode is authoritative: unmount if on, mount if off.
    if (qgptState.settings.silentMode) {
        destroyPanel();
    } else {
        whenBodyReady(() => {
            if (!qgptState.mounted) mountPanel();
            renderPanel();
        });
    }

    // Soft membership refresh via background only (never page-origin fetch — CORS)
    if (qgptState.signedIn) {
        scheduleUsageRefresh(400, { force: true });
    }
}

async function refreshMembership({ force = false } = {}) {
    if (!QGPT_IS_TOP_FRAME) return;
    try {
        const result = await new Promise((resolve) => {
            // MUST go through the service worker — content-script fetch from kahoot.it is CORS-blocked
            chrome.runtime.sendMessage({ action: 'getMembershipStatus', force }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response || { ok: false });
            });
        });

        if (!result.ok || !result.membership) {
            // Keep showing last known values from storage — don't blank the plan
            console.warn('[QuizGPT] refreshMembership failed (using cache if any):', result);
            return;
        }

        const ms = result.membership;
        if (!result.cached) console.log('[QuizGPT] refreshMembership:', ms);
        // Cached may still be stale free — only trust non-cached API for downgrades
        applyMembershipState(ms, {
            source: result.cached ? 'refresh-cached' : 'refresh',
            allowDowngrade: !result.cached
        });
        renderPanel();
    } catch (err) {
        console.warn('[QuizGPT] refreshMembership error:', err);
    }
}

// Debounced refresh — goes through background cache (min 60s / 429 backoff)
let qgptRefreshTimer = null;
let qgptMembershipFetchedOnce = false;
function scheduleUsageRefresh(delay = 800, { force = false } = {}) {
    if (qgptRefreshTimer) clearTimeout(qgptRefreshTimer);
    qgptRefreshTimer = setTimeout(() => {
        qgptRefreshTimer = null;
        refreshMembership({ force });
    }, delay);
}

// Slow poll only in the top frame — all_frames×10s was causing 429s
const QGPT_POLL_INTERVAL_MS = 90_000;
let qgptPollTimer = null;
function isTopFrame() {
    try { return window === window.top; } catch (_) { return true; }
}
function startUsagePolling() {
    if (!isTopFrame()) return;
    if (qgptPollTimer) return;
    qgptPollTimer = setInterval(() => {
        if (!qgptState.mounted || !qgptState.signedIn) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        refreshMembership({ force: false });
    }, QGPT_POLL_INTERVAL_MS);
    // One initial fetch after mount (cached if recent)
    if (!qgptMembershipFetchedOnce && qgptState.signedIn) {
        qgptMembershipFetchedOnce = true;
        scheduleUsageRefresh(500);
    }
}
function stopUsagePolling() {
    if (qgptPollTimer) {
        clearInterval(qgptPollTimer);
        qgptPollTimer = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && qgptState.mounted && qgptState.signedIn && isTopFrame()) {
        scheduleUsageRefresh(300);
    }
});

function ensurePanel(forceShow = false) {
    if (!QGPT_IS_TOP_FRAME) return false;
    if (qgptState.settings.silentMode && !forceShow) {
        destroyPanel();
        return false;
    }
    if (!document.body) return false;
    if (!qgptState.mounted) mountPanel();
    return true;
}

function deriveStatusTone(message) {
    const m = (message || '').toLowerCase();
    if (m.includes('error') || m.includes('invalid') || m.includes('auth error')) return 'error';
    if (m.includes('sending') || m.includes('highlight') || m.includes('detect') || m.includes('restored') || m.includes('looking') || m.includes('reconnect')) return 'busy';
    if (m.includes('sent') || m.includes('loaded') || m.includes('answer from')) return 'success';
    // Don't treat the idle label "Ready" specially via substring of other messages
    if (m === 'ready') return 'idle';
    return 'idle';
}

function updateStatus(message, forceShow = false) {
    console.log('[Content] Status:', message);
    qgptState.status = message;
    qgptState.statusTone = deriveStatusTone(message);

    chrome.storage.sync.get(['silentMode'], (settings) => {
        qgptState.settings.silentMode = !!settings.silentMode;
        if (settings.silentMode && !forceShow) {
            destroyPanel();
            return;
        }
        if (!document.body) {
            whenBodyReady(() => { ensurePanel(forceShow); renderPanel(); });
            return;
        }
        ensurePanel(forceShow);
        renderPanel();
    });
}

whenBodyReady(() => {
    chrome.storage.sync.get(['silentMode'], (settings) => {
        if (!settings.silentMode) mountPanel();
        loadPanelData();
    });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    // Membership updates from background (local) — keep Kahoot panel usage counter live
    if (changes.membershipStatus && (namespace === 'local' || namespace === 'sync')) {
        const ms = changes.membershipStatus.newValue;
        if (ms) {
            // Stale sync "free" must never wipe Ultra/Premium after a live refresh
            applyMembershipState(ms, { source: `storage.${namespace}` });
            if (qgptState.mounted) renderPanel();
        }
    }

    if (namespace === 'local' && changes.quizgptPanelCollapsed) {
        if (typeof changes.quizgptPanelCollapsed.newValue === 'boolean') {
            setCollapsed(changes.quizgptPanelCollapsed.newValue);
        }
    }

    if (namespace !== 'sync') return;

    const relevant = ['token', 'user', 'highlightOption', 'autoClickOption',
                      'silentMode', 'answerDelay'];
    if (!relevant.some(k => k in changes)) return;

    loadPanelData();
});

// Add this variable to track the last sent question
let lastSentQuestionHash = null;
let lastQuestionPayload = null;
let lastSentQuestionIndex = null;
let lastSentHadText = false;

function scrapeQuestionFromDom() {
    const titleSelectors = [
        '[data-functional-selector="question-title"]',
        '[data-functional-selector="block-title"]',
        '[data-functional-selector="question-title-text"]',
        '[data-functional-selector*="question-title"]',
        'h1[data-functional-selector]',
        '[class*="question-title"]'
    ];
    let title = null;
    for (const sel of titleSelectors) {
        const el = document.querySelector(sel);
        const text = el && el.textContent && el.textContent.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 2) continue;
        if (/^questions?\s*\d+$/i.test(text)) continue;
        title = text;
        break;
    }

    const choiceEls = findAnswerElements();
    const choices = choiceEls.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);

    if (!title || choices.length < 2) return null;
    return { title, choices };
}

// Listen for messages from the popup / background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Content] Received message:', request);
    if (request.action === "highlightAnswer") {
        const source = request.options?.source || 'ai';
        updateStatus('Highlighting answer...');
        highlightAnswer(request.answer, {
            ...request.options,
            questionIndex: request.questionIndex,
            answerText: request.answer,
            choiceIndex: request.choiceIndex
        }, 40, request.choiceIndex);
        // AI answers: background already bumps local usage; don't force another status poll immediately
        if (source === 'ai') scheduleUsageRefresh(8000, { force: false });
        sendResponse({ success: true });
    } else if (request.action === "clearAnsweredQuestion") {
        const msg = {
            source: 'quizgpt',
            type: 'clearAnsweredQuestion',
            questionIndex: request.questionIndex
        };
        try { window.postMessage(msg, '*'); } catch (_) { /* ignore */ }
        try { if (window.top) window.top.postMessage(msg, '*'); } catch (_) { /* ignore */ }
        sendResponse({ ok: true });
    } else if (request.action === "updateUsage") {
        // Prefer the membership snapshot from the background (instant live counter)
        if (request.membership && typeof request.membership === 'object') {
            applyMembershipState(request.membership, { source: 'updateUsage' });
            if (qgptState.mounted) renderPanel();
        }
        // Storage onChanged should also fire from local write; soft reconcile later
        scheduleUsageRefresh(6000, { force: false });
        sendResponse({ success: true });
    } else if (request.action === "getQuestion") {
        sendResponse({ question: currentQuestion });
    } else if (request.action === "showAuthError") {
        updateStatus('Auth error: ' + request.message, true); // Force show auth errors even in silent mode
        if (request.message.includes('free tier limit') || request.message.includes('Free tier limit')) {
            chrome.storage.sync.get(['silentMode'], (settings) => {
                if (!settings.silentMode) {
                    qgptState.limitPopupDismissed = false;
                    showFreeLimitOverlay({ force: true });
                }
            });
        } else {
            // Show regular error message only if not in silent mode
            chrome.storage.sync.get(['silentMode'], (settings) => {
                if (!settings.silentMode) {
                    const errorDiv = document.createElement('div');
                    errorDiv.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #ff4444;
                        color: white;
                        padding: 15px;
                        border-radius: 5px;
                        z-index: 9999;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    `;
                    errorDiv.textContent = request.message;
                    document.body.appendChild(errorDiv);
                    setTimeout(() => errorDiv.remove(), 5000);
                }
            });
        }
        sendResponse({ success: true });
    } else if (request.action === "checkStatus") {
        updateStatus('Status check requested');
        sendResponse({ 
            status: 'running', 
            currentQuestion: currentQuestion,
            timestamp: new Date().toISOString()
        });
    }
    return true;
});

window.addEventListener('kahootGameReset', (event) => {
    const soft = !!(event.detail && event.detail.soft);
    lastSentQuestionHash = null;
    if (!soft) {
        lastQuestionPayload = null;
        lastSentQuestionIndex = null;
        lastSentHadText = false;
        try { sessionStorage.removeItem('quizgpt_expect_reconnect'); } catch (_) { /* ignore */ }
        try {
            chrome.runtime.sendMessage({ action: 'resetGameState' }).catch(() => {});
        } catch (_) { /* ignore */ }
    }
    updateStatus(soft ? 'Reconnected…' : 'New game…');
});

// Listen for question events from the injected script
window.addEventListener('kahootQuestionParsed', (event) => {
    console.log('[Content] Received question event:', event.detail);
    updateStatus('Question detected');

    const question = { ...(event.detail || {}) };
    if (!question || typeof question.questionIndex !== 'number') {
        // Legacy full-text payloads without index: still allow if title+choices exist
        if (!question || !question.title || !Array.isArray(question.choices)) {
            console.error('[Content] Invalid question data:', question);
            updateStatus('Invalid question data');
            return;
        }
    }

    // If WS only sent an index, try scraping visible question text for AI
    if (!(question.title && Array.isArray(question.choices) && question.choices.length)) {
        const scraped = scrapeQuestionFromDom();
        if (scraped) {
            question.title = scraped.title;
            question.choices = scraped.choices;
            console.log('[Content] Scraped question from DOM:', scraped.title, scraped.choices.length);
        } else {
            // Choices often render a beat after QuestionStart — retry briefly
            setTimeout(() => {
                if (lastSentQuestionHash && lastQuestionPayload
                    && lastQuestionPayload.questionIndex === question.questionIndex
                    && lastQuestionPayload.title) {
                    return; // already got text
                }
                const late = scrapeQuestionFromDom();
                if (!late || typeof question.questionIndex !== 'number') return;
                const enriched = {
                    ...question,
                    title: late.title,
                    choices: late.choices
                };
                console.log('[Content] Late DOM scrape:', late.title);
                // Only allow a one-time text upgrade if we never sent text for this index
                if (!(lastSentQuestionIndex === question.questionIndex && lastSentHadText)) {
                    lastSentHadText = false;
                    window.dispatchEvent(new CustomEvent('kahootQuestionParsed', { detail: enriched }));
                }
            }, 600);
        }
    }

    const hasText = !!(question.title && Array.isArray(question.choices) && question.choices.length);
    const qIndex = typeof question.questionIndex === 'number' ? question.questionIndex : null;
    // Only a real reconnect may force a resend. GetReady fallback must not.
    const forceResend = !!question._reconnectAnswer
        && !(hasText && qIndex != null && qIndex === lastSentQuestionIndex && lastSentHadText);

    // Deduplicate by question index (not full hash):
    // - new index → always send
    // - same index, first time we get text → send (upgrade)
    // - same index, already sent with text → skip
    // - same index, index-only after a text send → skip
    const isNewIndex = qIndex == null || qIndex !== lastSentQuestionIndex;
    const isTextUpgrade = hasText && qIndex != null && qIndex === lastSentQuestionIndex && !lastSentHadText;
    const alreadyHandled = !isNewIndex && !isTextUpgrade && (
        lastSentHadText || (!hasText && lastSentQuestionIndex === qIndex)
    );
    const isDuplicate = !forceResend && alreadyHandled;

    if (hasText) {
        currentQuestion = {
            title: question.title,
            choices: question.choices
        };
    }

    if (!isDuplicate) {
        lastQuestionPayload = question;
        if (qIndex != null) lastSentQuestionIndex = qIndex;
        if (hasText) lastSentHadText = true;
        else if (isNewIndex) lastSentHadText = false;
        updateStatus(hasText ? 'Resolving answer...' : 'Waiting for question text...');
        chrome.runtime.sendMessage({
            action: 'processQuestion',
            question: question
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Content] Error sending message:', chrome.runtime.lastError);
                updateStatus('Error: ' + chrome.runtime.lastError.message);
            } else {
                console.log('[Content] Message sent successfully:', response);
                updateStatus(hasText ? 'Question sent' : 'Waiting for question text...');
            }
        });
    } else {
        console.log('[Content] Duplicate question detected, not sending again.', {
            qIndex,
            hasText,
            lastSentQuestionIndex,
            lastSentHadText
        });
        lastQuestionPayload = question;
    }

    if (hasText) {
        chrome.runtime.sendMessage({
            action: 'updateQuestion',
            question: {
                title: question.title,
                choices: question.choices
            }
        });
    }
});

function findAnswerElements() {
    const selectors = [
        '[data-functional-selector="answer-option"]',
        '[data-functional-selector^="question-choice"]',
        '[data-functional-selector*="answer-"]',
        '[data-functional-selector="answer"]',
        '[data-functional-selector="answer-button"]',
        'button[data-functional-selector*="answer"]',
        'button[data-functional-selector*="choice"]',
        '.answer-option',
        '.answer-button',
        '.answer',
        'button[class*="answer"]',
        '[class*="answer-button"]'
    ];
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length >= 2) {
            console.log('[Content] Found elements with selector:', selector, elements.length);
            return Array.from(elements);
        }
    }
    return [];
}

function applyHighlightStyles(correctElement) {
    if (correctElement.querySelector('.quizgpt-checkmark')) return;

    const checkmark = document.createElement('span');
    checkmark.className = 'quizgpt-checkmark';
    checkmark.textContent = '✅';
    checkmark.setAttribute('aria-hidden', 'true');
    checkmark.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'margin-left:8px',
        'font-size:1.15em',
        'line-height:1',
        'vertical-align:middle',
        'pointer-events:none',
        'user-select:none'
    ].join(';');
    correctElement.appendChild(checkmark);
}

function dispatchAutoClick(choiceIndex, questionIndex) {
    const choice = Number(choiceIndex);
    const qIndex = typeof questionIndex === 'number' ? questionIndex : undefined;

    if (Number.isNaN(choice) || choice < 0) {
        console.warn('[Content] Auto-click aborted — invalid choiceIndex', choiceIndex);
        return;
    }

    const msg = {
        source: 'quizgpt',
        type: 'autoClickAnswer',
        choice,
        questionIndex: qIndex,
        t: Date.now()
    };
    console.log('[Content] Auto-click by index:', choice, 'questionIndex:', qIndex);

    // Kahoot UI may live in an iframe while the WS hook is on the top page —
    // post to this frame, parent, and top.
    const targets = new Set([window]);
    try { if (window.parent) targets.add(window.parent); } catch (_) { /* cross-origin */ }
    try { if (window.top) targets.add(window.top); } catch (_) { /* cross-origin */ }
    targets.forEach((w) => {
        try { w.postMessage(msg, '*'); } catch (_) { /* ignore */ }
    });

    // DOM bridge fallback (shared across isolated worlds)
    try {
        let bridge = document.getElementById('quizgpt-click-bridge');
        if (!bridge) {
            bridge = document.createElement('div');
            bridge.id = 'quizgpt-click-bridge';
            bridge.style.display = 'none';
            (document.documentElement || document.body).appendChild(bridge);
        }
        // Force a mutation even if payload is identical
        bridge.removeAttribute('data-payload');
        bridge.setAttribute('data-payload', JSON.stringify(msg));
    } catch (_) { /* ignore */ }
}

function autoClickByIndex(choiceIndex, answerElements, options) {
    const answerDelay = typeof options.answerDelay === 'number' ? options.answerDelay : 0;
    const questionIndex = options.questionIndex;
    const fire = () => dispatchAutoClick(choiceIndex, questionIndex);

    if (answerDelay > 0 && !options.silentMode) {
        showTimerOverlay(answerDelay, fire);
    } else if (answerDelay > 0 && options.silentMode) {
        setTimeout(fire, answerDelay * 1000);
    } else {
        fire();
    }
}

// Function to highlight the correct answer (by choiceIndex and/or answer text)
function highlightAnswer(answer, options = {}, pollTries = 40, choiceIndex) {
    console.log('[Content] Highlighting answer:', answer, 'choiceIndex:', choiceIndex, 'options:', options);

    const answerElements = findAnswerElements();
    console.log('[Content] Found answer elements:', answerElements.length);

    // Prefer choice index (works when option text is hidden)
    if (typeof choiceIndex === 'number') {
        const byIndex = answerElements[choiceIndex] || null;

        if (options.highlight !== false && byIndex) {
            applyHighlightStyles(byIndex);
        }

        if (byIndex) {
            // Buttons are on screen — click now (with optional delay)
            if (options.autoClick !== false && !options._wsSubmitted) {
                options._wsSubmitted = true;
                waitAndAutoClick(byIndex, answerElements, {
                    ...options,
                    choiceIndex,
                    questionIndex: options.questionIndex
                });
            }
            return;
        }

        // No buttons yet: keep polling; WS-only fallback near the end
        if (pollTries > 0) {
            if (pollTries <= 5 && options.autoClick !== false && !options._wsSubmitted) {
                options._wsSubmitted = true;
                console.log('[Content] DOM buttons missing — WS-only click fallback');
                autoClickByIndex(choiceIndex, answerElements, options);
            }
            setTimeout(() => highlightAnswer(answer, options, pollTries - 1, choiceIndex), 200);
            return;
        }

        if (options.autoClick !== false && !options._wsSubmitted) {
            options._wsSubmitted = true;
            autoClickByIndex(choiceIndex, answerElements, options);
        }
        return;
    }

    if (answerElements.length === 0 && pollTries > 0) {
        setTimeout(() => highlightAnswer(answer, options, pollTries - 1, choiceIndex), 300);
        return;
    }

    if (answerElements.length === 0) {
        console.log('[Content] No matching answer element found (after polling)');
        return;
    }

    const answerLower = (answer || '').toLowerCase().trim();
    if (!answerLower) {
        console.log('[Content] No answer text and no choiceIndex');
        return;
    }

    let correctElement = null;
    let bestMatch = null;
    let bestMatchScore = 0;

    answerElements.forEach(element => {
        let text = element.textContent
            .toLowerCase()
            .trim()
            .replace(/icon/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (text.length >= 3) {
            const third = Math.floor(text.length / 3);
            const firstPart = text.substring(0, third);
            const secondPart = text.substring(third, third * 2);
            const thirdPart = text.substring(third * 2);
            if (firstPart === secondPart && secondPart === thirdPart) {
                text = firstPart;
            }
        }

        console.log('[Content] Checking answer element:', text);

        let score = 0;
        if (text === answerLower) {
            score = 100;
        } else if (text.includes(answerLower)) {
            score = 80;
        } else if (answerLower.includes(text)) {
            score = 60;
        } else {
            const words1 = text.split(/\s+/);
            const words2 = answerLower.split(/\s+/);
            const commonWords = words1.filter(word => words2.includes(word));
            score = (commonWords.length / Math.max(words1.length, words2.length)) * 40;
        }

        if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatch = element;
        }

        if (score === 100) {
            correctElement = element;
            console.log('[Content] Found exact match:', text);
        }
    });

    if (!correctElement && bestMatch && bestMatchScore >= 60) {
        correctElement = bestMatch;
        console.log('[Content] Using best match with score:', bestMatchScore);
    }

    if (correctElement) {
        console.log('[Content] Found matching answer element');
        if (options.highlight !== false) {
            applyHighlightStyles(correctElement);
        }
        if (options.autoClick !== false) {
            waitAndAutoClick(correctElement, answerElements, options);
        }
    } else {
        console.log('[Content] No matching answer element found');
    }
}

function simulateRealClick(element) {
    if (!element) return false;
    try {
        const opts = { bubbles: true, cancelable: true, view: window, composed: true };
        element.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }));
        element.dispatchEvent(new MouseEvent('mousedown', opts));
        element.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }));
        element.dispatchEvent(new MouseEvent('mouseup', opts));
        element.dispatchEvent(new MouseEvent('click', opts));
        if (typeof element.click === 'function') element.click();
        return true;
    } catch (err) {
        console.warn('[Content] simulateRealClick failed:', err);
        try { element.click(); return true; } catch (_) { return false; }
    }
}

// Hilfsfunktion für AutoClick mit Polling und Timer
function waitAndAutoClick(element, answerElements, options, retries = 20) {
    if (!element) return;

    const answerDelay = typeof options.answerDelay === 'number' ? options.answerDelay : 0;
    let choiceIndex = typeof options.choiceIndex === 'number'
        ? options.choiceIndex
        : Array.from(answerElements).indexOf(element);

    if ((typeof choiceIndex !== 'number' || choiceIndex < 0) && options.answerText) {
        const want = String(options.answerText).toLowerCase().trim();
        choiceIndex = answerElements.findIndex((el) => {
            const t = (el.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim();
            return t === want || t.includes(want) || want.includes(t);
        });
    }

    if (typeof choiceIndex !== 'number' || choiceIndex < 0) {
        console.warn('[Content] AutoClick: could not resolve choiceIndex');
        return;
    }

    const fire = () => {
        // DOM click + WS in parallel (no artificial delay).
        // Reconnect resend in injected.js covers socket swaps.
        const clicked = simulateRealClick(element);
        console.log('[Content] DOM click', clicked ? 'ok' : 'failed', 'choice', choiceIndex);
        dispatchAutoClick(choiceIndex, options.questionIndex);
    };

    if (!element.disabled && element.offsetParent !== null) {
        if (answerDelay > 0 && !options.silentMode) {
            showTimerOverlay(answerDelay, fire);
        } else if (answerDelay > 0 && options.silentMode) {
            setTimeout(fire, answerDelay * 1000);
        } else {
            fire();
        }
    } else if (retries > 0) {
        setTimeout(() => waitAndAutoClick(element, answerElements, options, retries - 1), 250);
    } else {
        console.warn('[Content] AutoClick: Button was never enabled — WS fallback');
        dispatchAutoClick(choiceIndex, options.questionIndex);
    }
}

// Timer Overlay Funktion
function showTimerOverlay(duration, callback) {
    // Entferne existierendes Timer-Overlay falls vorhanden
    const existingTimer = document.getElementById('quizgpt-timer-overlay');
    if (existingTimer) {
        existingTimer.remove();
    }

    // Timer Overlay erstellen
    const timerOverlay = document.createElement('div');
    timerOverlay.id = 'quizgpt-timer-overlay';
    timerOverlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, rgba(138, 43, 226, 0.95), rgba(218, 112, 214, 0.95));
        color: white;
        padding: 15px 20px;
        border-radius: 12px;
        z-index: 10000;
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        text-align: center;
        min-width: 180px;
        animation: slideIn 0.3s ease-out;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    `;

    // Timer Text
    const timerText = document.createElement('div');
    timerText.style.cssText = `
        margin-bottom: 8px;
        font-size: 13px;
        opacity: 0.9;
    `;
    timerText.textContent = 'Auto-clicking in';

    // Cancel hint
    const cancelHint = document.createElement('div');
    cancelHint.style.cssText = `
        font-size: 11px;
        opacity: 0.7;
        margin-bottom: 8px;
        cursor: pointer;
    `;
    cancelHint.textContent = '(Click to cancel)';

    // Countdown Display
    const countdownDisplay = document.createElement('div');
    countdownDisplay.style.cssText = `
        font-size: 24px;
        font-weight: 700;
        color: #fff;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    `;

    // Progress Bar
    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
        width: 100%;
        height: 3px;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
        margin-top: 10px;
        overflow: hidden;
    `;

    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
        height: 100%;
        background: #fff;
        border-radius: 2px;
        width: 100%;
        transition: width linear;
        transition-duration: ${duration}s;
    `;

    progressBar.appendChild(progressFill);
    timerOverlay.appendChild(timerText);
    timerOverlay.appendChild(cancelHint);
    timerOverlay.appendChild(countdownDisplay);
    timerOverlay.appendChild(progressBar);

    // CSS Animation für slide-in
    if (!document.querySelector('#quizgpt-timer-styles')) {
        const timerStyles = document.createElement('style');
        timerStyles.id = 'quizgpt-timer-styles';
        timerStyles.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            #quizgpt-timer-overlay:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 25px rgba(0, 0, 0, 0.4);
            }
        `;
        document.head.appendChild(timerStyles);
    }

    document.body.appendChild(timerOverlay);

    // Start Progress Bar Animation
    setTimeout(() => {
        progressFill.style.width = '0%';
    }, 100);

    // Countdown Logic
    let timeLeft = duration;
    countdownDisplay.textContent = timeLeft.toFixed(1);

    const countdownInterval = setInterval(() => {
        timeLeft -= 0.1;
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            
            // Slide out animation
            timerOverlay.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (timerOverlay.parentNode) {
                    timerOverlay.remove();
                }
                // Execute callback
                callback();
            }, 300);
        } else {
            countdownDisplay.textContent = timeLeft.toFixed(1);
        }
    }, 100);

    // Click to cancel
    timerOverlay.addEventListener('click', () => {
        clearInterval(countdownInterval);
        
        // Show canceled message briefly
        timerText.textContent = 'Auto-click canceled';
        cancelHint.style.display = 'none';
        countdownDisplay.textContent = '✕';
        progressFill.style.width = '0%';
        progressFill.style.background = '#ff6b6b';
        
        setTimeout(() => {
            timerOverlay.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (timerOverlay.parentNode) {
                    timerOverlay.remove();
                }
            }, 300);
        }, 800);
    });
}

// Add pulse animation to the styles
function appendStyleWhenReady(style) {
    if (document.head) {
        document.head.appendChild(style);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.head) document.head.appendChild(style);
        });
    }
}
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4);
        }
        70% {
            box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
        }
    }
`;
appendStyleWhenReady(style);

// Legacy name kept for any external callers
function showPremiumUpgradeMessage() {
    showFreeLimitOverlay();
}

// Silent mode tear-down (panel mount/destroy is handled by loadPanelData via the storage listener above).
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync' || !changes.silentMode) return;
    if (changes.silentMode.newValue) {
        const existingTimer = document.getElementById('quizgpt-timer-overlay');
        if (existingTimer) existingTimer.remove();
        const overlay = document.querySelector('#quizgpt-panel [data-qgpt="limit-overlay"]');
        if (overlay) overlay.hidden = true;
    }
});
