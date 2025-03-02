// I know some Api keys are exposed, kind of tricky because chrome extensions can't read normal imports //

// Cache DOM elements
const screenshotBtn = document.getElementById('screenshotBtn');
const questionText = document.getElementById('questionText');
const extractedData = document.getElementById('extractedData');
const answerText = document.getElementById('answerText');

// Use chrome API to take screenshot of current tab
screenshotBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
        console.log('Screenshot taken');
        extractTextFromImage(dataUrl);
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
        questionText.innerText = extractedText;
        extractedData.classList.remove('hidden');
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
        answerText.innerText = answer;
        console.log('OpenAI API Answer:', answer);

        // Send the answer to the content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { action: 'highlightAnswer', answer }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error sending message:", chrome.runtime.lastError.message);
            } else {
                console.log("Message sent successfully:", response);
            }
        });

    } catch (err) {
        console.error('Error fetching answer from Groq API:', err);
    }
}