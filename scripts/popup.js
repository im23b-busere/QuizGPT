import { authService } from './auth.js';

// DOM Elements
const usernameElement = document.getElementById('username');
const userProfile = document.getElementById('userProfile');
const mainContent = document.getElementById('mainContent');
const shell = document.getElementById('shell');
const settingsButton = document.getElementById('btn-settings');
const highlightSwitch = document.getElementById('highlight');
const autoclickSwitch = document.getElementById('autoclick');
const silentModeSwitch = document.getElementById('silentMode');
const answerDelaySlider = document.getElementById('answerDelay');
const delayValueDisplay = document.getElementById('delayValue');
const logoutButton = document.getElementById('logoutButton');
const upgradeButton = document.getElementById('upgradeButton');
const homeUpgradeButton = document.getElementById('homeUpgradeButton');
const manageSubscriptionButton = document.getElementById('manageSubscriptionButton');

function isSwitchOn(el) {
    return !!el && el.dataset.on === '1';
}

function setSwitchOn(el, on) {
    if (!el) return;
    el.dataset.on = on ? '1' : '0';
}

function setSettingsOpen(open) {
    if (!shell || !settingsButton) return;
    shell.dataset.view = open ? 'settings' : 'home';
    settingsButton.dataset.open = open ? '1' : '0';
    settingsButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    settingsButton.title = open ? 'Close settings' : 'Settings';
}

// Check authentication and load user data
async function checkAuth() {
    try {
        const authData = await authService.loadAuthData();
        console.log('Auth data:', authData); // Debug log
        
        if (!authData.isLoggedIn) {
            window.location.href = 'login.html';
            return;
        }

        // Display username
        if (authData.user && authData.user.username) {
            console.log('Setting username:', authData.user.username);
            usernameElement.textContent = authData.user.username;
        } else {
            console.log('No username found in auth data');
            usernameElement.textContent = 'User Account';
        }

        // Load main content
        loadMainContent();
        initializeEventListeners();
        
        // Fetch and display membership — always hit the API on popup open so plan
        // changes (e.g. admin/MySQL downgrade) aren't stuck behind the SW cache
        await updateMembershipStatus({ force: true });
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = 'login.html';
    }
}

// Load main content
function loadMainContent() {
    mainContent.innerHTML = `
        <a class="geogpt-promo" href="https://guessrgpt.com" target="_blank" rel="noopener noreferrer"
           aria-label="Try the GeoGuessr Hack">
            <span class="geogpt-promo-icon" aria-hidden="true">
                <img src="../icons/geogpt-logo.png" alt="">
            </span>
            <span class="geogpt-promo-copy">
                <strong>Try the <span class="geoguessr-text">GeoGuessr</span> Hack!</strong>
                <span>Use GeoGPT to troll your friends</span>
            </span>
            <span class="geogpt-promo-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M5 12h14"/>
                    <path d="m13 6 6 6-6 6"/>
                </svg>
            </span>
        </a>
    `;
}

// Initialize event listeners
function initializeEventListeners() {
    // Settings panel slide (GeoGPT-style)
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            const open = shell?.dataset.view !== 'settings';
            setSettingsOpen(open);
        });
    }

    // Load settings
    chrome.storage.sync.get(['highlightOption', 'autoClickOption', 'answerDelay', 'silentMode'], (settings) => {
        if (highlightSwitch) {
            setSwitchOn(highlightSwitch, settings.highlightOption !== false);
        }
        if (autoclickSwitch) {
            setSwitchOn(autoclickSwitch, settings.autoClickOption !== false);
        }
        if (silentModeSwitch) {
            setSwitchOn(silentModeSwitch, !!settings.silentMode);
        }
        if (answerDelaySlider && settings.answerDelay !== undefined) {
            answerDelaySlider.value = settings.answerDelay;
            if (delayValueDisplay) {
                delayValueDisplay.textContent = settings.answerDelay;
            }
        } else if (answerDelaySlider) {
            // Default value is 0 seconds
            answerDelaySlider.value = 0;
            if (delayValueDisplay) {
                delayValueDisplay.textContent = "0";
            }
        }
    });

    // Toggle switches
    if (highlightSwitch) {
        highlightSwitch.addEventListener('click', async () => {
            const next = !isSwitchOn(highlightSwitch);
            setSwitchOn(highlightSwitch, next);
            await chrome.storage.sync.set({ highlightOption: next });
        });
    }

    if (autoclickSwitch) {
        autoclickSwitch.addEventListener('click', async () => {
            const next = !isSwitchOn(autoclickSwitch);
            setSwitchOn(autoclickSwitch, next);
            await chrome.storage.sync.set({ autoClickOption: next });
        });
    }

    if (silentModeSwitch) {
        silentModeSwitch.addEventListener('click', async () => {
            const row = document.getElementById('row-incognito');
            if (row?.dataset.locked === '1') return;
            const next = !isSwitchOn(silentModeSwitch);
            setSwitchOn(silentModeSwitch, next);
            await chrome.storage.sync.set({ silentMode: next });
        });
    }

    // Answer delay slider change handler
    if (answerDelaySlider) {
        answerDelaySlider.addEventListener('input', async () => {
            // Check if user has permission to use this feature
            if (answerDelaySlider.disabled) {
                answerDelaySlider.value = 0;
                if (delayValueDisplay) {
                    delayValueDisplay.textContent = "0";
                }
                return;
            }
            
            const value = answerDelaySlider.value;
            if (delayValueDisplay) {
                delayValueDisplay.textContent = value;
            }
            await chrome.storage.sync.set({ answerDelay: parseFloat(value) });
        });
    }

    // Logout button click handler
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await authService.logout();
            window.location.href = 'login.html';
        });
    }

    // Upgrade button click handlers (home card + settings)
    const openPricing = async () => {
        let token = authService.token;
        if (!token) {
            const data = await chrome.storage.sync.get(['token']);
            token = data.token;
        }
        if (!token) {
            alert('You must be logged in to upgrade.');
            return;
        }
        window.open(`https://quizgpt.site/pricing.html?token=${encodeURIComponent(token)}`, '_blank');
    };
    if (upgradeButton) upgradeButton.addEventListener('click', openPricing);
    if (homeUpgradeButton) homeUpgradeButton.addEventListener('click', openPricing);

    // Manage subscription button click handler
    if (manageSubscriptionButton) {
        manageSubscriptionButton.addEventListener('click', async () => {
            try {
                console.log('Manage subscription button clicked');
                
                // Get auth token
                let token = authService.token;
                if (!token) {
                    // Try to load from chrome.storage
                    const data = await chrome.storage.sync.get(['token']);
                    token = data.token;
                }
                if (!token) {
                    alert('You must be logged in to manage your subscription.');
                    return;
                }

                console.log('Creating portal session...');

                // Create portal session
                const response = await fetch('https://api.quizgpt.site/api/stripe/create-portal-session', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                console.log('Portal session response status:', response.status);

                if (!response.ok) {
                    const errorData = await response.json();
                    console.log('Portal session error:', errorData);
                    
                    // If the error is about missing subscription, try to sync customer ID first
                    if (errorData.message === 'No subscription found for this user.') {
                        console.log('Attempting to sync customer ID...');
                        
                        const syncResponse = await fetch('https://api.quizgpt.site/api/stripe/sync-customer-id', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });

                        console.log('Sync response status:', syncResponse.status);

                        if (syncResponse.ok) {
                            const syncData = await syncResponse.json();
                            console.log('Customer ID synced successfully:', syncData);
                            
                            // Retry creating portal session
                            const retryResponse = await fetch('https://api.quizgpt.site/api/stripe/create-portal-session', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            });

                            console.log('Retry response status:', retryResponse.status);

                            if (retryResponse.ok) {
                                const data = await retryResponse.json();
                                console.log('Portal session created successfully:', data.url);
                                window.open(data.url, '_blank');
                                return;
                            } else {
                                const retryErrorData = await retryResponse.json();
                                console.error('Retry failed:', retryErrorData);
                                throw new Error(retryErrorData.message || retryErrorData.details || 'Failed to create portal session after sync');
                            }
                        } else {
                            const syncErrorData = await syncResponse.json();
                            console.error('Sync failed:', syncErrorData);
                            throw new Error(syncErrorData.message || 'Failed to sync customer ID');
                        }
                    }
                    
                    // Show detailed error message from backend
                    const errorMessage = errorData.details || errorData.message || 'Failed to create portal session';
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                console.log('Portal session created successfully:', data.url);
                
                // Open the portal URL
                window.open(data.url, '_blank');
            } catch (error) {
                console.error('Error creating portal session:', error);
                
                // Fallback: Ask user if they want to go to Stripe dashboard
                const fallback = confirm(
                    'Error: ' + error.message + 
                    '\n\nWould you like to go to the Stripe dashboard instead?'
                );
                
                if (fallback) {
                    window.open('https://dashboard.stripe.com/billing', '_blank');
                }
            }
        });
    }
}

// Function to fetch and update membership status (via background cache — avoids 429)
async function updateMembershipStatus({ force = false } = {}) {
    try {
        console.log('Fetching membership status...', force ? '(force)' : '');

        const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getMembershipStatus', force }, (response) => {
                if (chrome.runtime.lastError) {
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response || { ok: false });
            });
        });

        let planType = 'free';
        let usage = 0;
        let limit = 5;

        if (result.ok && result.membership) {
            planType = result.membership.planType || 'free';
            usage = result.membership.usage ?? 0;
            limit = result.membership.limit ?? 5;
        } else {
            console.warn('Membership fetch failed, using storage cache:', result);
            const local = await chrome.storage.local.get(['membershipStatus']).catch(() => ({}));
            const sync = await chrome.storage.sync.get(['membershipStatus']).catch(() => ({}));
            const a = local.membershipStatus;
            const b = sync.membershipStatus;
            let ms = a || b;
            if (a && b) {
                // Freshest snapshot wins (don't keep stale paid over a newer free)
                ms = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
            }
            if (!ms) {
                console.error('No cached membership status available');
                return;
            }
            planType = ms.planType || 'free';
            usage = ms.usage ?? 0;
            limit = ms.limit ?? 5;
        }

        console.log('Plan type:', planType);

        const planKey = planType.toLowerCase();
        const displayText = planKey === 'enterprise' || planKey === 'ultra'
            ? 'Ultra'
            : planKey.charAt(0).toUpperCase() + planKey.slice(1);
        const badgeMod =
            planKey === 'premium' ? 'premium'
            : (planKey === 'enterprise' || planKey === 'ultra') ? 'enterprise'
            : 'free';

        document.querySelectorAll('.plan-badge').forEach((planBadge) => {
            planBadge.textContent = displayText;
            planBadge.className = `plan-badge ${badgeMod}`;
        });

        const homeCard = document.getElementById('userProfile');
        if (homeCard) {
            homeCard.classList.toggle('user-card--premium', badgeMod === 'premium');
            homeCard.classList.toggle('user-card--ultra', badgeMod === 'enterprise');
        }

        const isPaid = planKey === 'premium' || planKey === 'enterprise' || planKey === 'ultra';
        if (isPaid) {
            if (upgradeButton) upgradeButton.hidden = true;
            if (homeUpgradeButton) homeUpgradeButton.hidden = true;
            if (manageSubscriptionButton) {
                manageSubscriptionButton.hidden = false;
                manageSubscriptionButton.classList.remove('hidden');
            }
        } else {
            if (upgradeButton) upgradeButton.hidden = false;
            if (homeUpgradeButton) homeUpgradeButton.hidden = false;
            if (manageSubscriptionButton) {
                manageSubscriptionButton.hidden = true;
                manageSubscriptionButton.classList.add('hidden');
            }
        }

        const usageCount = document.getElementById('usage-count');
        const usageFill = document.getElementById('usage-fill');
        const usageBar = document.getElementById('usage-bar');
        const usageNote = document.getElementById('usage-note');
        const usageLabel = document.getElementById('usage-label');
        const progressPercentage = Math.min((usage / Math.max(limit, 1)) * 100, 100);

        if (usageCount) {
            usageCount.textContent = limit > 9999 ? `${usage} / ∞` : `${usage} / ${limit}`;
        }
        if (usageFill) {
            usageFill.style.width = limit > 9999 ? '0%' : `${progressPercentage}%`;
        }
        if (usageBar) {
            usageBar.classList.toggle('usage-bar--limit', !isPaid && progressPercentage >= 90);
        }
        if (usageLabel) {
            usageLabel.textContent = 'Monthly usage';
        }
        if (usageNote) {
            if (isPaid) {
                usageNote.hidden = true;
            } else {
                usageNote.hidden = false;
                usageNote.textContent = progressPercentage >= 90
                    ? 'Free limit nearly reached — upgrade for more answers.'
                    : 'Upgrade for more answers each month.';
            }
        }

        updatePremiumLocks(planType);
        console.log('Membership status updated successfully');
    } catch (error) {
        console.error('Error updating membership status:', error);
    }
}

// Function to update premium locks based on user plan
function updatePremiumLocks(planType) {
    console.log('Updating premium locks for plan:', planType);

    const plan = planType.toLowerCase();
    const silentModeRow = document.getElementById('row-incognito')
        || document.querySelector('[data-plan="ultra"]');
    const answerDelayRow = document.getElementById('row-delay')
        || document.querySelector('[data-plan="premium"]');
    const silentModeSwitchEl = document.getElementById('silentMode');
    const answerDelaySliderEl = document.getElementById('answerDelay');

    // Incognito Mode (Ultra/Enterprise)
    if (silentModeRow && silentModeSwitchEl) {
        const hasUltraAccess = plan === 'enterprise' || plan === 'ultra';
        if (hasUltraAccess) {
            silentModeRow.dataset.locked = '0';
            silentModeRow.classList.remove('premium-locked');
            console.log('Incognito mode unlocked for Ultra/Enterprise user');
        } else {
            silentModeRow.dataset.locked = '1';
            silentModeRow.classList.add('premium-locked');
            setSwitchOn(silentModeSwitchEl, false);
            chrome.storage.sync.set({ silentMode: false });
            console.log('Incognito mode locked - requires Ultra');
        }
    }

    // Answer Delay (Premium+)
    if (answerDelayRow && answerDelaySliderEl) {
        const hasPremiumAccess = plan === 'premium' || plan === 'enterprise' || plan === 'ultra';
        if (hasPremiumAccess) {
            answerDelayRow.dataset.locked = '0';
            answerDelayRow.classList.remove('premium-locked');
            answerDelaySliderEl.disabled = false;
            console.log('Answer delay unlocked for Premium+ user');
        } else {
            answerDelayRow.dataset.locked = '1';
            answerDelayRow.classList.add('premium-locked');
            answerDelaySliderEl.disabled = true;
            answerDelaySliderEl.value = 0;
            const delayVal = document.getElementById('delayValue');
            if (delayVal) delayVal.textContent = '0';
            chrome.storage.sync.set({ answerDelay: 0 });
            console.log('Answer delay locked - requires Premium');
        }
    }

    addLockedFeatureClickHandlers(plan);
}

// Attach upgrade-prompt handlers once; never clone rows (that destroyed switch listeners).
function addLockedFeatureClickHandlers(plan) {
    const silentModeRow = document.getElementById('row-incognito')
        || document.querySelector('[data-plan="ultra"]');
    const answerDelayRow = document.getElementById('row-delay')
        || document.querySelector('[data-plan="premium"]');

    if (silentModeRow) {
        silentModeRow.dataset.currentPlan = plan;
        if (!silentModeRow.dataset.upgradeHandlerAttached) {
            silentModeRow.addEventListener('click', (e) => {
                const p = silentModeRow.dataset.currentPlan || 'free';
                if (p === 'enterprise' || p === 'ultra') return;
                if (silentModeRow.dataset.locked !== '1') return;
                e.preventDefault();
                e.stopPropagation();
                showUpgradePrompt('Ultra', 'Incognito mode is an Ultra exclusive feature that hides all overlays for a cleaner experience.');
            });
            silentModeRow.dataset.upgradeHandlerAttached = 'true';
        }
    }

    if (answerDelayRow) {
        answerDelayRow.dataset.currentPlan = plan;
        if (!answerDelayRow.dataset.upgradeHandlerAttached) {
            answerDelayRow.addEventListener('click', (e) => {
                const p = answerDelayRow.dataset.currentPlan || 'free';
                if (p === 'premium' || p === 'enterprise' || p === 'ultra') return;
                if (answerDelayRow.dataset.locked !== '1') return;
                if (e.target?.closest?.('input[type="range"]')) return;
                e.preventDefault();
                e.stopPropagation();
                showUpgradePrompt('Premium', 'Answer delay is a Premium feature that lets you customize the timing for a more natural experience.');
            });
            answerDelayRow.dataset.upgradeHandlerAttached = 'true';
        }
    }
}

// Function to show upgrade prompts
function showUpgradePrompt(requiredPlan, featureDescription) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10001;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: #23232b;
        color: #fff;
        padding: 24px;
        border-radius: 12px;
        max-width: 350px;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;
    
    modalContent.innerHTML = `
        <h3 style="margin-top: 0; color: #fff;">🔒 ${requiredPlan} Feature</h3>
        <p style="margin: 16px 0; color: #ccc; line-height: 1.4;">${featureDescription}</p>
        <div style="display: flex; gap: 12px; margin-top: 20px;">
            <button id="upgradeNow" style="
                flex: 1;
                background: linear-gradient(90deg, #8A2BE2 0%, #DA70D6 100%);
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 10px;
                cursor: pointer;
                font-weight: 600;
                letter-spacing: 0.03em;
                -webkit-font-smoothing: antialiased;
            ">Upgrade Now</button>
            <button id="closePremiumPrompt" style="
                flex: 1;
                background: #444;
                color: #fff;
                border: none;
                border-radius: 6px;
                padding: 10px;
                cursor: pointer;
            ">Later</button>
        </div>
    `;
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Add event listeners
    modal.querySelector('#upgradeNow').addEventListener('click', () => {
        let token = authService.token;
        if (!token) {
            chrome.storage.sync.get(['token']).then(data => {
                token = data.token;
                if (token) {
                    window.open(`https://quizgpt.site/pricing.html?token=${encodeURIComponent(token)}`, '_blank');
                }
            });
        } else {
            window.open(`https://quizgpt.site/pricing.html?token=${encodeURIComponent(token)}`, '_blank');
        }
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#closePremiumPrompt').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Listen for refreshMembership message from success page
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refreshMembership") {
    authService.loadAuthData().then(async () => {
      try {
        await updateMembershipStatus({ force: true });
        const planBadge = document.querySelector('.plan-badge');
        if (planBadge && planBadge.textContent.toLowerCase() === 'premium') {
          alert('Thank you for purchasing QuizGPT Premium! Have fun 🎉');
        }
      } catch (e) {
        console.error('Error refreshing membership:', e);
        alert('Thank you for purchasing QuizGPT Premium! Have fun 🎉');
      }
    });
  }

  if (request.action === "updateUsage") {
    // Storage optimistic bump already updated UI; soft refresh via cache
    updateMembershipStatus({ force: false });
  }
});

// Listen for free limit reached message from background/content
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'showAuthError' && request.message && request.message.toLowerCase().includes('free tier limit')) {
        chrome.storage.sync.set({ freeLimitReached: true });
    }
    return true;
});

// Show free limit modal on popup open if needed
window.addEventListener('DOMContentLoaded', async () => {
    const freeLimitModal = document.getElementById('freeLimitModal');
    const freeLimitUpgradeBtn = document.getElementById('freeLimitUpgradeBtn');
    const freeLimitCloseBtn = document.getElementById('freeLimitCloseBtn');
    if (freeLimitModal && freeLimitUpgradeBtn && freeLimitCloseBtn) {
        const closeFreeLimitModal = () => {
            freeLimitModal.hidden = true;
        };
        const openFreeLimitModal = () => {
            freeLimitModal.hidden = false;
        };

        try {
            // Reuse cached membership from checkAuth's updateMembershipStatus — no second /status call
            const local = await chrome.storage.local.get(['membershipStatus']).catch(() => ({}));
            const sync = await chrome.storage.sync.get(['membershipStatus']).catch(() => ({}));
            const a = local.membershipStatus;
            const b = sync.membershipStatus;
            let ms = a || b;
            if (a && b) {
                // Freshest snapshot wins (don't keep stale paid over a newer free)
                ms = (a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b;
            }
            if (ms) {
                const planType = (ms.planType || 'free').toLowerCase();
                const usage = ms.usage ?? 0;
                const limit = ms.limit ?? 5;
                if (planType === 'free' && usage >= limit) {
                    openFreeLimitModal();
                }
            }
        } catch (error) {
            // ignore — modal is best-effort
        }

        freeLimitUpgradeBtn.onclick = async () => {
            let token = authService.token;
            if (!token) {
                const data = await chrome.storage.sync.get(['token']);
                token = data.token;
            }
            if (!token) {
                alert('You must be logged in to upgrade.');
                return;
            }
            window.open(`https://quizgpt.site/pricing.html?token=${encodeURIComponent(token)}`, '_blank');
        };
        freeLimitCloseBtn.onclick = closeFreeLimitModal;
        freeLimitModal.querySelector('[data-qgpt-limit-dismiss]')?.addEventListener('click', closeFreeLimitModal);
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', checkAuth);

// Global debug function for testing Stripe integration
window.debugStripe = async () => {
    try {
        console.log('=== Stripe Debug Test ===');
        
        // Get auth token
        let token = authService.token;
        if (!token) {
            const data = await chrome.storage.sync.get(['token']);
            token = data.token;
        }
        
        if (!token) {
            console.error('No auth token found');
            return;
        }
        
        console.log('Auth token found:', token.substring(0, 20) + '...');
        
        // Test 1: Check Stripe configuration
        console.log('\n1. Testing Stripe configuration...');
        const testResponse = await fetch('https://api.quizgpt.site/api/stripe/test');
        const testData = await testResponse.json();
        console.log('Stripe test result:', testData);
        
        // Test 2: Check user membership
        console.log('\n2. Checking user membership...');
        const membershipResponse = await fetch('https://api.quizgpt.site/api/membership/status', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const membershipData = await membershipResponse.json();
        console.log('Membership status:', membershipData);
        
        // Test 3: Try to sync customer ID
        console.log('\n3. Attempting to sync customer ID...');
        const syncResponse = await fetch('https://api.quizgpt.site/api/stripe/sync-customer-id', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const syncData = await syncResponse.json();
        console.log('Sync result:', syncData);
        
        // Test 4: Try to create portal session
        console.log('\n4. Attempting to create portal session...');
        const portalResponse = await fetch('https://api.quizgpt.site/api/stripe/create-portal-session', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const portalData = await portalResponse.json();
        console.log('Portal session result:', portalData);
        
        console.log('\n=== Debug Test Complete ===');
        
    } catch (error) {
        console.error('Debug test failed:', error);
    }
};

// --- Instructions Modal Logic ---
async function handleInstructionsModal() {
    const modal = document.getElementById('instructionsModal');
    const understoodBtn = document.getElementById('understoodBtn');
    const dontShowBtn = document.getElementById('dontShowBtn');

    if (!(modal && understoodBtn && dontShowBtn)) return;

    // Await storage to ensure we have the latest value
    const result = await new Promise(resolve => {
        chrome.storage.sync.get(['instructionsModalHide'], resolve);
    });
    console.log('[InstructionsModal] instructionsModalHide:', result.instructionsModalHide);
    if (!result.instructionsModalHide) {
        modal.style.display = 'flex';
    }


    understoodBtn.onclick = () => {
        modal.style.display = 'none';
        // Do not set instructionsModalHide, so it shows next time
    };
    dontShowBtn.onclick = () => {
        chrome.storage.sync.set({ instructionsModalHide: true }, () => {
            modal.style.display = 'none';
        });
    };
}

// Call modal logic after DOM and main UI are ready
window.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    handleInstructionsModal();
});