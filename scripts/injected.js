console.log("[Kahoot AutoClick] Inject started");

const OldWebSocket = window.WebSocket;
window.__kahootWS = null;
window.kahootClientId = null;
window.kahootGameId = null;
window.kahootQuestionIndex = 0;
window.kahootMessageId = 0;
window.kahootDataId = 45;

// Hook into the WebSocket constructor
window.WebSocket = function (url, protocols) {
    console.log("[AutoClick] WebSocket constructor called with URL:", url);
    
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
            console.log("[AutoClick] Raw WebSocket message:", event.data);

            // convert data to array
            const items = Array.isArray(data) ? data : [data];

            items.forEach(item => {
                if (item.clientId && !window.kahootClientId) {
                    window.kahootClientId = item.clientId;
                    console.log("[AutoClick] clientId found:", window.kahootClientId);
                }

                if (item.data?.gameid && !window.kahootGameId) {
                    window.kahootGameId = item.data.gameid;
                    console.log("[AutoClick] gameid found:", window.kahootGameId);
                }

                // Check for question content
                if (item.data?.content) {
                    try {
                        console.log("[AutoClick] Found content in message:", item.data.content);
                        const content = JSON.parse(item.data.content);
                        console.log("[AutoClick] Parsed content:", content);
                        
                        // Check if this is a question message
                        if (content.type === 'quiz' && content.title && content.choices) {
                            const question = {
                                title: content.title,
                                choices: content.choices.map(c => c.answer),
                                questionIndex: content.questionIndex || window.kahootQuestionIndex
                            };
                            
                            console.log("[AutoClick] New question detected:", question);

                            // Update question index
                            window.kahootQuestionIndex = question.questionIndex;

                            // Dispatch event to content script
                            const event = new CustomEvent("kahootQuestionParsed", {
                                detail: question
                            });
                            console.log("[AutoClick] Dispatching kahootQuestionParsed event");
                            window.dispatchEvent(event);
                        } else {
                            console.log("[AutoClick] Not a question message:", content);
                        }
                    } catch (e) {
                        console.log("[AutoClick] Error parsing content:", e);
                    }
                } else {
                    console.log("[AutoClick] No content in message");
                }

                if (item.id) {
                    const msgId = parseInt(item.id, 10);
                    if (!isNaN(msgId) && msgId > window.kahootMessageId) {
                        window.kahootMessageId = msgId;
                        console.log("[AutoClick] message.id updated:", msgId);
                    }
                }

                if (item.data?.id && typeof item.data.id === "number") {
                    if (item.data.id > window.kahootDataId) {
                        window.kahootDataId = item.data.id;
                        console.log("[AutoClick] data.id updated:", item.data.id);
                    }
                }
            });
        } catch (e) {
            console.warn("[AutoClick] Error parsing WS message:", e);
        }
    });

    // Add connection status logging
    ws.addEventListener("open", () => {
        console.log("[AutoClick] WebSocket connection established");
    });

    ws.addEventListener("close", () => {
        console.log("[AutoClick] WebSocket connection closed");
        window.__kahootWS = null;
        window.kahootClientId = null;
        window.kahootGameId = null;
    });

    ws.addEventListener("error", (error) => {
        console.error("[AutoClick] WebSocket error:", error);
    });

    return ws;
};

window.WebSocket.prototype = OldWebSocket.prototype;

// Sends the answer through WebSocket
window.sendAutoClickMessage = function (answerChoice) {
    const gameid = window.kahootGameId;
    const clientId = window.kahootClientId;
    const questionIndex = window.kahootQuestionIndex;

    if (!gameid || !clientId || !window.__kahootWS) {
        console.warn("[AutoClick] Missing data (gameid, clientId, or WebSocket)");
        return;
    }

    window.kahootMessageId++;

    const payload = [{
        id: window.kahootMessageId.toString(),
        channel: "/service/controller",
        data: {
            gameid,
            type: "message",
            host: "kahoot.it",
            id: window.kahootDataId,
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
            messageId: window.kahootMessageId,
            dataId: window.kahootDataId,
            questionIndex,
            choice: answerChoice
        });
    } else {
        console.error("[AutoClick] WebSocket not open.");
    }
};

// Triggered by custom event from content script
window.addEventListener("autoClickAnswer", function (event) {
    const choice = event.detail;
    console.log("[AutoClick] Click triggered with choice:", choice);
    window.sendAutoClickMessage(choice);
});