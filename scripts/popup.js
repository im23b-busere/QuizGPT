// Cache DOM elements
const manualButton = document.getElementById('manualButton');
const questionText = document.getElementById('questionText');
const extractedData = document.getElementById('extractedData');
const answerText = document.getElementById('answerText');
const settingsButton = document.querySelector('.settings-button');
const settingsModal = document.getElementById('settingsModal');
const closeModalBtn = document.querySelector('.close-modal');

const modelSelect = document.getElementById('model');
const modelDescription = document.getElementById('model-description');

const highlightCheckbox = document.getElementById("highlight");
const autoClickCheckbox = document.getElementById("autoclick");

const apiKeyInput = document.getElementById("apiKey");
const saveApiKeyBtn = document.getElementById("saveApiKey");
const apiKeyStatus = document.getElementById("apiKeyStatus");

const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');


// Show settings on button click
settingsButton.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
});

// Close settings
closeModalBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

// Save selected model to local storage
modelSelect.addEventListener('change', (event) => {
    const selectedModel = event.target.value;
    chrome.storage.local.set({ selectedModel }, () => {
        console.log('Model saved:', selectedModel);
    });
});

// Restore selected model on load
chrome.storage.local.get(['selectedModel'], (data) => {
    if (data.selectedModel) {
        modelSelect.value = data.selectedModel;
    }
});

// Save checkbox states to local storage
highlightCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ highlightOption: highlightCheckbox.checked }, () => {
        console.log('Highlight-Option gespeichert:', highlightCheckbox.checked);
    });
});

autoClickCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ autoClickOption: autoClickCheckbox.checked }, () => {
        console.log('AutoClick-Option gespeichert:', autoClickCheckbox.checked);
    });
});

// Restore checkbox states on load
chrome.storage.local.get(['highlightOption', 'autoClickOption'], (data) => {
    if (data.highlightOption !== undefined) {
        highlightCheckbox.checked = data.highlightOption;
    }
    if (data.autoClickOption !== undefined) {
        autoClickCheckbox.checked = data.autoClickOption;
    }
});

// Save API key
saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key.startsWith("sk-")) {
        chrome.storage.local.set({ openaiApiKey: key }, () => {
            apiKeyStatus.style.display = "inline";
            setTimeout(() => apiKeyStatus.style.display = "none", 800);
        });
    } else {
        alert("Bitte einen gültigen OpenAI-Key eingeben (beginnend mit sk-...)");
    }
});

chrome.storage.local.get(['openaiApiKey'], (data) => {
    if (data.openaiApiKey) {
        apiKeyInput.value = data.openaiApiKey;
    }
});

// get last question from local storage
chrome.storage.local.get("lastKahootQuestion", (data) => {
    if (data.lastKahootQuestion) {
        const { title, choices } = data.lastKahootQuestion;
        questionText.innerText = title;
        answerText.innerText = choices.join(" / ");
        extractedData.classList.remove('hidden');
    }
});

// function for spinner
function showSpinner(button) {
    button.disabled = true;
    button.innerHTML = '<div class="loader" style="width: 20px; height: 20px; border-width: 3px;"></div>';
}

function hideSpinner(button, originalText) {
    button.disabled = false;
    button.innerHTML = originalText;
}

// manual button click
manualButton.addEventListener('click', async () => {
    const question = questionText.innerText;
    const selectedModel = modelSelect.value;

    if (question) {
        const originalText = manualButton.innerHTML;
        showSpinner(manualButton);

        try {
            await getAnswer(question, selectedModel);
        } finally {
            setTimeout(() => hideSpinner(manualButton, originalText), 300);
        }
    } else {
        console.error('No question found to send to OpenAI.');
    }
});

// OpenAI request
async function getAnswer(question, selectedModel) {
    chrome.storage.local.get("openaiApiKey", async ({ openaiApiKey }) => {
        if (!openaiApiKey) {
            alert("Bitte zuerst den OpenAI API-Key in den Einstellungen eingeben.");
            return;
        }

        const openaiApiUrl = 'https://api.openai.com/v1/chat/completions';
        const body = {
            model: selectedModel,
            messages: [
                {
                    role: "system",
                    content: "I will give you a question and either a multiple choice or true/false answer. Please provide ONLY the correct answer (without the number). Nothing more, nothing less."
                },
                { role: "user", content: question }
            ]
        };

        try {
            const response = await fetch(openaiApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify(body)
            });

            const result = await response.json();
            if (result.error) {
                console.error('OpenAI Fehler:', result.error.message);
                return;
            }

            const answer = result.choices[0].message.content.trim();

            chrome.storage.local.set({ savedQuestion: question, savedAnswer: answer }, () => {
                console.log("Frage und Antwort gespeichert.");
            });

            answerText.innerText = answer;

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, {
                action: 'highlightAnswer',
                answer,
                options: {
                    highlight: highlightCheckbox.checked,
                    autoClick: autoClickCheckbox.checked
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Fehler beim Senden:", chrome.runtime.lastError.message);
                } else {
                    console.log("Antwort gesendet:", response);
                }
            });

        } catch (err) {
            console.error('OpenAI fetch error:', err);
        }
    });
}

// Tab Navigation
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Remove active class from all buttons and contents
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked button
        button.classList.add('active');
        
        // Show corresponding content
        const tabId = button.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

