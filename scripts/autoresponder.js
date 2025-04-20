chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getOpenAIAnswer") {
        const { question, model, highlight, autoClick } = request.payload;
        getAnswerFromOpenAI(question, model, highlight, autoClick);
    }
});

// get the answer from OpenAI
async function getAnswerFromOpenAI(question, selectedModel, highlight = true, autoClick = true) {
    chrome.storage.local.get("openaiApiKey", async ({ openaiApiKey }) => {
        if (!openaiApiKey) {
            console.error("[AutoResponder] Kein OpenAI API-Key gespeichert.");
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
                console.error('[AutoResponder] OpenAI error:', result.error.message);
                return;
            }

            const answer = result.choices[0].message.content.trim();
            console.log('[AutoResponder] Antwort:', answer);

            chrome.storage.local.set({ savedQuestion: question, savedAnswer: answer });

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, {
                action: 'highlightAnswer',
                answer,
                options: { highlight, autoClick }
            });

        } catch (err) {
            console.error('[AutoResponder] Fetch error:', err);
        }
    });
}