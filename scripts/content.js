// Injects the WebSocket hook script early into the page
const script = document.createElement('script');
script.src = chrome.runtime.getURL('scripts/injected.js');
script.onload = () => console.log("[Kahoot AutoClick] Script injected");
(document.head || document.documentElement).appendChild(script);

// Listens for correct answer from popup and triggers auto click
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "highlightAnswer") {
    console.log("Answer received:", request.answer);
    highlightAndAutoClickAnswer(request.answer);
  }
});

function highlightAndAutoClickAnswer(answerText) {
  const buttons = document.querySelectorAll("button");
  let index = 0;

  for (let button of buttons) {
    const cleanedButtonText = button.innerText.trim().toLowerCase();
    const cleanedAnswerText = answerText.trim().toLowerCase();

    if (cleanedButtonText === cleanedAnswerText) {
      button.style.border = '5px solid black'; // visual feedback
      console.log("[Kahoot AutoClick] Match found:", cleanedButtonText, "(Index:", index, ")");
      const event = new CustomEvent("autoClickAnswer", { detail: index });
      window.dispatchEvent(event);
      break;
    }
    index++;
  }
}
