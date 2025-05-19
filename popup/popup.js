// Load saved settings
document.addEventListener('DOMContentLoaded', () => {
    // Initialize with default plan status
    chrome.storage.sync.get(['openaiApiKey', 'selectedModel', 'highlightOption', 'autoClickOption', 'planStatus', 'token', 'user'], (result) => {
        console.log('Storage result:', result); // Debug log

        // Always set a default plan status if not present
        if (!result.planStatus) {
            console.log('No plan status found, setting default'); // Debug log
            chrome.storage.sync.set({ planStatus: 'Free' });
        }

        // Update UI with current plan status
        updatePlanStatus(result.planStatus || 'Free');

        // Fetch latest plan status from backend if token exists
        if (result.token) {
            console.log('Token found, fetching plan status'); // Debug log
            fetchPlanStatus(result.token);
        } else {
            console.log('No token found in storage'); // Debug log
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
    });

    // Load last question and answer
    chrome.storage.local.get(['savedQuestion', 'savedAnswer'], (result) => {
        if (result.savedQuestion) {
            document.getElementById('questionText').textContent = result.savedQuestion;
        }
        if (result.savedAnswer) {
            document.getElementById('answerText').textContent = `Answer: ${result.savedAnswer}`;
        }
    });
});

// Fetch plan status from backend
async function fetchPlanStatus(token) {
    console.log('Fetching plan status with token:', token); // Debug log
    try {
        const response = await fetch('http://localhost:3001/api/membership/status', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response status:', response.status); // Debug log
        
        if (!response.ok) {
            throw new Error('Failed to fetch plan status');
        }

        const data = await response.json();
        console.log('Plan status data:', data); // Debug log
        
        // Handle both possible response formats
        const planType = data.plan_type || data.planType || 'free';
        const formattedPlan = planType.charAt(0).toUpperCase() + planType.slice(1);
        
        console.log('Formatted plan:', formattedPlan); // Debug log
        
        // Update storage and UI
        chrome.storage.sync.set({ planStatus: formattedPlan }, () => {
            console.log('Updated storage with plan:', formattedPlan); // Debug log
            updatePlanStatus(formattedPlan);
        });
    } catch (error) {
        console.error('Error fetching plan status:', error);
        // Set default plan on error
        chrome.storage.sync.set({ planStatus: 'Free' }, () => {
            updatePlanStatus('Free');
        });
    }
}

// Save API key
document.getElementById('saveKey').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    if (apiKey) {
        chrome.storage.sync.set({ 
            openaiApiKey: apiKey,
            planStatus: 'Free' // Set default plan status
        }, () => {
            updateStatus(true);
            updatePlanStatus('Free');
            // Show success message
            const statusText = document.querySelector('.status-text');
            statusText.textContent = 'API key saved!';
            setTimeout(() => {
                statusText.textContent = 'API key configured';
            }, 2000);
        });
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
document.getElementById('clearData').addEventListener('click', () => {
    chrome.storage.sync.clear(() => {
        document.getElementById('apiKey').value = '';
        document.getElementById('questionText').textContent = 'No question yet';
        document.getElementById('answerText').textContent = '';
        updateStatus(false);
        // Set default plan status after clearing
        chrome.storage.sync.set({ planStatus: 'Free' }, () => {
            updatePlanStatus('Free');
        });
        // Show success message
        const statusText = document.querySelector('.status-text');
        statusText.textContent = 'Data cleared!';
        setTimeout(() => {
            statusText.textContent = 'No API key configured';
        }, 2000);
    });
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