// Inject the WebSocket hook script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('scripts/injected.js');
script.onload = () => {
    console.log('[Content] Injected script loaded');
    script.remove(); // Clean up after injection
};
(document.head || document.documentElement).appendChild(script);

// Store the current question
let currentQuestion = null;

/* ------------------------------------------------------------------ */
/*  QuizGPT on-page panel                                             */
/* ------------------------------------------------------------------ */

const QGPT_PANEL_ID = 'quizgpt-panel';
const QGPT_STYLE_ID = 'quizgpt-panel-styles';
const QGPT_API_URL = 'https://api.quizgpt.site/api';

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
            width: 22px; height: 22px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px;
            cursor: pointer;
            color: #b0b0b0;
            transition: background .15s ease, color .15s ease;
            flex-shrink: 0;
        }
        #${QGPT_PANEL_ID} .qgpt-icon-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }

        #${QGPT_PANEL_ID} .qgpt-section { padding: 10px 12px; }
        #${QGPT_PANEL_ID} .qgpt-section + .qgpt-section { border-top: 1px solid rgba(255,255,255,0.05); }

        #${QGPT_PANEL_ID} .qgpt-usage-row {
            display: flex; justify-content: space-between; align-items: center;
            font-size: 11.5px; color: #bdbdbd; margin-bottom: 6px;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-label { font-weight: 500; }
        #${QGPT_PANEL_ID} .qgpt-usage-value { color: #fff; font-weight: 600; }
        #${QGPT_PANEL_ID} .qgpt-usage-bar {
            height: 5px; background: rgba(255,255,255,0.08);
            border-radius: 999px; overflow: hidden;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-fill {
            height: 100%;
            background: linear-gradient(90deg, #8A2BE2, #DA70D6);
            border-radius: 999px;
            transition: width .3s ease, background .2s ease;
        }
        #${QGPT_PANEL_ID} .qgpt-usage-fill--warn { background: linear-gradient(90deg, #ffa726, #ffb74d); }
        #${QGPT_PANEL_ID} .qgpt-usage-fill--danger { background: linear-gradient(90deg, #ff6b6b, #ff8e8e); }

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

        /* Toggle switch */
        #${QGPT_PANEL_ID} .qgpt-toggle {
            appearance: none;
            -webkit-appearance: none;
            margin: 0;
            width: 30px; height: 16px;
            background: #3a3a3a;
            border-radius: 999px;
            position: relative;
            cursor: pointer;
            transition: background .2s ease;
            flex-shrink: 0;
            border: none;
            outline: none;
        }
        #${QGPT_PANEL_ID} .qgpt-toggle::after {
            content: '';
            position: absolute;
            top: 2px; left: 2px;
            width: 12px; height: 12px;
            border-radius: 50%;
            background: #fff;
            transition: transform .2s ease;
            box-shadow: 0 1px 2px rgba(0,0,0,0.35);
        }
        #${QGPT_PANEL_ID} .qgpt-toggle:checked {
            background: linear-gradient(90deg, #8A2BE2, #DA70D6);
        }
        #${QGPT_PANEL_ID} .qgpt-toggle:checked::after { transform: translateX(14px); }
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
            transition: filter .15s ease, transform .15s ease;
            box-shadow: 0 4px 12px rgba(138,43,226,0.35);
        }
        #${QGPT_PANEL_ID} .qgpt-signin-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
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
    if (p === 'enterprise') return 'qgpt-plan--ultra';
    return `qgpt-plan--${p}`;
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
                <button class="qgpt-icon-btn" data-qgpt="collapse" title="Collapse">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
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
                    <span class="qgpt-usage-label">Usage</span>
                    <span class="qgpt-usage-value" data-qgpt="usage-value">0 / 5</span>
                </div>
                <div class="qgpt-usage-bar"><div class="qgpt-usage-fill" data-qgpt="usage-fill" style="width:0%"></div></div>
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
                    <span class="qgpt-row-label">Silent mode</span>
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
        </div>
    `;

    document.body.appendChild(root);

    // Collapse/expand
    root.querySelector('.qgpt-pill').addEventListener('click', () => setCollapsed(false));
    root.querySelector('[data-qgpt="collapse"]').addEventListener('click', () => setCollapsed(true));

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
        chrome.storage.sync.set({ highlightOption: tHighlight.checked });
    });
    const tAutoclick = root.querySelector('[data-qgpt="t-autoclick"]');
    tAutoclick.addEventListener('change', () => {
        qgptState.settings.autoClick = tAutoclick.checked;
        chrome.storage.sync.set({ autoClickOption: tAutoclick.checked });
    });

    // Silent (Ultra-locked)
    const tSilent = root.querySelector('[data-qgpt="t-silent"]');
    tSilent.addEventListener('change', () => {
        if (tSilent.disabled) { tSilent.checked = false; return; }
        qgptState.settings.silentMode = tSilent.checked;
        chrome.storage.sync.set({ silentMode: tSilent.checked });
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
        chrome.storage.sync.set({ answerDelay: v });
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
    try { chrome.storage.sync.set({ quizgptPanelCollapsed: qgptState.collapsed }); } catch (_) {}
}

function renderPanel() {
    if (!qgptState.mounted) return;
    const root = document.getElementById(QGPT_PANEL_ID);
    if (!root) return;

    const $ = (sel) => root.querySelector(`[data-qgpt="${sel}"]`);

    const name = qgptState.signedIn && qgptState.user && qgptState.user.username
        ? qgptState.user.username
        : 'QuizGPT';
    $('name').textContent = name;

    const planEl = $('plan');
    if (qgptState.signedIn) {
        planEl.hidden = false;
        planEl.textContent = formatPlanLabel(qgptState.plan);
        planEl.className = `qgpt-plan ${planClass(qgptState.plan)}`;
    } else {
        planEl.hidden = true;
    }

    // Signed-out: show only the CTA, hide usage/settings/status
    const emptyState = $('empty-state');
    const usageSection = $('usage-section');
    const settingsSection = $('settings-section');
    const statusSection = $('status-section');

    if (!qgptState.signedIn) {
        emptyState.style.display = '';
        usageSection.style.display = 'none';
        settingsSection.style.display = 'none';
        statusSection.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    usageSection.style.display = '';
    settingsSection.style.display = '';
    statusSection.style.display = '';

    // Usage
    const limit = qgptState.limit;
    const unlimited = !limit || limit > 9999;
    const usage = qgptState.usage || 0;
    $('usage-value').textContent = unlimited ? `${usage} / ∞` : `${usage} / ${limit}`;
    const fill = $('usage-fill');
    const pct = unlimited ? 0 : Math.min((usage / limit) * 100, 100);
    fill.style.width = `${pct}%`;
    fill.classList.remove('qgpt-usage-fill--warn', 'qgpt-usage-fill--danger');
    if (!unlimited) {
        if (pct >= 90) fill.classList.add('qgpt-usage-fill--danger');
        else if (pct >= 75) fill.classList.add('qgpt-usage-fill--warn');
    }

    // Toggles reflect current settings
    $('t-highlight').checked = !!qgptState.settings.highlight;
    $('t-autoclick').checked = !!qgptState.settings.autoClick;

    // Silent (Ultra-locked)
    const silentUnlocked = isPlanUnlocked('ultra');
    const tSilent = $('t-silent');
    tSilent.checked = silentUnlocked ? !!qgptState.settings.silentMode : false;
    tSilent.disabled = !silentUnlocked;
    $('lock-silent').style.display = silentUnlocked ? 'none' : 'inline-flex';
    $('row-silent').classList.toggle('qgpt-row--locked', !silentUnlocked);

    // Delay (Premium-locked)
    const delayUnlocked = isPlanUnlocked('premium');
    const slider = $('delay-slider');
    const delayValue = $('delay-value');
    const v = delayUnlocked ? (qgptState.settings.answerDelay || 0) : 0;
    slider.value = String(v);
    slider.disabled = !delayUnlocked;
    delayValue.textContent = `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}s`;
    $('lock-delay').style.display = delayUnlocked ? 'none' : 'inline-flex';
    $('row-delay').classList.toggle('qgpt-row--locked', !delayUnlocked);

    // Status
    const statusEl = $('status');
    statusEl.setAttribute('data-tone', qgptState.statusTone || 'idle');
    $('status-text').textContent = qgptState.status || 'Ready';
}

async function loadPanelData() {
    const data = await new Promise(res =>
        chrome.storage.sync.get([
            'token', 'user',
            'highlightOption', 'autoClickOption', 'silentMode', 'answerDelay',
            'quizgptPanelCollapsed', 'membershipStatus'
        ], res)
    );

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
    if (data.membershipStatus) {
        qgptState.plan = data.membershipStatus.planType || 'free';
        qgptState.usage = data.membershipStatus.usage ?? 0;
        qgptState.limit = data.membershipStatus.limit ?? 5;
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

    if (qgptState.signedIn) {
        refreshMembership(data.token);
    }
}

async function refreshMembership(token) {
    try {
        let t = token;
        if (!t) {
            const data = await new Promise(res => chrome.storage.sync.get(['token'], res));
            t = data.token;
        }
        if (!t) {
            console.log('[QuizGPT] refreshMembership: no token, skipping');
            return;
        }
        const r = await fetch(`${QGPT_API_URL}/membership/status`, {
            headers: { 'Authorization': `Bearer ${t}` }
        });
        if (!r.ok) {
            console.warn('[QuizGPT] refreshMembership: HTTP', r.status);
            return;
        }
        const data = await r.json();
        const ms = {
            planType: (data.plan_type || 'free').toLowerCase(),
            usage: data.usage ?? 0,
            limit: data.limit ?? 5,
            updatedAt: Date.now()
        };
        console.log('[QuizGPT] refreshMembership:', ms);
        qgptState.plan = ms.planType;
        qgptState.usage = ms.usage;
        qgptState.limit = ms.limit;
        try { chrome.storage.sync.set({ membershipStatus: ms }); } catch (_) {}
        renderPanel();
    } catch (err) {
        console.warn('[QuizGPT] refreshMembership error:', err);
    }
}

// Debounced refresh to avoid hammering the API during quick question bursts
let qgptRefreshTimer = null;
function scheduleUsageRefresh(delay = 400) {
    if (qgptRefreshTimer) clearTimeout(qgptRefreshTimer);
    qgptRefreshTimer = setTimeout(() => {
        qgptRefreshTimer = null;
        refreshMembership();
    }, delay);
}

// Periodic fallback: poll membership/status every 10s while the panel is mounted,
// the user is signed in, and the tab is visible. This keeps the usage bar in sync
// even if the explicit event-based refresh (background message, highlightAnswer)
// gets dropped for any reason.
const QGPT_POLL_INTERVAL_MS = 10000;
let qgptPollTimer = null;
function startUsagePolling() {
    if (qgptPollTimer) return;
    qgptPollTimer = setInterval(() => {
        if (!qgptState.mounted || !qgptState.signedIn) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        refreshMembership();
    }, QGPT_POLL_INTERVAL_MS);
}
function stopUsagePolling() {
    if (qgptPollTimer) {
        clearInterval(qgptPollTimer);
        qgptPollTimer = null;
    }
}

// Refresh immediately when the user returns to the tab after it was hidden
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && qgptState.mounted && qgptState.signedIn) {
        scheduleUsageRefresh(0);
    }
});

function ensurePanel(forceShow = false) {
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
    if (m.includes('sending') || m.includes('highlight') || m.includes('detect')) return 'busy';
    if (m.includes('sent') || m.includes('ready')) return 'success';
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
    if (namespace !== 'sync') return;

    const relevant = ['token', 'user', 'highlightOption', 'autoClickOption',
                      'silentMode', 'answerDelay', 'membershipStatus', 'quizgptPanelCollapsed'];
    if (!relevant.some(k => k in changes)) return;

    loadPanelData();
});

// Add this variable to track the last sent question
let lastSentQuestionHash = null;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Content] Received message:', request);
    if (request.action === "highlightAnswer") {
        updateStatus('Highlighting answer...');
        highlightAnswer(request.answer, request.options);
        // Backend has now consumed one request — refresh usage live
        scheduleUsageRefresh(1500);
        sendResponse({ success: true });
    } else if (request.action === "updateUsage") {
        // Background explicitly tells us to re-fetch membership/usage
        scheduleUsageRefresh(0);
        sendResponse({ success: true });
    } else if (request.action === "getQuestion") {
        sendResponse({ question: currentQuestion });
    } else if (request.action === "showAuthError") {
        updateStatus('Auth error: ' + request.message, true); // Force show auth errors even in silent mode
        if (request.message.includes('free tier limit') || request.message.includes('Free tier limit')) {
            chrome.storage.sync.get(['silentMode'], (settings) => {
                if (!settings.silentMode) {
                    showPremiumUpgradeMessage();
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

// Listen for question events from the injected script
window.addEventListener('kahootQuestionParsed', (event) => {
    console.log('[Content] Received question event:', event.detail);
    updateStatus('Question detected');
    
    // Validate question data
    const question = event.detail;
    if (!question || !question.title || !Array.isArray(question.choices)) {
        console.error('[Content] Invalid question data:', question);
        updateStatus('Invalid question data');
        return;
    }

    // Create a simple hash of the question (title + choices)
    const questionHash = JSON.stringify({
        title: question.title,
        choices: question.choices
    });

    // Store the current question
    currentQuestion = {
        title: question.title,
        choices: question.choices
    };

    // Nur wenn neu: an Backend schicken
    if (questionHash !== lastSentQuestionHash) {
        lastSentQuestionHash = questionHash;
        updateStatus('Sending question to backend...');
        chrome.runtime.sendMessage({
            action: 'processQuestion',
            question: question
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Content] Error sending message:', chrome.runtime.lastError);
                updateStatus('Error: ' + chrome.runtime.lastError.message);
            } else {
                console.log('[Content] Message sent successfully:', response);
                updateStatus('Question sent to backend');
                scheduleUsageRefresh(3000);
            }
        });
    } else {
        console.log('[Content] Duplicate question detected, not sending again.');
    }

    // Sende immer an Popup/UI (optional)
    chrome.runtime.sendMessage({
        action: 'updateQuestion',
        question: {
            title: question.title,
            choices: question.choices
        }
    });

    // Das Highlighting/AutoClick wird weiterhin durch highlightAnswer getriggert, sobald die Antwort vom Backend kommt.
});

// Function to highlight the correct answer
function highlightAnswer(answer, options = {}, pollTries = 30) {
    console.log('[Content] Highlighting answer:', answer, 'with options:', options);
    // Try different selectors to find answer elements
    const selectors = [
        '[data-functional-selector="answer-option"]',
        '.answer-option',
        '[data-functional-selector="answer"]',
        '.answer',
        '[data-functional-selector="answer-button"]',
        '.answer-button',
        'button[data-functional-selector*="answer"]',
        'button[class*="answer"]'
    ];
    let answerElements = [];
    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log('[Content] Found elements with selector:', selector, elements.length);
            answerElements = elements;
            break;
        }
    }
    console.log('[Content] Found answer elements:', answerElements.length);
    // --- NEU: Wenn keine Buttons gefunden, poll weiter ---
    if (answerElements.length === 0 && pollTries > 0) {
        setTimeout(() => highlightAnswer(answer, options, pollTries - 1), 300);
        return;
    }
    if (answerElements.length === 0) {
        console.log('[Content] No matching answer element found (after polling)');
        return;
    }
    // Convert answer to lowercase for comparison
    const answerLower = answer.toLowerCase().trim();
    
    // Find the matching answer element
    let correctElement = null;
    let bestMatch = null;
    let bestMatchScore = 0;
    
    answerElements.forEach(element => {
        // Get the text content and clean it up
        let text = element.textContent
            .toLowerCase()
            .trim()
            .replace(/icon/g, '') // Remove "icon" text
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();
            
        // Handle tripled text (e.g., "cpucpucpu" -> "cpu")
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
        
        // Calculate match score
        let score = 0;
        if (text === answerLower) {
            score = 100; // Exact match
        } else if (text.includes(answerLower)) {
            score = 80; // Contains the answer
        } else if (answerLower.includes(text)) {
            score = 60; // Answer contains the text
        } else {
            // Calculate similarity score
            const words1 = text.split(/\s+/);
            const words2 = answerLower.split(/\s+/);
            const commonWords = words1.filter(word => words2.includes(word));
            score = (commonWords.length / Math.max(words1.length, words2.length)) * 40;
        }
        
        if (score > bestMatchScore) {
            bestMatchScore = score;
            bestMatch = element;
        }
        
        // If we find an exact match, use it immediately
        if (score === 100) {
            correctElement = element;
            console.log('[Content] Found exact match:', text);
            return;
        }
    });
    
    // If no exact match was found, use the best match if it's good enough
    if (!correctElement && bestMatch && bestMatchScore >= 60) {
        correctElement = bestMatch;
        console.log('[Content] Using best match with score:', bestMatchScore);
    }
    
    if (correctElement) {
        console.log('[Content] Found matching answer element');
        
        // Highlight the answer if enabled
        if (options.highlight !== false) {
            // Add the old style highlighting
            correctElement.style.border = '2px solid black';
            correctElement.style.boxShadow = '0 0 10px 2px black';
            correctElement.style.borderRadius = '10px';
            correctElement.style.transition = 'all 0.3s ease-in-out';

            // Add pulsing animation
            correctElement.animate([
                { transform: 'scale(1)', boxShadow: '0 0 10px 2px black' },
                { transform: 'scale(1.05)', boxShadow: '0 0 15px 4px black' },
                { transform: 'scale(1)', boxShadow: '0 0 10px 2px black' }
            ], {
                duration: 1000,
                iterations: 8
            });

            // Add checkmark
            const checkmark = document.createElement('span');
            checkmark.textContent = ' ✅';
            checkmark.style.fontSize = '1.2em';
            checkmark.style.marginLeft = '8px';
            correctElement.appendChild(checkmark);
        }
        
        // Auto-click if enabled
        if (options.autoClick !== false) {
            // Statt setTimeout jetzt robustes Polling:
            waitAndAutoClick(correctElement, answerElements, options);
        }
    } else {
        console.log('[Content] No matching answer element found');
    }
}

// Hilfsfunktion für AutoClick mit Polling und Timer
function waitAndAutoClick(element, answerElements, options, retries = 20) {
    if (!element) return;
    
    const answerDelay = options.answerDelay !== undefined ? options.answerDelay : 3;
    
    // Prüfe, ob der Button klickbar ist
    if (!element.disabled && element.offsetParent !== null) {
        // Wenn der Button klickbar ist und Delay > 0, zeige Timer (außer in Silent Mode)
        if (answerDelay > 0 && !options.silentMode) {
            showTimerOverlay(answerDelay, () => {
                // Callback nach Ablauf des Timers
                const index = Array.from(answerElements).indexOf(element);
                console.log('[Content] Clicking answer at index:', index, 'after', answerDelay, 'seconds delay');
                const event = new CustomEvent("autoClickAnswer", { detail: index });
                window.dispatchEvent(event);
            });
        } else if (answerDelay > 0 && options.silentMode) {
            // Silent mode: nur Delay ohne Timer-Overlay
            setTimeout(() => {
                const index = Array.from(answerElements).indexOf(element);
                console.log('[Content] Clicking answer at index:', index, 'after', answerDelay, 'seconds delay (silent mode)');
                const event = new CustomEvent("autoClickAnswer", { detail: index });
                window.dispatchEvent(event);
            }, answerDelay * 1000);
        } else {
            // Sofortiger Click ohne Delay
            const index = Array.from(answerElements).indexOf(element);
            console.log('[Content] Clicking answer at index:', index, 'immediately');
            const event = new CustomEvent("autoClickAnswer", { detail: index });
            window.dispatchEvent(event);
        }
    } else if (retries > 0) {
        setTimeout(() => waitAndAutoClick(element, answerElements, options, retries - 1), 2000);
    } else {
        console.warn('[Content] AutoClick: Button was never enabled.');
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

// Function to show premium upgrade message
function showPremiumUpgradeMessage() {
    // Create message container
    const container = document.createElement('div');
    container.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 9999;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    `;

    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Free Tier Limit Reached';
    title.style.cssText = `
        color: #ff4444;
        margin: 0 0 15px 0;
        font-size: 24px;
    `;
    container.appendChild(title);

    // Add message
    const message = document.createElement('p');
    message.textContent = 'You have used all 5 free quiz attempts. Upgrade to premium for unlimited access!';
    message.style.cssText = `
        margin: 0 0 20px 0;
        font-size: 16px;
        line-height: 1.5;
    `;
    container.appendChild(message);

    // Add upgrade button
    const button = document.createElement('button');
    button.textContent = 'Upgrade to Premium';
    button.style.cssText = `
        background: #4CAF50;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        font-size: 16px;
        cursor: pointer;
        transition: background 0.3s;
    `;
    button.onmouseover = () => button.style.background = '#45a049';
    button.onmouseout = () => button.style.background = '#4CAF50';
    button.onclick = () => {
        window.open('https://quizgpt.ch/premium', '_blank');
        container.remove();
    };
    container.appendChild(button);

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = '×';
    closeButton.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
    `;
    closeButton.onclick = () => container.remove();
    container.appendChild(closeButton);

    // Add to page
    document.body.appendChild(container);

    // Add overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9998;
    `;
    overlay.onclick = () => {
        container.remove();
        overlay.remove();
    };
    document.body.appendChild(overlay);
}

// Silent mode tear-down (panel mount/destroy is handled by loadPanelData via the storage listener above).
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync' || !changes.silentMode) return;
    if (changes.silentMode.newValue) {
        const existingTimer = document.getElementById('quizgpt-timer-overlay');
        if (existingTimer) existingTimer.remove();
    }
});
