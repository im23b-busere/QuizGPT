console.log('login.js loaded');
import { authService } from './auth.js';

// DOM Elements
const emailForm = document.getElementById('emailForm');
const codeForm = document.getElementById('codeForm');
const emailInput = document.getElementById('emailInput');
const codeInput = document.getElementById('codeInput');
const requestCodeButton = document.getElementById('requestCodeButton');
const verifyCodeButton = document.getElementById('verifyCodeButton');
const resendCodeButton = document.getElementById('resendCodeButton');
const emailError = document.getElementById('emailError');
const codeError = document.getElementById('codeError');
const errorMessage = document.getElementById('errorMessage');
const codeSection = document.getElementById('codeSection');
const emailSection = document.getElementById('emailSection');
const returningUserText = document.getElementById('returningUserText');

let currentEmail = '';
let rateLimitTimer = null;
let rateLimitEndTime = null;

// TEMP: Inline API_URL and showError/hideError if missing
const API_URL = 'https://api.quizgpt.site/api';
function showError(element, message) {
    if (element) {
        element.textContent = message;
        element.classList.remove('hidden');
    }
}
function hideError(element) {
    if (element) {
        element.textContent = '';
        element.classList.add('hidden');
    }
}

// Start rate limit countdown
function startRateLimitCountdown(seconds) {
    if (rateLimitTimer) {
        clearInterval(rateLimitTimer);
    }
    
    // Safety check: cap at reasonable time (e.g., 30 minutes = 1800 seconds)
    const maxSeconds = 1800; // 30 minutes max
    const safeSeconds = Math.min(seconds, maxSeconds);
    
    console.log(`Rate limit countdown: ${seconds}s requested, ${safeSeconds}s used`);
    
    if (safeSeconds <= 0) {
        console.warn('Invalid retry time received:', seconds);
        return;
    }
    
    rateLimitEndTime = Date.now() + (safeSeconds * 1000);
    updateRateLimitDisplay();
    
    rateLimitTimer = setInterval(() => {
        updateRateLimitDisplay();
    }, 1000);
}

// Update rate limit display
function updateRateLimitDisplay() {
    if (!rateLimitEndTime) return;
    
    const remaining = Math.max(0, Math.ceil((rateLimitEndTime - Date.now()) / 1000));
    
    // Safety check: if remaining time is unreasonably large, use fallback
    if (remaining > 3600) { // More than 1 hour
        console.warn('Unreasonable countdown time detected:', remaining);
        if (rateLimitTimer) {
            clearInterval(rateLimitTimer);
            rateLimitTimer = null;
        }
        rateLimitEndTime = null;
        
        // Show fallback message
        requestCodeButton.disabled = false;
        requestCodeButton.textContent = 'Send Code';
        requestCodeButton.classList.remove('rate-limited');
        showError(emailError, 'Too many requests. Please wait before trying again.');
        return;
    }
    
    if (remaining <= 0) {
        // Rate limit expired
        if (rateLimitTimer) {
            clearInterval(rateLimitTimer);
            rateLimitTimer = null;
        }
        rateLimitEndTime = null;
        
        // Re-enable the button
        requestCodeButton.disabled = false;
        requestCodeButton.textContent = 'Send Code';
        requestCodeButton.classList.remove('rate-limited');
        hideError(emailError);
        return;
    }
    
    // Update button text and keep disabled
    requestCodeButton.disabled = true;
    requestCodeButton.classList.add('rate-limited');
    requestCodeButton.textContent = `Wait ${remaining}s`;
    
    // Update error message with countdown
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    showError(emailError, `Too many requests. Please wait ${timeString} before trying again.`);
}

// Clear pending verification and go back to email form
async function goBackToEmail() {
    try {
        await chrome.storage.sync.remove(['pendingVerification', 'pendingEmail', 'verificationTimestamp']);
        currentEmail = '';
        emailInput.value = '';
        
        // Clear rate limit timer
        if (rateLimitTimer) {
            clearInterval(rateLimitTimer);
            rateLimitTimer = null;
        }
        rateLimitEndTime = null;
        
        // Show email form
        codeForm.classList.add('hidden');
        emailForm.classList.remove('hidden');
        
        // Hide returning user text
        if (returningUserText) {
            returningUserText.classList.add('hidden');
        }
        
        // Clear any errors and reset button
        hideError(emailError);
        hideError(codeError);
        errorMessage.textContent = '';
        requestCodeButton.disabled = false;
        requestCodeButton.textContent = 'Send Code';
        requestCodeButton.classList.remove('rate-limited');
    } catch (error) {
        console.error('Error going back to email form:', error);
    }
}

// Clear expired verifications from storage
async function clearExpiredVerifications() {
    try {
        const data = await chrome.storage.sync.get(['pendingVerification', 'pendingEmail', 'verificationTimestamp']);
        if (data.pendingVerification && data.verificationTimestamp) {
            const now = Date.now();
            const verificationAge = now - data.verificationTimestamp;
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (verificationAge >= maxAge) {
                console.log('Clearing expired verification for:', data.pendingEmail);
                await chrome.storage.sync.remove(['pendingVerification', 'pendingEmail', 'verificationTimestamp']);
            }
        }
    } catch (error) {
        console.error('Error clearing expired verifications:', error);
    }
}

// Check if there's a pending verification on page load
async function checkPendingVerification() {
    try {
        // First clear any expired verifications
        await clearExpiredVerifications();
        
        const data = await chrome.storage.sync.get(['pendingVerification', 'pendingEmail', 'verificationTimestamp']);
        if (data.pendingVerification && data.pendingEmail) {
            // Check if verification is not too old (24 hours)
            const now = Date.now();
            const verificationAge = now - (data.verificationTimestamp || 0);
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (verificationAge < maxAge) {
                console.log('Found pending verification for:', data.pendingEmail);
                currentEmail = data.pendingEmail;
                emailInput.value = data.pendingEmail;
                
                // Show code form directly
                emailForm.classList.add('hidden');
                codeForm.classList.remove('hidden');
                
                // Show returning user text
                if (returningUserText) {
                    returningUserText.classList.remove('hidden');
                }
                
                // Clear any errors
                hideError(emailError);
                hideError(codeError);
                errorMessage.textContent = '';
            } else {
                // Verification is too old, clear it
                console.log('Verification expired, clearing pending state');
                await chrome.storage.sync.remove(['pendingVerification', 'pendingEmail', 'verificationTimestamp']);
            }
        }
    } catch (error) {
        console.error('Error checking pending verification:', error);
    }
}

// Request login code
async function requestCode() {
    try {
        const email = emailInput.value.trim();
        console.log('[requestCode] Email entered:', email);
        if (!email) {
            showError(emailError, 'Please enter your email');
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError(emailError, 'Please enter a valid email address');
            return;
        }

        requestCodeButton.disabled = true;
        requestCodeButton.textContent = 'Sending...';
        errorMessage.textContent = '';

        // Check if user exists
        const userExists = await checkUserExists(email);
        console.log('[requestCode] userExists:', userExists);
        if (!userExists) {
            showError(emailError, 'No account found with this email. Please register first.');
            requestCodeButton.disabled = false;
            requestCodeButton.textContent = 'Send Code';
            return;
        }

        // Call backend to send code
        const response = await fetch(`${API_URL}/auth/request-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
            let errorMessage = 'Failed to send code';
            
            try {
                // Try to parse as JSON first
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
                
                // Handle specific error cases
                if (response.status === 429) {
                    // Rate limit exceeded
                    const retryAfter = errorData.retryAfter || 0;
                    console.log('Rate limit hit, retryAfter:', retryAfter);
                    
                    if (retryAfter > 0 && retryAfter < 3600) { // Max 1 hour
                        startRateLimitCountdown(retryAfter);
                        return; // Don't show error message, countdown will handle it
                    } else {
                        console.warn('Invalid retry time received:', retryAfter);
                        errorMessage = 'Too many requests. Please wait before trying again.';
                    }
                }
            } catch (parseError) {
                // If JSON parsing fails, try to get text content
                try {
                    const textError = await response.text();
                    if (textError.includes('Too many')) {
                        errorMessage = 'Too many code requests. Please wait before trying again.';
                    } else if (textError.trim()) {
                        errorMessage = textError.trim();
                    }
                } catch (textError) {
                    // If all else fails, use status-based message
                    if (response.status === 429) {
                        errorMessage = 'Too many requests. Please wait before trying again.';
                    } else if (response.status === 500) {
                        errorMessage = 'Server error. Please try again later.';
                    }
                }
            }
            
            showError(emailError, errorMessage);
            return;
        }

        // Store pending verification state
        await chrome.storage.sync.set({
            pendingVerification: true,
            pendingEmail: email,
            verificationTimestamp: Date.now()
        });

        // Show code form
        emailForm.classList.add('hidden');
        codeForm.classList.remove('hidden');
        currentEmail = email;
    } catch (error) {
        console.error('Code request error:', error);
        showError(emailError, error.message || 'Error sending code');
    } finally {
        requestCodeButton.disabled = false;
        requestCodeButton.textContent = 'Send Code';
    }
}

// Verify code
async function verifyCode() {
    try {
        const email = currentEmail || emailInput.value.trim();
        const code = codeInput.value.trim();

        if (!email || !code) {
            showError(codeError, 'Please enter both email and code');
            return;
        }

        verifyCodeButton.disabled = true;
        verifyCodeButton.textContent = 'Verifying...';
        errorMessage.textContent = '';

        // Verify code and get user data
        const data = await authService.verifyCode(email, code);
        console.log('Verification successful:', data); // Debug log

        // Store auth data
        await authService.setAuthData(data.token, data.user);
        console.log('Auth data stored successfully'); // Debug log

        // Clear pending verification state
        await chrome.storage.sync.remove(['pendingVerification', 'pendingEmail', 'verificationTimestamp']);

        // Redirect to popup
        window.location.href = 'popup.html';
    } catch (error) {
        console.error('Code verification error:', error);
        
        // Provide better error messages
        let errorMessage = error.message || 'Verification failed';
        
        // Handle specific error cases
        if (errorMessage.includes('Invalid or expired code')) {
            errorMessage = 'Invalid or expired code. Please request a new one.';
        } else if (errorMessage.includes('Invalid code')) {
            errorMessage = 'Invalid code. Please check and try again.';
        } else if (errorMessage.includes('Too many')) {
            errorMessage = 'Too many attempts. Please wait before trying again.';
        }
        
        showError(codeError, errorMessage);
    } finally {
        verifyCodeButton.disabled = false;
        verifyCodeButton.textContent = 'Verify Code';
    }
}

// Check if user exists
async function checkUserExists(email) {
    try {
        console.log('[checkUserExists] Checking user:', email);
        console.log('[checkUserExists] API URL:', `${API_URL}/auth/check-user`);
        
        const response = await fetch(`${API_URL}/auth/check-user`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        console.log('[checkUserExists] Response status:', response.status);
        console.log('[checkUserExists] Response headers:', response.headers);
        
        const responseText = await response.text();
        console.log('[checkUserExists] Response text:', responseText);
        
        if (!response.ok) {
            console.error('[checkUserExists] HTTP error:', response.status, responseText);
            return false;
        }
        
        try {
            const data = JSON.parse(responseText);
            console.log('[checkUserExists] Parsed data:', data);
            return data.exists;
        } catch (parseError) {
            console.error('[checkUserExists] JSON parse error:', parseError);
            console.error('[checkUserExists] Raw response:', responseText);
            return false;
        }
    } catch (error) {
        console.error('Error checking user:', error);
        return false;
    }
}

// Event Listeners
requestCodeButton.addEventListener('click', requestCode);
verifyCodeButton.addEventListener('click', verifyCode);

// Add back button event listener
const backToEmailButton = document.getElementById('backToEmailButton');
if (backToEmailButton) {
    backToEmailButton.addEventListener('click', goBackToEmail);
}

resendCodeButton.addEventListener('click', async () => {
    hideError(codeError);
    const email = currentEmail || emailInput.value.trim();
    
    resendCodeButton.disabled = true;
    resendCodeButton.textContent = 'Sending...';
    
    await requestCode();
    
    resendCodeButton.disabled = false;
    resendCodeButton.textContent = 'Resend Code';
});

// Input validation
codeInput.addEventListener('input', (e) => {
    // Only allow numbers
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    
    // Auto-submit when 6 digits are entered
    if (e.target.value.length === 6) {
        verifyCode();
    }
});

// Handle email input changes - clear pending verification if email changes
emailInput.addEventListener('input', async (e) => {
    const newEmail = e.target.value.trim();
    if (newEmail !== currentEmail && currentEmail) {
        console.log('Email changed, clearing pending verification');
        await chrome.storage.sync.remove(['pendingVerification', 'pendingEmail', 'verificationTimestamp']);
        currentEmail = '';
    }
});

// Handle Enter key
emailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        requestCode();
    }
});

codeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        verifyCode();
    }
}); 

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await checkPendingVerification();
});

// Cleanup when page is unloaded
window.addEventListener('beforeunload', () => {
    if (rateLimitTimer) {
        clearInterval(rateLimitTimer);
        rateLimitTimer = null;
    }
}); 