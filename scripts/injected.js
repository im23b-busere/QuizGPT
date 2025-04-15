console.log("[Kahoot AutoClick] Inject started");

const OldWebSocket = window.WebSocket;
window.__kahootWS = null;
window.kahootClientId = null;
window.kahootGameId = null;
window.kahootQuestionIndex = 0;
window.kahootMessageId = 0;
window.kahootDataId = 45; // stays static unless changed dynamically

// Hook into the WebSocket constructor
window.WebSocket = function (url, protocols) {
  const ws = protocols ? new OldWebSocket(url, protocols) : new OldWebSocket(url);
  window.__kahootWS = ws;

  // Listen to incoming messages to grab IDs and game state
  ws.addEventListener("message", function (event) {
    try {
      const data = JSON.parse(event.data);
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

        if (item.data?.content) {
          try {
            const content = JSON.parse(item.data.content);
            if (typeof content.questionIndex === "number") {
              window.kahootQuestionIndex = content.questionIndex;
              console.log("[AutoClick] questionIndex:", window.kahootQuestionIndex);
            }
          } catch (e) {}
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

  // Bump message ID, data.id stays static (or use smarter handling if needed)
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
