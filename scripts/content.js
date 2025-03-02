chrome.runtime.onMessage.addListener(async (request) => {
    console.log("Received message in content.js:", request);
    if (request.action === "highlightAnswer") {
        console.log("Answer received:", request.answer);
        highlightAnswer(request.answer);
    }
});

function highlightAnswer(answerText) {
    const answerElements = document.querySelectorAll("button");
    for (let button of answerElements) {
        if (button.innerText.trim() === answerText.trim()) {
            button.style.border = '5px solid black';
        }
    }
}
