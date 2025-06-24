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
        
        // Fetch and display membership status
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
            <a href="https://im23b-busere.github.io/QuizGPT/privacy.html" target="_blank" class="footer-link">Privacy</a>
            <span class="footer-separator">•</span>
            <a href="https://im23b-busere.github.io/QuizGPT/terms.html" target="_blank" class="footer-link">Terms</a>
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
    chrome.storage.sync.get(['highlightOption', 'autoClickOption'], (settings) => {
        if (highlightCheckbox && settings.highlightOption !== undefined) {
            highlightCheckbox.checked = settings.highlightOption;
        }
        if (autoclickCheckbox && settings.autoClickOption !== undefined) {
            autoclickCheckbox.checked = settings.autoClickOption;
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
                // Try to load from chrome.storage
                const data = await chrome.storage.sync.get(['token']);
                token = data.token;
            }
            if (!token) {
                alert('You must be logged in to upgrade.');
                return;
            }
            window.open(`https://quizgpt.site/upgrade?token=${encodeURIComponent(token)}`, '_blank');
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
            const settings = await chrome.storage.sync.get(['highlightOption', 'autoClickOption']);
            
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
                    autoClick: settings.autoClickOption !== false
                }
            });
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
            const planFeatures = document.querySelector('.plan-features');
            
            console.log('Found plan badge element:', planBadge);
            console.log('Found plan features element:', planFeatures);
            
            if (planBadge) {
                planBadge.textContent = planType.charAt(0).toUpperCase() + planType.slice(1);
                console.log('Updated plan badge text to:', planBadge.textContent);
                
                planBadge.className = 'plan-badge';
                if (planType.toLowerCase() === 'premium') {
                    planBadge.classList.add('premium');
                    console.log('Added premium class to badge');
                } else {
                    planBadge.classList.add('free');
                    console.log('Added free class to badge');
                }
            }
            
            // Show/hide upgrade button and premium badge
            if (planType.toLowerCase() === 'premium') {
                if (upgradeButton) upgradeButton.classList.add('hidden');
                if (manageSubscriptionButton) manageSubscriptionButton.classList.remove('hidden');
                if (premiumBadge) premiumBadge.classList.remove('hidden');
            } else {
                if (upgradeButton) upgradeButton.classList.remove('hidden');
                if (manageSubscriptionButton) manageSubscriptionButton.classList.add('hidden');
                if (premiumBadge) premiumBadge.classList.add('hidden');
            }
            
            // Update features based on plan type
            if (planFeatures) {
                if (planType.toLowerCase() === 'premium') {
                    planFeatures.innerHTML = `
                        <div class="feature">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            <span>Up to 200 Questions</span>
                        </div>
                        <div class="feature">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            <span>Advanced Features</span>
                        </div>
                    `;
                    console.log('Updated features to premium');
                } else {
                    planFeatures.innerHTML = `
                        <div class="feature">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            <span>Basic Features</span>
                        </div>
                        <div class="feature">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                            <span>Standard Support</span>
                        </div>
                    `;
                    console.log('Updated features to free');
                }
            }
            
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