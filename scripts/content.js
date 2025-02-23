chrome.runtime.onMessage.addListener(async (request) => {
    console.log("Received message in content.js:", request);
    if (request.action === "highlightAnswer") {
        console.log("Answer received:", request.answer);
        highlightAnswer(request.answer);
    }
});

function highlightAnswer(answerText) {
    const answerElements = document.getElementsByTagName('div');

    for (let element of answerElements) {
        if (element.innerText.trim() === answerText.trim()) {
            element.style.border = '5px solid black';
            break;
        }
    }
}