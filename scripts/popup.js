import { authService } from './auth.js';

// DOM Elements
const usernameElement = document.getElementById('username');
const userProfile = document.getElementById('userProfile');
const mainContent = document.getElementById('mainContent');
const settingsButton = document.querySelector('.settings-button');
const settingsModal = document.getElementById('settingsModal');
const closeModal = document.querySelector('.close-modal');
const highlightCheckbox = document.getElementById('highlight');
const autoclickCheckbox = document.getElementById('autoclick');
const silentModeCheckbox = document.getElementById('silentMode');
const answerDelaySlider = document.getElementById('answerDelay');
const delayValueDisplay = document.getElementById('delayValue');
const logoutButton = document.querySelector('.logout-button');
const upgradeButton = document.getElementById('upgradeButton');
const manageSubscriptionButton = document.getElementById('manageSubscriptionButton');
const premiumBadge = document.getElementById('premiumBadge');

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
            console.log('Setting username:', authData.user.username); // Debug log
            usernameElement.textContent = authData.user.username;
            
            // Also update username in settings modal
            const modalUsername = document.querySelector('#settingsModal .username');
            if (modalUsername) {
                modalUsername.textContent = authData.user.username;
            }
        } else {
            console.log('No username found in auth data'); // Debug log
            usernameElement.textContent = 'User Account';
        }

        // Load main content
        loadMainContent();
        initializeEventListeners();
        
        // Fetch and display membership status and usage counter
        await updateMembershipStatus();
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = 'login.html';
    }
}

// Load main content
function loadMainContent() {
    mainContent.innerHTML = `
        <button id="manualButton" class="button">Find Answer</button>
        <div id="loadingSpinner" class="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50 hidden">
            <div class="loader"></div>
        </div>
        <div id="extractedData" class="hidden">
            <h2 class="subtitle">Detected Question:</h2>
            <p id="questionText" class="text-field"></p>
            <h2 class="subtitle">Found Answer:</h2>
            <p id="answerText" class="text-field answer"></p>
        </div>
        
        <div class="footer-buttons">
            <a href="https://quizgpt.site/privacy" target="_blank" class="footer-link">Privacy</a>
            <span class="footer-separator">•</span>
            <a href="https://quizgpt.site/contact" target="_blank" class="footer-link">Contact</a>
        </div>
    `;
}

// Initialize event listeners
function initializeEventListeners() {
    // Settings button click handler
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            settingsModal.classList.remove('hidden');
        });
    }

    // Close modal button click handler
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            settingsModal.classList.add('hidden');
        });
    }

    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button
            button.classList.add('active');

            // Show corresponding content
            const tabId = button.getAttribute('data-tab');
            const content = document.getElementById(`${tabId}-tab`);
            if (content) {
                content.classList.add('active');
            }
        });
    });

    // Load settings
    chrome.storage.sync.get(['highlightOption', 'autoClickOption', 'answerDelay', 'silentMode'], (settings) => {
        if (highlightCheckbox && settings.highlightOption !== undefined) {
            highlightCheckbox.checked = settings.highlightOption;
        }
        if (autoclickCheckbox && settings.autoClickOption !== undefined) {
            autoclickCheckbox.checked = settings.autoClickOption;
        }
        if (silentModeCheckbox && settings.silentMode !== undefined) {
            silentModeCheckbox.checked = settings.silentMode;
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

    // Highlight checkbox change handler
    if (highlightCheckbox) {
        highlightCheckbox.addEventListener('change', async () => {
            await chrome.storage.sync.set({ highlightOption: highlightCheckbox.checked });
        });
    }

    // Autoclick checkbox change handler
    if (autoclickCheckbox) {
        autoclickCheckbox.addEventListener('change', async () => {
            await chrome.storage.sync.set({ autoClickOption: autoclickCheckbox.checked });
        });
    }

    // Silent mode checkbox change handler
    if (silentModeCheckbox) {
        silentModeCheckbox.addEventListener('change', async () => {
            // Check if user has permission to use this feature
            if (silentModeCheckbox.disabled) {
                silentModeCheckbox.checked = false;
                return;
            }
            await chrome.storage.sync.set({ silentMode: silentModeCheckbox.checked });
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

    // Upgrade button click handler
    if (upgradeButton) {
        upgradeButton.addEventListener('click', async () => {
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
        });
    }

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

    // Find Answer button click handler
    const manualButton = document.getElementById('manualButton');
    if (manualButton) {
        manualButton.addEventListener('click', handleManualButtonClick);
    }
}

// Handle manual button click
async function handleManualButtonClick() {
    const loadingSpinner = document.getElementById('loadingSpinner');
    const extractedData = document.getElementById('extractedData');
    const questionText = document.getElementById('questionText');
    const answerText = document.getElementById('answerText');
    const manualButton = document.getElementById('manualButton');

    try {
        loadingSpinner.classList.remove('hidden');
        manualButton.disabled = true;

        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Send message to content script to get question
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getQuestion" });
        
        if (response && response.question) {
            // Display the question
            questionText.textContent = response.question.title;
            extractedData.classList.remove('hidden');

            // Get user settings
            const settings = await chrome.storage.sync.get(['highlightOption', 'autoClickOption', 'answerDelay', 'silentMode']);
            
            // Format the question for the backend
            const fullQuestion = `${response.question.title}\n\nOptions:\n${response.question.choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

            // Send to backend
            const backendResponse = await authService.makeAuthenticatedRequest('https://api.quizgpt.site/api/questions/answer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    question: fullQuestion
                })
            });

            if (!backendResponse.ok) {
                throw new Error(`HTTP error! status: ${backendResponse.status}`);
            }

            const result = await backendResponse.json();
            answerText.textContent = result.answer;

            // Send answer back to content script
            await chrome.tabs.sendMessage(tab.id, {
                action: 'highlightAnswer',
                answer: result.answer,
                options: {
                    highlight: settings.highlightOption !== false,
                    autoClick: settings.autoClickOption !== false,
                    answerDelay: settings.answerDelay !== undefined ? settings.answerDelay : 3,
                    silentMode: settings.silentMode || false
                }
            });

            // Update usage counter
            await updateMembershipStatus();
        }
    } catch (error) {
        console.error('Error:', error);
        answerText.textContent = 'Error: ' + error.message;
    } finally {
        loadingSpinner.classList.add('hidden');
        manualButton.disabled = false;
    }
}

// Function to fetch and update membership status
async function updateMembershipStatus() {
    try {
        console.log('Fetching membership status...');
        console.log('Current auth token:', authService.token);
        
        const response = await authService.makeAuthenticatedRequest('https://api.quizgpt.site/api/membership/status');
        console.log('Membership status response:', response);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Membership status data:', data);
            
            const planType = data.plan_type || 'free';
            console.log('Plan type:', planType);
            
            const planBadge = document.querySelector('.plan-badge');
            
            console.log('Found plan badge element:', planBadge);
            
            if (planBadge) {
                // Display "Ultra" for enterprise membership, otherwise capitalize the plan type
                const displayText = planType.toLowerCase() === 'enterprise' ? 'Ultra' : planType.charAt(0).toUpperCase() + planType.slice(1);
                planBadge.textContent = displayText;
                console.log('Updated plan badge text to:', planBadge.textContent);
                
                planBadge.className = 'plan-badge';
                if (planType.toLowerCase() === 'premium') {
                    planBadge.classList.add('premium');
                    console.log('Added premium class to badge');
                } else if (planType.toLowerCase() === 'enterprise') {
                    planBadge.classList.add('enterprise');
                    console.log('Added enterprise class to badge');
                } else {
                    planBadge.classList.add('free');
                    console.log('Added free class to badge');
                }
            }
            
            // Show/hide upgrade button and premium badge
            if (planType.toLowerCase() === 'premium' || planType.toLowerCase() === 'enterprise') {
                if (upgradeButton) upgradeButton.classList.add('hidden');
                if (manageSubscriptionButton) manageSubscriptionButton.classList.remove('hidden');
                if (premiumBadge) premiumBadge.classList.remove('hidden');
            } else {
                if (upgradeButton) upgradeButton.classList.remove('hidden');
                if (manageSubscriptionButton) manageSubscriptionButton.classList.add('hidden');
                if (premiumBadge) premiumBadge.classList.add('hidden');
            }
            
            // Update usage counter
            const currentUsageElement = document.getElementById('currentUsage');
            const usageLimitElement = document.getElementById('usageLimit');
            const usageProgressElement = document.getElementById('usageProgress');
            const usageRemainingElement = document.getElementById('usageRemaining');
            
            if (currentUsageElement && usageLimitElement && usageProgressElement) {
                const usage = data.usage || 0;
                const limit = data.limit || 5;
                const remaining = Math.max(0, limit - usage);
                
                currentUsageElement.textContent = usage;
                usageLimitElement.textContent = limit;
                
                if (usageRemainingElement) {
                    usageRemainingElement.textContent = remaining;
                }
                
                // Calculate progress percentage
                const progressPercentage = Math.min((usage / limit) * 100, 100);
                usageProgressElement.style.width = `${progressPercentage}%`;
                
                // Change progress bar color based on usage
                if (progressPercentage >= 90) {
                    usageProgressElement.style.background = 'linear-gradient(90deg, #ff6b6b, #ff8e8e)';
                } else if (progressPercentage >= 75) {
                    usageProgressElement.style.background = 'linear-gradient(90deg, #ffa726, #ffb74d)';
                } else {
                    usageProgressElement.style.background = 'linear-gradient(90deg, #8A2BE2, #DA70D6)';
                }
                
                console.log('Updated usage counter:', usage, '/', limit, '(', progressPercentage, '%) -', remaining, 'remaining');
            } else {
                console.warn('Usage counter elements not found');
            }
            
            // Update premium locks based on plan type
            updatePremiumLocks(planType);
            
            console.log('Membership status updated successfully');
        } else {
            console.error('Failed to fetch membership status:', response.status);
            const errorText = await response.text();
            console.error('Error response:', errorText);
        }
    } catch (error) {
        console.error('Error updating membership status:', error);
        console.error('Error stack:', error.stack);
    }
}

// Function to update premium locks based on user plan
function updatePremiumLocks(planType) {
    console.log('Updating premium locks for plan:', planType);
    
    const plan = planType.toLowerCase();
    
    // Get elements
    const silentModeRow = document.querySelector('[data-plan="ultra"]');
    const answerDelayRow = document.querySelector('[data-plan="premium"]');
    const silentModeCheckbox = document.getElementById('silentMode');
    const answerDelaySlider = document.getElementById('answerDelay');
    
    // Check permissions for Silent Mode (Ultra/Enterprise required)
    if (silentModeRow && silentModeCheckbox) {
        const hasUltraAccess = plan === 'enterprise' || plan === 'ultra';
        
        if (hasUltraAccess) {
            // Unlock silent mode
            silentModeRow.classList.remove('premium-locked');
            silentModeCheckbox.disabled = false;
            console.log('Silent mode unlocked for Ultra/Enterprise user');
        } else {
            // Lock silent mode
            silentModeRow.classList.add('premium-locked');
            silentModeCheckbox.disabled = true;
            silentModeCheckbox.checked = false; // Uncheck if locked
            chrome.storage.sync.set({ silentMode: false }); // Save disabled state
            console.log('Silent mode locked - requires Ultra');
        }
    }
    
    // Check permissions for Answer Delay (Premium+ required)
    if (answerDelayRow && answerDelaySlider) {
        const hasPremiumAccess = plan === 'premium' || plan === 'enterprise' || plan === 'ultra';
        
        if (hasPremiumAccess) {
            // Unlock answer delay
            answerDelayRow.classList.remove('premium-locked');
            answerDelaySlider.disabled = false;
            console.log('Answer delay unlocked for Premium+ user');
        } else {
            // Lock answer delay
            answerDelayRow.classList.add('premium-locked');
            answerDelaySlider.disabled = true;
            answerDelaySlider.value = 0; // Reset to default
            document.getElementById('delayValue').textContent = '0';
            chrome.storage.sync.set({ answerDelay: 0 }); // Save default value
            console.log('Answer delay locked - requires Premium');
        }
    }
    
    // Add click handlers for locked features to show upgrade prompts
    addLockedFeatureClickHandlers(plan);
}

// Function to add click handlers for locked features
function addLockedFeatureClickHandlers(plan) {
    // Handle clicks on locked silent mode
    const silentModeRow = document.querySelector('[data-plan="ultra"]');
    if (silentModeRow) {
        // Remove existing listeners
        const newSilentModeRow = silentModeRow.cloneNode(true);
        silentModeRow.parentNode.replaceChild(newSilentModeRow, silentModeRow);
        
        if (plan !== 'enterprise' && plan !== 'ultra') {
            newSilentModeRow.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showUpgradePrompt('Ultra', 'Silent mode is an Ultra exclusive feature that disables all overlays for a cleaner experience.');
            });
        }
    }
    
    // Handle clicks on locked answer delay
    const answerDelayRow = document.querySelector('[data-plan="premium"]');
    if (answerDelayRow) {
        if (plan !== 'premium' && plan !== 'enterprise' && plan !== 'ultra') {
            // Remove existing listeners and add upgrade prompt
            const newAnswerDelayRow = answerDelayRow.cloneNode(true);
            answerDelayRow.parentNode.replaceChild(newAnswerDelayRow, answerDelayRow);
            
            newAnswerDelayRow.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showUpgradePrompt('Premium', 'Answer delay is a Premium feature that lets you customize the timing for a more natural experience.');
            });
        }
        
        // Re-add silent mode event listener after any DOM manipulation
        const silentModeCheckbox = document.getElementById('silentMode');
        if (silentModeCheckbox) {
            // Remove any existing listeners by cloning the checkbox
            const newSilentCheckbox = silentModeCheckbox.cloneNode(true);
            silentModeCheckbox.parentNode.replaceChild(newSilentCheckbox, silentModeCheckbox);
            
            // Add fresh event listener
            newSilentChWeckbox.addEventListener('change', async () => {
                // Check if user has permission to use this feature
                if (newSilentCheckbox.disabled) {
                    newSilentCheckbox.checked = false;
                    return;
                }
                console.log('Silent mode checkbox changed to:', newSilentCheckbox.checked);
                await chrome.storage.sync.set({ silentMode: newSilentCheckbox.checked });
                console.log('Silent mode saved to storage:', newSilentCheckbox.checked);
            });
        }

        // Re-add slider event listener after any DOM manipulation
        const slider = document.getElementById('answerDelay');
        const display = document.getElementById('delayValue');
        if (slider && display) {
            // Remove any existing listeners by cloning the slider
            const newSlider = slider.cloneNode(true);
            slider.parentNode.replaceChild(newSlider, slider);
            
            // Add fresh event listener
            newSlider.addEventListener('input', async () => {
                // Check if user has permission to use this feature
                if (newSlider.disabled) {
                    newSlider.value = 0;
                    display.textContent = "0";
                    return;
                }
                
                const value = newSlider.value;
                display.textContent = value;
                await chrome.storage.sync.set({ answerDelay: parseFloat(value) });
            });
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
                font-weight: bold;
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
    // Re-fetch membership status from backend
    authService.loadAuthData().then(async () => {
      // Fetch latest plan status
      try {
        await updateMembershipStatus();
        // Show thank you message if premium
        const planBadge = document.querySelector('.plan-badge');
        if (planBadge && planBadge.textContent.toLowerCase() === 'premium') {
          alert('Thank you for purchasing QuizGPT Premium! Have fun 🎉');
        }
      } catch (e) {
        console.error('Error refreshing membership:', e);
        // fallback: just show thank you
        alert('Thank you for purchasing QuizGPT Premium! Have fun 🎉');
      }
    });
  }
  
  // Listen for usage update message
  if (request.action === "updateUsage") {
    updateMembershipStatus();
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
        try {
            // Fetch membership status from backend
            const response = await authService.makeAuthenticatedRequest('https://api.quizgpt.site/api/membership/status');
            if (response.ok) {
                const data = await response.json();
                const planType = (data.plan_type || data.planType || 'free').toLowerCase();
                const usage = data.usage ?? data.used;
                const limit = data.limit ?? data.monthly_limit;
                if (planType === 'free' && typeof usage === 'number' && typeof limit === 'number' && usage >= limit) {
                    freeLimitModal.style.display = 'flex';
                }
            }
        } catch (error) {
            // If the backend returns a 403 or similar, assume limit reached for free users
            if (error.message && error.message.toLowerCase().includes('kontingent') || error.message.toLowerCase().includes('limit')) {
                freeLimitModal.style.display = 'flex';
            }
        }
        // Upgrade button logic (same as settings)
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
        freeLimitCloseBtn.onclick = () => {
            freeLimitModal.style.display = 'none';
        };
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