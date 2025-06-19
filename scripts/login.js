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

let currentEmail = '';

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
            const data = await response.json();
            showError(emailError, data.message || 'Failed to send code');
            return;
        }

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
        const email = emailInput.value.trim();
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

        // Redirect to popup
        window.location.href = 'popup.html';
    } catch (error) {
        console.error('Code verification error:', error);
        showError(error.message);
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

resendCodeButton.addEventListener('click', async () => {
    hideError(codeError);
    const email = emailInput.value.trim();
    
    resendCodeButton.disabled = true;
    resendCodeButton.textContent = 'Sending...';
    
    await requestCode(email);
    
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