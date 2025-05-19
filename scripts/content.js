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

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Content] Received message:', request);
    if (request.action === "highlightAnswer") {
        highlightAnswer(request.answer, request.options);
        sendResponse({ success: true });
    } else if (request.action === "getQuestion") {
        sendResponse({ question: currentQuestion });
    }
    return true;
});

// Listen for question events from the injected script
window.addEventListener('kahootQuestionParsed', (event) => {
    console.log('[Content] Received question event:', event.detail);
    
    // Validate question data
    const question = event.detail;
    if (!question || !question.title || !Array.isArray(question.choices)) {
        console.error('[Content] Invalid question data:', question);
        return;
    }

    // Store the current question
    currentQuestion = {
        title: question.title,
        choices: question.choices
    };

    console.log('[Content] Processing question:', {
        title: question.title,
        choices: question.choices,
        questionIndex: question.questionIndex
    });
    
    // Send the question to the background script
    chrome.runtime.sendMessage({
        action: 'processQuestion',
        question: question
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[Content] Error sending message:', chrome.runtime.lastError);
        } else {
            console.log('[Content] Message sent successfully:', response);
        }
    });

    // Send the question to the popup
    chrome.runtime.sendMessage({
        action: 'updateQuestion',
        question: {
            title: question.title,
            choices: question.choices
        }
    });
});

// Function to highlight the correct answer
function highlightAnswer(answer, options = {}) {
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
            // Add a small delay to make the highlight visible before clicking
            setTimeout(() => {
                try {
                    // Get the index of the answer element
                    const index = Array.from(answerElements).indexOf(correctElement);
                    console.log('[Content] Clicking answer at index:', index);
                    
                    // Dispatch the autoClickAnswer event that the WebSocket hook will catch
                    const event = new CustomEvent("autoClickAnswer", { detail: index });
                    window.dispatchEvent(event);
                } catch (error) {
                    console.error('[Content] Error dispatching click event:', error);
                }
            }, 300);
        }
    } else {
        console.log('[Content] No matching answer element found');
    }
}

// Add pulse animation to the styles
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
document.head.appendChild(style);