import { authService } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth data to be loaded
    await authService.loadAuthData();
    
    // Check authentication first
    if (!authService.isAuthenticated()) {
        console.log('Not authenticated, redirecting to login');
        window.location.href = 'login.html';
        return;
    }

    console.log('Authentication successful, initializing popup');
    // Initialize UI elements
    const manualButton = document.getElementById('manualButton');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const extractedData = document.getElementById('extractedData');
    const questionText = document.getElementById('questionText');
    const answerText = document.getElementById('answerText');
    const settingsButton = document.querySelector('.settings-button');
    const settingsModal = document.getElementById('settingsModal');
    const closeModal = document.querySelector('.close-modal');
    const highlightCheckbox = document.getElementById('highlight');
    const autoclickCheckbox = document.getElementById('autoclick');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const membershipStatus = document.getElementById('membershipStatus');
    const upgradeButton = document.getElementById('upgradeButton');
    const logoutButton = document.querySelector('.logout-button');

    // Load settings
    const settings = await chrome.storage.sync.get(['highlightOption', 'autoClickOption']);
    if (highlightCheckbox && settings.highlightOption !== undefined) highlightCheckbox.checked = settings.highlightOption;
    if (autoclickCheckbox && settings.autoClickOption !== undefined) autoclickCheckbox.checked = settings.autoClickOption;

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

    // Tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Update active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === `${tabId}-tab`) {
                    content.classList.add('active');
                }
            });
        });
    });

    // Logout button click handler
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await authService.logout();
            window.location.href = 'login.html';
        });
    }

    // Upgrade button click handler
    if (upgradeButton) {
        upgradeButton.addEventListener('click', () => {
            window.open('https://im23b-busere.github.io/QuizGPT/upgrade.html', '_blank');
        });
    }

    // Find Answer button click handler
    if (manualButton) {
        manualButton.addEventListener('click', async () => {
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
                    const backendResponse = await authService.makeAuthenticatedRequest('http://91.99.69.198:3001/api/questions/answer', {
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
        });
    }

    // Update membership status
    async function updateMembershipStatus() {
        try {
            const response = await authService.makeAuthenticatedRequest('http://91.99.69.198:3001/api/membership/status');
            if (response.ok) {
                const data = await response.json();
                console.log('Membership data:', data); // Debug log
                
                // Update plan badge in the account status section
                const planBadge = document.querySelector('.plan-badge');
                if (planBadge) {
                    const planType = data.plan_type || 'free';
                    planBadge.textContent = planType.toUpperCase();
                }

                // Update username in the user profile section
                const username = document.querySelector('.username');
                if (username && data.username) {
                    username.textContent = data.username;
                }

                // Update status dot and text in the user profile section
                const statusDot = document.querySelector('.status-dot');
                const statusText = document.querySelector('.status-text');
                if (statusDot && statusText) {
                    const isActive = data.status === 'active';
                    statusDot.className = `status-dot ${isActive ? '' : 'inactive'}`;
                    statusText.textContent = isActive ? 'Account Active' : 'Account Inactive';
                }

                // Update upgrade button visibility
                const upgradeButton = document.getElementById('upgradeButton');
                if (upgradeButton) {
                    upgradeButton.style.display = (data.plan_type === 'free') ? 'flex' : 'none';
                }

                // Update membership status text in the settings modal
                const membershipStatus = document.getElementById('membershipStatus');
                if (membershipStatus) {
                    membershipStatus.textContent = `${data.plan_type.toUpperCase()} Plan - ${data.status.toUpperCase()}`;
                }
            } else {
                throw new Error('Failed to fetch membership status');
            }
        } catch (error) {
            console.error('Error fetching membership status:', error);
            const statusText = document.querySelector('.status-text');
            if (statusText) {
                statusText.textContent = 'Error loading status';
            }
            const membershipStatus = document.getElementById('membershipStatus');
            if (membershipStatus) {
                membershipStatus.textContent = 'Error loading status';
            }
        }
    }

    // Initial membership status check
    await updateMembershipStatus();
});