import { authService } from '../scripts/auth.js';

// Initialize auth state
authService.loadAuthData().catch(error => {
    console.error('[Popup] Error loading auth data:', error);
});

// Load saved settings
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize with default plan status
    const result = await chrome.storage.sync.get(['openaiApiKey', 'selectedModel', 'highlightOption', 'autoClickOption', 'planStatus']);
    console.log('Storage result:', result); // Debug log

    // Always set a default plan status if not present
    if (!result.planStatus) {
        console.log('No plan status found, setting default'); // Debug log
        await chrome.storage.sync.set({ planStatus: 'Free' });
    }

    // Update UI with current plan status
    updatePlanStatus(result.planStatus || 'Free');

    // Fetch latest plan status from backend
    try {
        const response = await authService.makeAuthenticatedRequest('http://91.99.69.198:3001/api/membership/status');
        if (response.ok) {
            const data = await response.json();
            console.log('Membership data:', data);
            
            // Handle both possible response formats
            const planType = data.plan_type || data.planType || 'free';
            const formattedPlan = planType.charAt(0).toUpperCase() + planType.slice(1);
            
            // Update storage and UI
            await chrome.storage.sync.set({ planStatus: formattedPlan });
            updatePlanStatus(formattedPlan);
        }
    } catch (error) {
        console.error('Error fetching plan status:', error);
        if (error.message.includes('Not authenticated') || error.message.includes('Please log in')) {
            showLoginPrompt();
        }
        updatePlanStatus('Free');
    }

    if (result.openaiApiKey) {
        document.getElementById('apiKey').value = result.openaiApiKey;
        updateStatus(true);
    } else {
        updateStatus(false);
    }

    // Load model selection
    if (result.selectedModel) {
        document.getElementById('modelSelect').value = result.selectedModel;
    }

    // Load highlight and auto-click options
    if (result.highlightOption !== undefined) {
        document.getElementById('highlightOption').checked = result.highlightOption;
    }
    if (result.autoClickOption !== undefined) {
        document.getElementById('autoClickOption').checked = result.autoClickOption;
    }

    // Load last question and answer
    const localData = await chrome.storage.local.get(['savedQuestion', 'savedAnswer']);
    if (localData.savedQuestion) {
        document.getElementById('questionText').textContent = localData.savedQuestion;
    }
    if (localData.savedAnswer) {
        document.getElementById('answerText').textContent = `Answer: ${localData.savedAnswer}`;
    }
});

// Show login prompt
function showLoginPrompt() {
    const planValue = document.querySelector('.plan-value');
    if (planValue) {
        planValue.textContent = 'Login Required';
        planValue.style.color = '#dc3545';
        // Add login prompt below plan status
        const loginPrompt = document.createElement('div');
        loginPrompt.style.color = '#dc3545';
        loginPrompt.style.fontSize = '12px';
        loginPrompt.style.marginTop = '5px';
        loginPrompt.textContent = 'Please log in to access premium features';
        planValue.parentNode.appendChild(loginPrompt);
    }
}

// Save API key
document.getElementById('saveKey').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey) {
        await chrome.storage.sync.set({ 
            openaiApiKey: apiKey,
            planStatus: 'Free' // Set default plan status
        });
        updateStatus(true);
        updatePlanStatus('Free');
        // Show success message
        const statusText = document.querySelector('.status-text');
        statusText.textContent = 'API key saved!';
        setTimeout(() => {
            statusText.textContent = 'API key configured';
        }, 2000);
    } else {
        updateStatus(false);
    }
});

// Save model selection
document.getElementById('modelSelect').addEventListener('change', (e) => {
    chrome.storage.sync.set({ selectedModel: e.target.value });
});

// Save highlight and auto-click options
document.getElementById('highlightOption').addEventListener('change', (e) => {
    chrome.storage.sync.set({ highlightOption: e.target.checked });
});

document.getElementById('autoClickOption').addEventListener('change', (e) => {
    chrome.storage.sync.set({ autoClickOption: e.target.checked });
});

// Clear saved data
document.getElementById('clearData').addEventListener('click', async () => {
    await chrome.storage.sync.clear();
    document.getElementById('apiKey').value = '';
    document.getElementById('questionText').textContent = 'No question yet';
    document.getElementById('answerText').textContent = '';
    updateStatus(false);
    // Set default plan status after clearing
    await chrome.storage.sync.set({ planStatus: 'Free' });
    updatePlanStatus('Free');
    // Show success message
    const statusText = document.querySelector('.status-text');
    statusText.textContent = 'Data cleared!';
    setTimeout(() => {
        statusText.textContent = 'No API key configured';
    }, 2000);
});

// Update status indicator
function updateStatus(hasApiKey) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');

    if (hasApiKey) {
        statusDot.className = 'status-dot active';
        statusText.textContent = 'API key configured';
    } else {
        statusDot.className = 'status-dot inactive';
        statusText.textContent = 'No API key configured';
    }
}

// Update plan status
function updatePlanStatus(plan) {
    console.log('Updating plan status UI with:', plan); // Debug log
    const planValue = document.querySelector('.plan-value');
    if (!planValue) {
        console.log('Plan value element not found!'); // Debug log
        return;
    }
    
    // Ensure plan is always a string
    const planText = String(plan || 'Free');
    console.log('Setting plan text to:', planText); // Debug log
    planValue.textContent = planText;
    
    // Set color based on plan
    switch(planText.toLowerCase()) {
        case 'premium':
            planValue.style.color = '#28a745';
            break;
        case 'pro':
            planValue.style.color = '#1a73e8';
            break;
        default:
            planValue.style.color = '#6c757d';
    }
}

// Listen for question updates
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "updateQuestion") {
        const { title, choices } = request.question;
        const questionText = `${title}\n\nOptions:\n${choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
        document.getElementById('questionText').textContent = questionText;
    }
});

// Function to show premium upgrade message
function showPremiumUpgradeMessage() {
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

    // Add to popup
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

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Popup] Received message:', request); // Debug log
    
    if (request.action === 'updateAnswer') {
        const answerText = document.getElementById('answerText');
        if (answerText) {
            answerText.textContent = request.answer;
            if (request.answer.includes('kostenloses Kontingent')) {
                answerText.style.color = '#ff4444';
            } else {
                answerText.style.color = '#000000';
            }
        }
    }
    return true;
});

// Function to handle manual answer request
async function handleManualAnswerRequest() {
    try {
        const questionText = document.getElementById('questionText').textContent;
        if (!questionText || questionText === 'No question yet') {
            document.getElementById('answerText').textContent = 'Keine Frage verfügbar';
            return;
        }

        const response = await authService.makeAuthenticatedRequest('http://91.99.69.198:3001/api/questions/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: questionText
            })
        });

        const result = await response.json();
        document.getElementById('answerText').textContent = `Antwort: ${result.answer}`;
    } catch (error) {
        console.error('Error:', error);
        const answerText = document.getElementById('answerText');
        answerText.textContent = error.message;
        answerText.style.color = '#ff4444';
    }
} 