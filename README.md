# KahootGPT

Müde davon jedes Kahoot zu verlieren? Mit dieser Chrome-Erweiterung hast du immer die richtige Antwort parat! Die Erweiterung nutzt OCR und **GPT-4o** KI, um Fragen aus einem Screenshot zu extrahieren und die richtige Antwort automatisch auf der Kahoot-Seite hervorzuheben.

<img src="https://github.com/user-attachments/assets/2cd9801c-880d-496e-bb65-96b5b5f0d033" alt="AI-Voice-Assistant-Screenshot" width="700"/>


## Inhaltsverzeichnis
- [Features](#features)
- [Installation](#installation)
- [Technologien](#technologien)
- [Sicherheits-Hinweis](#hinweise)
- [Autor](#autor)

## Features
- Screenshot-Erfassung der aktuellen Webseite
- Texterkennung mittels OCR.Space API
- Automatische Frageverarbeitung über OpenAI-API
- Hervorhebung der korrekten Antwort auf der Kahoot-Seite


## Installation
1. **Repository klonen oder herunterladen**
2. **API-Schlüssel angeben:**
   - OCR.Space API (kostenloser API-Schlüssel erhältlich)
   - OpenAI API (erfordert ein OpenAI-Konto)
3. **Chrome-Erweiterungen verwalten:**
   - `chrome://extensions/` in Chrome öffnen
   - Entwicklermodus aktivieren
   - "Entpackte Erweiterung laden" auswählen und den Projektordner angeben
4. **Erweiterung nutzen!**

## Technologien
- **Frontend:** HTML, CSS, JavaScript, JSON
- **API's:** Chrome API, OCR.Space API, Groq API

## Hinweise
- Die Frage selber muss zwingend auf den Endgeräten sichtbar sein (Einstellbar in den Kahoot Einstellung).
- Ein eigener API-Schlüssel für OCR.Space und OpenAI ist erforderlich, um die Erweiterung korrekt zu nutzen.

## Autor

**[im23b-busere](https://github.com/im23b-busere)**  
Feedback oder Vorschläge? Öffne ein Issue oder erstelle einen Pull-Request!

