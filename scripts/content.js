chrome.runtime.onMessage.addListener(async (request) => {
    console.log("Received message in content.js:", request);
    if (request.action === "highlightAnswer") {
        console.log("Answer received:", request.answer);
        highlightAnswer(request.answer);
    }
});

function highlightAnswer(answerText) {
    const answerElements = document.getElementsByTagName('div');

    Array.from(answerElements).forEach(element => {
        if (element.innerText.trim() === answerText.trim()) {
            element.style.border = '3px solid red';
        }
    });
}