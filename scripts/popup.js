// I know Api keys are exposed, kind of tricky because chrome extensions can't read normal imports //

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
    const groqApiKey = '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';
    const groqApiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
        model: 'llama-3.1-8b-instant',
        messages: [
            { role: "system", content: "I will give you a question and either a multiple choice or true/false answer. Please provide ONLY the correct answer. Nothing more, nothing less." },
            { role: "user", content: question }
        ],
    };

    try {
        const response = await fetch(groqApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqApiKey}`
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();
        if (result.error) {
            console.error('Error from Groq API:', result.error.message);
            return;
        }

        const answer = result.choices[0].message.content.trim();
        document.getElementById('answerText').innerText = answer;
        console.log('Groq API Answer:', answer);
    } catch (err) {
        console.error('Error fetching answer from Groq API:', err);
    }
}