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
        upgradeButton.addEventListener('click', () => {
            window.open('https://im23b-busere.github.io/QuizGPT/upgrade.html', '_blank');
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
}

// Initialize
document.addEventListener('DOMContentLoaded', checkAuth);