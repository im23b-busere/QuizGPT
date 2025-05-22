import { authService } from './auth.js';

// Initialize auth state
let isInitialized = false;

async function initializeAuth() {
    if (isInitialized) return;
    
    try {
        await authService.loadAuthData();
        isInitialized = true;
        console.log('[AutoResponder] Auth initialized successfully');
    } catch (error) {
        console.error('[AutoResponder] Error initializing auth:', error);
    }
}

// Initialize immediately
initializeAuth();

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
        // Ensure auth is initialized
        await initializeAuth();

        // Check if we're authenticated
        if (!authService.isAuthenticated()) {
            console.log('[AutoResponder] Not authenticated, skipping question');
            // Send message to content script to show login prompt
            await chrome.tabs.sendMessage(tabId, {
                action: 'showAuthError',
                message: 'Please log in to use the auto-responder.'
            });
            return;
        }

        // Get user settings
        const settings = await chrome.storage.sync.get(['highlightOption', 'autoClickOption']);
        
        // Format the question for the backend
        const fullQuestion = `${question.title}\n\nOptions:\n${question.choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

        console.log('[AutoResponder] Sending question to backend:', fullQuestion);

        // Send to backend using authService
        const response = await authService.makeAuthenticatedRequest('http://91.99.69.198:3001/api/questions/answer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: fullQuestion
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            
            // Handle free tier limit error
            if (response.status === 403 && errorData.message === 'Free tier limit reached') {
                // Send message to popup
                chrome.runtime.sendMessage({
                    action: 'showAuthError',
                    message: 'Free tier limit reached. You have used all 5 free quiz attempts. Please upgrade to premium for unlimited access!'
                });
                return;
            }
            
            // Handle other errors
            chrome.runtime.sendMessage({
                action: 'showAuthError',
                message: errorData.message || 'Failed to get answer. Please try again.'
            });
            return;
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
        
        // Check if it's a 403 error
        if (err.message && err.message.includes('status: 403')) {
            chrome.runtime.sendMessage({
                action: 'updateAnswer',
                answer: 'Du hast dein kostenloses Kontingent aufgebraucht. Upgrade auf Premium für unbegrenzten Zugriff auf QuizGPT!'
            });
            return;
        }
        
        // Handle other errors
        chrome.runtime.sendMessage({
            action: 'updateAnswer',
            answer: 'Ein Fehler ist aufgetreten. Bitte versuche es später erneut.'
        });
    }
}