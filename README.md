# QuizGPT

Tired of losing every Kahoot quiz? With this Chrome extension, you’ll always have the correct answer ready — automatically, instantly, and with optional auto-click.

**QuizGPT** analyzes questions live through the WebSocket connection and uses **OpenAI's GPT** to determine the correct answer in real time.

Now available in the **Chrome Web Store**! 🚀  
👉 [Get it here](https://quizgpt.site/)

![Screenshot](https://github.com/user-attachments/assets/ef55a697-9dfc-493c-986d-81d56eb65dd7)

---

## Table of Contents
- [Features](#features)
- [Installation](#installation)
- [Technologies](#technologies)
- [Important Notes](#important-notes)
- [Author](#author)

---

## Features
- Automatically answer Kahoot questions without guessing
- Real-time question processing using the OpenAI API
- Highlight the correct answer during the game (optional)
- ✅ **NEW!** Auto-click the correct answer (optional)
- Turbo Answer Mode

![Screenshot](https://github.com/user-attachments/assets/d5edae72-32be-4a63-8acf-6b5c7deb0572)



## Installation

### 🧩 From the Chrome Web Store (recommended)
1. Go to the [Chrome Web Store page](https://chromewebstore.google.com/detail/QuizGPT/bnaoghpmdonopfhepombafeekbaopejl)
2. Click **"Add to Chrome"**
3. Enjoy!

### 🛠️ Manual (for developers)
1. Clone or download this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer Mode**
4. Click **"Load unpacked"** and select the project folder
5. Enjoy!

---

## Technologies
- **Frontend:** HTML, CSS, JavaScript, JSON
- **APIs:** Chrome Extension API, OpenAI API

---

## Important Notes
- Public quizzes: QuizGPT tries the quiz UUID answer key first (can work without “show questions on player screens”)
- Private quizzes / no UUID: falls back to AI, which needs question text visible on the device
- This project is **not affiliated with Kahoot! or OpenAI**
- Use responsibly and only in settings where AI use is permitted

---

## Author
**@im23b-busere**

Feedback or suggestions? Feel free to [open an issue](https://github.com/QuizGPT/issues) or submit a pull request!
