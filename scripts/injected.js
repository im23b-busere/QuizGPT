console.log("[QuizGPT AutoClick] Inject started");

const OldWebSocket = window.WebSocket;
window.__kahootWS = null;
window.quizClientId = null;
window.quizGameId = null;
window.quizQuestionIndex = 0;
window.quizMessageId = 0;
window.quizDataId = 45;

// Hook into the WebSocket constructor
window.WebSocket = function (url, protocols) {

    // Check if the URL contains "ws.kahoot.it"
    let ws;
    if (protocols) {
        ws = new OldWebSocket(url, protocols);
    } else {
        ws = new OldWebSocket(url);
    }
    window.__kahootWS = ws;

    // Listen to incoming messages
    ws.addEventListener("message", function (event) {
        try {
            const data = JSON.parse(event.data);

            // convert data to array
            const items = Array.isArray(data) ? data : [data];

            items.forEach(item => {
                if (item.clientId && !window.quizClientId) {
                    window.quizClientId = item.clientId;
                    console.log("[AutoClick] clientId found:", window.quizClientId);
                }

                if (item.data?.gameid && !window.quizGameId) {
                    window.quizGameId = item.data.gameid;
                    console.log("[AutoClick] gameid found:", window.quizGameId);
                }

                if (item.data?.content) {
                    try {
                        const content = JSON.parse(item.data.content);
                        if (typeof content.questionIndex === "number") {
                            window.quizQuestionIndex = content.questionIndex;
                            console.log("[AutoClick] questionIndex:", window.quizQuestionIndex);
                        }

                        if (content.title && content.choices) {
                            window.kahootCurrentQuestion = {
                                title: content.title,
                                choices: content.choices.map(c => c.answer),
                                questionIndex: content.questionIndex
                            };

                            console.log("[AutoClick] New question:", window.kahootCurrentQuestion.title, window.kahootCurrentQuestion.choices);

                            // send question to content script
                            window.dispatchEvent(new CustomEvent("quizQuestionParsed", {
                                detail: {
                                    title: content.title,
                                    choices: content.choices.map(c => c.answer),
                                    questionIndex: content.questionIndex
                                }
                            }));


                        }
                    } catch (e) {
                    }
                }

                if (item.id) {
                    const msgId = parseInt(item.id, 10);
                    if (!isNaN(msgId) && msgId > window.quizMessageId) {
                        window.quizMessageId = msgId;
                        console.log("[AutoClick] message.id updated:", msgId);
                    }
                }

                if (item.data?.id && typeof item.data.id === "number") {
                    if (item.data.id > window.quizDataId) {
                        window.quizDataId = item.data.id;
                        console.log("[AutoClick] data.id updated:", item.data.id);
                    }
                }
            });
        } catch (e) {
            console.warn("[AutoClick] Error parsing WS message:", e);
        }
    });

    return ws;
};

window.WebSocket.prototype = OldWebSocket.prototype;

// Sends the answer through WebSocket
window.sendAutoClickMessage = function (answerChoice) {
    const gameid = window.quizGameId;
    const clientId = window.quizClientId;
    const questionIndex = window.quizQuestionIndex;

    if (!gameid || !clientId || !window.__kahootWS) {
        console.warn("[AutoClick] Missing data (gameid, clientId, or WebSocket)");
        return;
    }

    window.quizMessageId++;

    const payload = [{
        id: window.quizMessageId.toString(),
        channel: "/service/controller",
        data: {
            gameid,
            type: "message",
            host: "kahoot.it",
            id: window.quizDataId,
            content: JSON.stringify({
                type: "quiz",
                choice: answerChoice,
                questionIndex
            })
        },
        clientId,
        ext: {}
    }];

    if (window.__kahootWS.readyState === 1) {
        window.__kahootWS.send(JSON.stringify(payload));
        console.log("[AutoClick] Answer sent:", {
            gameid,
            messageId: window.quizMessageId,
            dataId: window.quizDataId,
            questionIndex,
            choice: answerChoice
        });
    } else {
        console.error("[AutoClick] WebSocket not open.");
    }
};

// Triggered by custom event from content script
window.addEventListener("quizQuestionParsed", function (event) {
    const choice = event.detail;
    console.log("[QuizGPT] Click triggered with choice:", choice);
    window.sendAutoClickMessage(choice);
});

