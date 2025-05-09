// Injects the WebSocket hook script into the page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('scripts/injected.js');
script.onload = () => console.log("[Kahoot AutoClick] Script injected");
(document.head || document.documentElement).appendChild(script);

// Listens for messages from popup and handles highlighting + auto-clicking
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "highlightAnswer") {
        const {answer, options} = request;
        console.log("[Kahoot AutoClick] Answer received:", answer, "Options:", options);
        highlightAndAutoClickAnswer(answer, options);
    }
});

// Listen for the event from injected.js
window.addEventListener("kahootQuestionParsed", (event) => {
    const question = event.detail;
    chrome.storage.local.set({ lastKahootQuestion: question }, () => {
        console.log("[Kahoot AutoClick] Question saved:", question);

        // Automatisch auslösen
        chrome.storage.local.get(['selectedModel', 'highlightOption', 'autoClickOption'], (settings) => {
            const { title, choices } = question;
            const fullQuestion = `${title}\n\nOptions:\n${choices.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;

            chrome.runtime.sendMessage({
                action: "getOpenAIAnswer",
                payload: {
                    question: fullQuestion,
                    model: settings.selectedModel || "gpt-4o",
                    highlight: settings.highlightOption !== false,
                    autoClick: settings.autoClickOption !== false
                }
            });
        });
    });
});



// Finds the correct button and optionally highlights and/or auto-clicks it
function highlightAndAutoClickAnswer(answerTextOrIndex, options = { highlight: true, autoClick: true }) {
    const buttons = document.querySelectorAll("button");
    let index = -1;

    if (typeof answerTextOrIndex === "number") {
        index = answerTextOrIndex;
    } else {
        const cleanedAnswerText = answerTextOrIndex.trim().toLowerCase();
        buttons.forEach((button, i) => {
            if (button.innerText.trim().toLowerCase() === cleanedAnswerText) {
                index = i;
            }
        });
    }

    if (index >= 0 && index < buttons.length) {
        const button = buttons[index];

        if (options.highlight) {
            button.style.border = '2px solid black';
            button.style.boxShadow = '0 0 10px 2px black';
            button.style.borderRadius = '10px';
            button.style.transition = 'all 0.3s ease-in-out';

            // Pulsierender Effekt
            button.animate([
                { transform: 'scale(1)', boxShadow: '0 0 10px 2px black' },
                { transform: 'scale(1.05)', boxShadow: '0 0 15px 4px black' },
                { transform: 'scale(1)', boxShadow: '0 0 10px 2px black' }
            ], {
                duration: 1000,
                iterations: 8
            });
            const checkmark = document.createElement('span');
            checkmark.textContent = ' ✅';
            checkmark.style.fontSize = '1.2em';
            checkmark.style.marginLeft = '8px';
            button.appendChild(checkmark);

        }


        console.log("[Kahoot AutoClick] Button match at index:", index);

        if (options.autoClick) {
            const event = new CustomEvent("autoClickAnswer", { detail: index });
            window.dispatchEvent(event);
        }
    } else {
        console.warn("[Kahoot AutoClick] Kein Button gefunden für:", answerTextOrIndex);
    }
}