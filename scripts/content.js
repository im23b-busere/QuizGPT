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
    });
});



// Finds the correct button and optionally highlights and/or auto-clicks it
function highlightAndAutoClickAnswer(answerText, options = {highlight: true, autoClick: true}) {
    const buttons = document.querySelectorAll("button");
    let index = 0;

    for (let button of buttons) {
        const cleanedButtonText = button.innerText.trim().toLowerCase();
        const cleanedAnswerText = answerText.trim().toLowerCase();

        if (cleanedButtonText === cleanedAnswerText) {
            if (options.highlight) {
                button.style.border = '5px solid black'; // visual feedback
            }

            console.log("[Kahoot AutoClick] Match found:", cleanedButtonText, "(Index:", index, ")");

            if (options.autoClick) {
                const event = new CustomEvent("autoClickAnswer", {detail: index});
                window.dispatchEvent(event);
            }

            break;
        }
        index++;
    }
}
