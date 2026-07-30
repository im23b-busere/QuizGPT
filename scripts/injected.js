(() => {
// Content script can inject this more than once (all_frames / re-inject). Guard before any const.
if (window.__quizgptInjected) {
    console.log('[AutoClick] already injected — skip');
    return;
}
window.__quizgptInjected = true;

console.log("[Kahoot AutoClick] Inject started");

const OldWebSocket = window.WebSocket;
window.__kahootWS = null;
window.kahootClientId = null;
window.kahootGameId = null;
window.kahootQuestionIndex = 0;
window.kahootMessageId = 0;
window.kahootDataId = 45; // Fixed value for answer submissions based on Burp Suite analysis

function handleParsedContent(content, dataId) {
    if (!content || typeof content !== 'object') return;

    // START_QUIZ (id 9): game started — clear reconnect flags
    if (dataId === 9) {
        clearExpectingReconnect();
        window.__kahootSoftReconnect = false;
    }

    const questionIndex = typeof content.questionIndex === 'number'
        ? content.questionIndex
        : (typeof content.questionNumber === 'number' ? content.questionNumber : null);

    // Full question (host enabled "show questions on players' devices")
    if (content.type === 'quiz' && content.title && Array.isArray(content.choices)) {
        clearGetReadyFallback();
        // Prefer this over any pending index-only QuestionStart emit
        window.__kahootPendingFullQuestion = null;
        if (window.__kahootQuestionStartTimer) {
            clearTimeout(window.__kahootQuestionStartTimer);
            window.__kahootQuestionStartTimer = null;
        }
        const question = {
            title: content.title,
            choices: content.choices.map(c => (typeof c === 'string' ? c : c.answer)),
            questionIndex: questionIndex != null ? questionIndex : window.kahootQuestionIndex,
            _fromQuestionStart: true
        };
        window.kahootQuestionIndex = question.questionIndex;
        console.log("[AutoClick] New question detected:", question);
        window.dispatchEvent(new CustomEvent("kahootQuestionParsed", { detail: question }));
        return;
    }

    // GetReady (id 1): track index. Answer immediately only after soft reconnect
    // (mid-question rejoin often never gets QuestionStart again).
    if (questionIndex != null && dataId === 1) {
        window.kahootQuestionIndex = questionIndex;
        persistLastQuestionIndex(questionIndex);
        console.log("[AutoClick] GetReady for questionIndex:", questionIndex);
        if (window.__kahootSoftReconnect || isExpectingReconnect()) {
            scheduleGetReadyFallback(questionIndex);
        }
        return;
    }

    // QuestionStart (id 2) — delay briefly so a full type=quiz payload can win (show-questions).
    // Emitting index-only/scrape first caused "duplicate" drops of the real question.
    if (questionIndex != null && dataId === 2) {
        clearGetReadyFallback();
        window.__kahootSoftReconnect = false;
        clearExpectingReconnect();
        if (window.__quizgptAnsweredQ !== questionIndex) {
            window.__quizgptAnsweredQ = null;
        }
        window.kahootQuestionIndex = questionIndex;
        persistLastQuestionIndex(questionIndex);
        console.log("[AutoClick] QuestionStart (waiting for full payload):", questionIndex);

        window.__kahootPendingFullQuestion = questionIndex;
        if (window.__kahootQuestionStartTimer) {
            clearTimeout(window.__kahootQuestionStartTimer);
        }
        window.__kahootQuestionStartTimer = setTimeout(() => {
            window.__kahootQuestionStartTimer = null;
            if (window.__kahootPendingFullQuestion !== questionIndex) return;
            window.__kahootPendingFullQuestion = null;
            const question = {
                title: null,
                choices: null,
                questionIndex,
                _fromQuestionStart: true
            };
            console.log("[AutoClick] QuestionStart fallback (index only):", question);
            window.dispatchEvent(new CustomEvent("kahootQuestionParsed", { detail: question }));
        }, 200);
        return;
    }

    // Recovery / other payloads during reconnect may include questionIndex without id 1/2
    if (window.__kahootSoftReconnect && questionIndex != null) {
        window.kahootQuestionIndex = questionIndex;
        persistLastQuestionIndex(questionIndex);
        scheduleGetReadyFallback(questionIndex);
    }
}

function persistLastQuestionIndex(questionIndex) {
    try {
        const prev = JSON.parse(sessionStorage.getItem('quizgpt_quiz_meta') || '{}');
        sessionStorage.setItem('quizgpt_quiz_meta', JSON.stringify({
            lastQuestionIndex: questionIndex,
            gameid: window.kahootGameId || prev.gameid || null,
            pendingAnswer: prev.pendingAnswer || window.__quizgptPendingAnswer || null
        }));
    } catch (_) { /* ignore */ }
}

function isExpectingReconnect() {
    try {
        return sessionStorage.getItem('quizgpt_expect_reconnect') === '1';
    } catch (_) {
        return false;
    }
}

function setExpectingReconnect() {
    try { sessionStorage.setItem('quizgpt_expect_reconnect', '1'); } catch (_) { /* ignore */ }
}

function clearExpectingReconnect() {
    try { sessionStorage.removeItem('quizgpt_expect_reconnect'); } catch (_) { /* ignore */ }
}

function emitAnswerForQuestionIndex(questionIndex, reason) {
    if (typeof questionIndex !== 'number') return;
    const now = Date.now();
    if (window.__kahootLastEmitIndex === questionIndex && now - (window.__kahootLastEmitAt || 0) < 2000) {
        console.log('[AutoClick] Skip duplicate emit for questionIndex', questionIndex);
        return;
    }
    window.__kahootLastEmitIndex = questionIndex;
    window.__kahootLastEmitAt = now;
    const softReconnect = !!window.__kahootSoftReconnect;
    const question = {
        title: null,
        choices: null,
        questionIndex,
        fromGetReadyFallback: true,
        // Only mark reconnect when we actually soft-reconnected — otherwise this
        // falsely force-resends AI and burns extra free usages every round.
        _reconnectAnswer: softReconnect,
        _fromQuestionStart: true
    };
    console.log('[AutoClick] Emitting answer for questionIndex', questionIndex, reason, softReconnect ? '(reconnect)' : '');
    window.dispatchEvent(new CustomEvent('kahootQuestionParsed', { detail: question }));
}

function clearGetReadyFallback() {
    if (window.__kahootGetReadyTimer) {
        clearTimeout(window.__kahootGetReadyTimer);
        window.__kahootGetReadyTimer = null;
    }
    window.__kahootPendingGetReady = null;
}

function scheduleGetReadyFallback(questionIndex) {
    clearGetReadyFallback();
    window.__kahootPendingGetReady = questionIndex;
    // Reconnect mid-question often only sends GetReady, never QuestionStart again
    window.__kahootGetReadyTimer = setTimeout(() => {
        if (window.__kahootPendingGetReady !== questionIndex) return;
        window.__kahootPendingGetReady = null;
        window.__kahootGetReadyTimer = null;
        emitAnswerForQuestionIndex(questionIndex, 'GetReady fallback');
    }, 500);
}

// Restore gameid for reconnect UX
try {
    const raw = sessionStorage.getItem('quizgpt_quiz_meta');
    if (raw) {
        const data = JSON.parse(raw);
        if (data.gameid && !window.kahootGameId) {
            window.kahootGameId = data.gameid;
        }
    }
} catch (_) { /* ignore */ }

// Hook into the WebSocket constructor
window.WebSocket = function (url, protocols) {
    console.log("[AutoClick] WebSocket constructor called with URL:", url);

    let ws;
    if (protocols) {
        ws = new OldWebSocket(url, protocols);
    } else {
        ws = new OldWebSocket(url);
    }
    window.__kahootWS = ws;

    ws.addEventListener("message", function (event) {
        try {
            const data = JSON.parse(event.data);
            const items = Array.isArray(data) ? data : [data];

            items.forEach(item => {
                if (item.clientId) {
                    const prevClient = window.kahootClientId;
                    window.kahootClientId = item.clientId;
                    if (prevClient && prevClient !== item.clientId) {
                        console.log("[AutoClick] clientId rotated:", item.clientId);
                        // New CometD session after socket swap — resend pending answer with new clientId
                        if (window.__quizgptPendingAnswer) {
                            window.__quizgptAnsweredQ = null;
                            schedulePendingAnswerResend();
                        }
                    } else if (!prevClient) {
                        console.log("[AutoClick] clientId found:", window.kahootClientId);
                        if (window.__quizgptAwaitingResend) {
                            window.__quizgptAwaitingResend = false;
                            schedulePendingAnswerResend();
                        }
                    }
                }

                if (item.data?.gameid) {
                    const incomingId = item.data.gameid;
                    const previousId = window.kahootGameId;

                    if (previousId !== incomingId) {
                        window.kahootGameId = incomingId;

                        // null → pin after WS reconnect is NOT a new quiz
                        const isSoftReconnect = previousId == null;
                        const isHardNewGame = previousId != null && String(previousId) !== String(incomingId);

                        if (isHardNewGame) {
                            window.kahootQuestionIndex = 0;
                            window.__quizgptAnsweredQ = null;
                            window.__quizgptPendingAnswer = null;
                            try { sessionStorage.removeItem('quizgpt_quiz_meta'); } catch (_) { /* ignore */ }
                            console.log("[AutoClick] New game detected, gameid:", incomingId);
                            window.dispatchEvent(new CustomEvent("kahootGameReset", {
                                detail: { gameid: incomingId, soft: false }
                            }));
                        } else if (isSoftReconnect) {
                            console.log("[AutoClick] Reconnected to gameid:", incomingId);
                            window.__kahootSoftReconnect = true;
                            window.__quizgptAnsweredQ = null;
                            window.dispatchEvent(new CustomEvent("kahootGameReset", {
                                detail: { gameid: incomingId, soft: true }
                            }));
                            const savedIdx = (() => {
                                if (typeof window.__kahootLastQuestionIndex === 'number') {
                                    return window.__kahootLastQuestionIndex;
                                }
                                try {
                                    const raw = sessionStorage.getItem('quizgpt_quiz_meta');
                                    const n = raw ? JSON.parse(raw).lastQuestionIndex : null;
                                    return typeof n === 'number' ? n : null;
                                } catch (_) { return null; }
                            })();
                            if (typeof savedIdx === 'number') {
                                window.kahootQuestionIndex = savedIdx;
                                scheduleGetReadyFallback(savedIdx);
                            }
                            schedulePendingAnswerResend();
                        }
                    } else if (window.__quizgptAwaitingResend && window.kahootClientId) {
                        window.__quizgptAwaitingResend = false;
                        schedulePendingAnswerResend();
                    }
                }

                if (item.data?.content) {
                    try {
                        const raw = item.data.content;
                        const content = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        handleParsedContent(content, item.data.id);
                    } catch (e) {
                        console.log("[AutoClick] Error parsing content:", e);
                    }
                }

                if (item.id) {
                    const msgId = parseInt(item.id, 10);
                    if (!isNaN(msgId) && msgId > window.kahootMessageId) {
                        window.kahootMessageId = msgId;
                    }
                }
            });
        } catch (e) {
            console.warn("[AutoClick] Error parsing WS message:", e);
        }
    });

    ws.addEventListener("open", () => {
        console.log("[AutoClick] WebSocket connection established");
        if (window.__quizgptPendingAnswer) {
            window.__quizgptAwaitingResend = true;
            window.__quizgptAnsweredQ = null;
            // clientId usually arrives with the first message on this socket
            schedulePendingAnswerResend();
        }
    });

    ws.addEventListener("close", () => {
        console.log("[AutoClick] WebSocket connection closed");
        setExpectingReconnect();
        try {
            const prev = JSON.parse(sessionStorage.getItem('quizgpt_quiz_meta') || '{}');
            sessionStorage.setItem('quizgpt_quiz_meta', JSON.stringify({
                lastQuestionIndex: typeof window.kahootQuestionIndex === 'number'
                    ? window.kahootQuestionIndex
                    : prev.lastQuestionIndex,
                gameid: window.kahootGameId || prev.gameid || null,
                pendingAnswer: window.__quizgptPendingAnswer || prev.pendingAnswer || null
            }));
        } catch (_) { /* ignore */ }
        // Keep gameid/clientId — needed to resend on the next socket. Only drop the dead WS handle.
        if (window.__kahootWS === ws) {
            window.__kahootWS = null;
        }
        window.__kahootLastQuestionIndex = window.kahootQuestionIndex;
        window.__quizgptAnsweredQ = null;
        clearGetReadyFallback();
    });

    ws.addEventListener("error", (error) => {
        console.error("[AutoClick] WebSocket error:", error);
    });

    return ws;
};

window.WebSocket.prototype = OldWebSocket.prototype;

// Sends the answer through WebSocket.
// Pass explicitQuestionIndex when known — do not rely on a possibly stale window value.
window.sendAutoClickMessage = function (answerChoice, explicitQuestionIndex) {
    const gameid = window.kahootGameId;
    const clientId = window.kahootClientId;
    const questionIndex = typeof explicitQuestionIndex === 'number'
        ? explicitQuestionIndex
        : window.kahootQuestionIndex;
    const choice = Number(answerChoice);

    console.log("[AutoClick] Current state:", {
        gameid,
        clientId,
        dataId: window.kahootDataId,
        questionIndex,
        explicitQuestionIndex,
        choice,
        messageId: window.kahootMessageId,
        websocketReady: window.__kahootWS?.readyState === 1
    });

    if (!gameid || !clientId || !window.__kahootWS) {
        console.warn("[AutoClick] Missing data (gameid, clientId, or WebSocket)", {
            gameid: !!gameid,
            clientId: !!clientId,
            dataId: window.kahootDataId,
            websocket: !!window.__kahootWS
        });
        return;
    }

    if (typeof questionIndex !== 'number' || Number.isNaN(choice) || choice < 0) {
        console.warn("[AutoClick] Missing questionIndex/choice, not sending", { questionIndex, choice });
        return;
    }

    // One WS submit per question (prevents multi-frame postMessage spam)
    if (window.__quizgptAnsweredQ === questionIndex
        && Date.now() - (window.__quizgptAnsweredAt || 0) < 8000) {
        console.log('[AutoClick] Already submitted for questionIndex', questionIndex);
        return;
    }

    window.kahootQuestionIndex = questionIndex;
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
                choice,
                questionIndex
            })
        },
        clientId,
        ext: {}
    }];

    if (window.__kahootWS.readyState === 1) {
        window.__kahootWS.send(JSON.stringify(payload));
        window.__quizgptAnsweredQ = questionIndex;
        window.__quizgptAnsweredAt = Date.now();
        window.__quizgptPendingAnswer = {
            choice,
            questionIndex,
            gameid,
            at: Date.now()
        };
        console.log("[AutoClick] Answer sent:", {
            gameid,
            messageId: window.kahootMessageId,
            dataId: window.kahootDataId,
            questionIndex,
            choice
        });
    } else {
        console.error("[AutoClick] WebSocket not open.");
        window.__quizgptPendingAnswer = {
            choice,
            questionIndex,
            gameid,
            at: Date.now()
        };
    }
};

function schedulePendingAnswerResend() {
    const pending = window.__quizgptPendingAnswer;
    if (!pending || typeof pending.choice !== 'number' || typeof pending.questionIndex !== 'number') return;
    if (Date.now() - (pending.at || 0) > 20000) {
        window.__quizgptPendingAnswer = null;
        window.__quizgptAwaitingResend = false;
        return;
    }

    // Avoid stacking multiple resend loops
    const token = (window.__quizgptResendToken = (window.__quizgptResendToken || 0) + 1);
    let tries = 0;
    const tick = () => {
        if (token !== window.__quizgptResendToken) return;
        tries += 1;
        if (!window.__kahootWS || window.__kahootWS.readyState !== 1 || !window.kahootClientId || !window.kahootGameId) {
            if (tries < 30) setTimeout(tick, 200);
            return;
        }
        if (pending.gameid != null && String(pending.gameid) !== String(window.kahootGameId)) {
            window.__quizgptPendingAnswer = null;
            window.__quizgptAwaitingResend = false;
            return;
        }
        console.log('[AutoClick] Resending answer after reconnect', pending, 'clientId', window.kahootClientId);
        pending.resendCount = (pending.resendCount || 0) + 1;
        if (pending.resendCount > 2) {
            console.log('[AutoClick] Giving up resend after', pending.resendCount, 'tries');
            window.__quizgptPendingAnswer = null;
            window.__quizgptAwaitingResend = false;
            return;
        }
        window.__quizgptAnsweredQ = null;
        window.__quizgptAwaitingResend = false;
        window.sendAutoClickMessage(pending.choice, pending.questionIndex);
        pending.at = Date.now();
    };
    setTimeout(tick, 300);
}

window.addEventListener("autoClickAnswer", function (event) {
    const detail = event.detail;
    let choice;
    let questionIndex;

    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        choice = detail.choice;
        questionIndex = detail.questionIndex;
    } else {
        choice = detail;
    }

    console.log("[AutoClick] Click triggered with choice:", choice, "questionIndex:", questionIndex);
    window.sendAutoClickMessage(choice, questionIndex);
});

function handleQuizgptPageMessage(data) {
    if (!data || data.source !== 'quizgpt') return false;
    if (data.type === 'autoClickAnswer') {
        console.log('[AutoClick] Bridged click:', data.choice, 'q', data.questionIndex);
        window.sendAutoClickMessage(data.choice, data.questionIndex);
        return true;
    }
    if (data.type === 'clearAnsweredQuestion') {
        if (typeof data.questionIndex === 'number' && window.__quizgptAnsweredQ === data.questionIndex) {
            window.__quizgptAnsweredQ = null;
            console.log('[AutoClick] Cleared answered lock for questionIndex', data.questionIndex);
        }
        return true;
    }
    if (data.type === 'answerCurrentQuestion') {
        let idx = typeof window.kahootQuestionIndex === 'number' ? window.kahootQuestionIndex : null;
        if (typeof idx !== 'number') {
            try {
                const raw = sessionStorage.getItem('quizgpt_quiz_meta');
                const n = raw ? JSON.parse(raw).lastQuestionIndex : null;
                if (typeof n === 'number') idx = n;
            } catch (_) { /* ignore */ }
        }
        if (typeof data.questionIndex === 'number') idx = data.questionIndex;
        if (typeof idx === 'number') {
            window.__kahootSoftReconnect = true;
            emitAnswerForQuestionIndex(idx, 'content requested current question');
        } else {
            console.log('[AutoClick] answerCurrentQuestion: no questionIndex known yet');
        }
        return true;
    }
    return false;
}

// Content-script → page bridge (CustomEvent does not cross isolated worlds)
window.addEventListener('message', function (event) {
    handleQuizgptPageMessage(event.data);
});

// DOM attribute bridge (works even when postMessage frame targeting fails)
(function watchClickBridge() {
    const ensure = () => {
        let bridge = document.getElementById('quizgpt-click-bridge');
        if (!bridge) {
            bridge = document.createElement('div');
            bridge.id = 'quizgpt-click-bridge';
            bridge.style.display = 'none';
            (document.documentElement || document.body || document).appendChild(bridge);
        }
        return bridge;
    };

    const run = () => {
        try {
            const bridge = ensure();
            const obs = new MutationObserver(() => {
                const raw = bridge.getAttribute('data-payload');
                if (!raw) return;
                bridge.removeAttribute('data-payload');
                try {
                    handleQuizgptPageMessage(JSON.parse(raw));
                } catch (e) {
                    console.warn('[AutoClick] bridge parse error', e);
                }
            });
            obs.observe(bridge, { attributes: true, attributeFilter: ['data-payload'] });
        } catch (e) {
            console.warn('[AutoClick] bridge watch failed', e);
        }
    };

    if (document.documentElement) run();
    else document.addEventListener('DOMContentLoaded', run);
})();

})(); // end quizgpt inject guard
