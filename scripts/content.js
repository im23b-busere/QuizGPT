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

// Add status indicator
let statusIndicator = null;
function createStatusIndicator() {
    if (statusIndicator) return;
    
    statusIndicator = document.createElement('div');
    statusIndicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px;
        border-radius: 5px;
        z-index: 10000;
        font-size: 12px;
        font-family: Arial, sans-serif;
        max-width: 300px;
        word-wrap: break-word;
    `;
    statusIndicator.textContent = 'QuizGPT: Ready';
    document.body.appendChild(statusIndicator);
}

function updateStatus(message) {
    if (!statusIndicator) createStatusIndicator();
    statusIndicator.textContent = `QuizGPT: ${message}`;
    console.log('[Content] Status:', message);
}

// Add this variable to track the last sent question
let lastSentQuestionHash = null;

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Content] Received message:', request);
    if (request.action === "highlightAnswer") {
        updateStatus('Highlighting answer...');
        highlightAnswer(request.answer, request.options);
        sendResponse({ success: true });
    } else if (request.action === "getQuestion") {
        sendResponse({ question: currentQuestion });
    } else if (request.action === "showAuthError") {
        updateStatus('Auth error: ' + request.message);
        if (request.message.includes('free tier limit') || request.message.includes('Free tier limit')) {
            showPremiumUpgradeMessage();
        } else {
            // Show regular error message
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

// Hilfsfunktion für AutoClick mit Polling
function waitAndAutoClick(element, answerElements, options, retries = 20) {
    if (!element) return;
    // Prüfe, ob der Button klickbar ist
    if (!element.disabled && element.offsetParent !== null) {
        // Dispatch autoClick event
        const index = Array.from(answerElements).indexOf(element);
        console.log('[Content] Clicking answer at index:', index);
        const event = new CustomEvent("autoClickAnswer", { detail: index });
        window.dispatchEvent(event);
    } else if (retries > 0) {
        setTimeout(() => waitAndAutoClick(element, answerElements, options, retries - 1), 2000);
    } else {
        console.warn('[Content] AutoClick: Button was never enabled.');
    }
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
