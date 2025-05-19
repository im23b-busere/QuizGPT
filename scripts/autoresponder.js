import { authService } from './auth.js';

// Initialize auth state
authService.loadAuthData().catch(error => {
    console.error('[AutoResponder] Error loading auth data:', error);
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[AutoResponder] Received message:', request);
    
    if (request.action === "processQuestion") {
        // Send immediate response to keep the port open
        sendResponse({ received: true });
        
        // Process the question asynchronously
        processQuestionWithBackend(request.question, sender.tab.id)
            .then(() => {
                console.log('[AutoResponder] Question processed successfully');
            })
            .catch(error => {
                console.error('[AutoResponder] Error processing question:', error);
            });
    }
    return true; // Keep the message channel open
});

// Process question through backend
async function processQuestionWithBackend(question, tabId) {
    try {
        // Check if we're authenticated
        if (!authService.isAuthenticated()) {
            console.log('[AutoResponder] Not authenticated, skipping question');
            return;
        }

        // Get user settings
        const settings = await chrome.storage.sync.get(['highlightOption', 'autoClickOption']);
        
        // Format the question for the backend
        const fullQuestion = `${question.title}\n\nOptions:\n${question.choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

        console.log('[AutoResponder] Sending question to backend:', fullQuestion);

        // Send to backend using authService
        const response = await authService.makeAuthenticatedRequest('http://localhost:3001/api/questions/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: fullQuestion
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('[AutoResponder] Answer from backend:', result.answer);

        // Send the answer back to the content script
        await chrome.tabs.sendMessage(tabId, {
            action: 'highlightAnswer',
            answer: result.answer,
            options: {
                highlight: settings.highlightOption !== false,
                autoClick: settings.autoClickOption !== false
            }
        });

    } catch (err) {
        console.error('[AutoResponder] Error processing question:', err);
        throw err;
    }
}