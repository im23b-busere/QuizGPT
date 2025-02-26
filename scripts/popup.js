// I know some Api keys are exposed, kind of tricky because chrome extensions can't read normal imports //

// Use chrome API to take screenshot of current tab
document.getElementById('screenshotBtn').addEventListener('click', async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: 'png' }, (dataUrl) => {
            console.log('Screenshot taken');
            extractTextFromImage(dataUrl);
        });
    });
});

// OCR with OCR.Space API
async function extractTextFromImage(imageDataUrl) {
    const spaceApiKey = 'K83273013088957';
    const spaceApiUrl = 'https://api.ocr.space/parse/image';

    const formData = new FormData();
    formData.append('apikey', spaceApiKey);
    formData.append('base64Image', imageDataUrl);

    try {
        const response = await fetch(spaceApiUrl, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        if (result.IsErroredOnProcessing) {
            console.error('Error processing image:', result.ErrorMessage);
            return;
        }

        const extractedText = result.ParsedResults[0].ParsedText;
        document.getElementById('questionText').innerText = extractedText;
        document.getElementById('extractedData').classList.remove('hidden');
        console.log('Extracted Text:', extractedText);

        //send question to Groq API
        await getAnswer(extractedText);

    } catch (err) {
        console.error('Error:', err);
    }
}


async function getAnswer(question) {
    const openaiApiKey = '*versteckt*';
    const openaiApiUrl = 'https://api.openai.com/v1/chat/completions';

    const body = {
        model: 'gpt-4o-mini',
        messages: [
            { role: "system", content: "I will give you a question and either a multiple choice or true/false answer. Please provide ONLY the correct answer. Nothing more, nothing less." },
            { role: "user", content: question }
        ],
    };

    try {
        const response = await fetch(openaiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();
        if (result.error) {
            console.error('Error from OpenAI API:', result.error.message);
            return;
        }

        const answer = result.choices[0].message.content.trim();
        document.getElementById('answerText').innerText = answer;
        console.log('OpenAI API Answer:', answer);

        // Send the answer to the content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0) {
                console.error("No active tab found.");
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: 'highlightAnswer', answer }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError.message);
                } else {
                    console.log("Message sent successfully:", response);
                }
            });
        });


    } catch (err) {
        console.error('Error fetching answer from Groq API:', err);
    }

}