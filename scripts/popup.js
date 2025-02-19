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
    const apiKey = 'K83273013088957';
    const apiUrl = 'https://api.ocr.space/parse/image';

    const formData = new FormData();
    formData.append('apikey', apiKey);
    formData.append('base64Image', imageDataUrl);

    try {
        const response = await fetch(apiUrl, {
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
    } catch (error) {
        console.error('Error:', error);
    }
}
