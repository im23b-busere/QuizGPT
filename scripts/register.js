const API_URL = 'https://api.quizgpt.site/api';

const registerForm = document.getElementById('registerForm');
const registerEmail = document.getElementById('registerEmail');
const registerUsername = document.getElementById('registerUsername');
const registerButton = document.getElementById('registerButton');
const registerError = document.getElementById('registerError');

const registerCodeForm = document.getElementById('registerCodeForm');
const registerCodeInput = document.getElementById('registerCodeInput');
const verifyRegisterCodeButton = document.getElementById('verifyRegisterCodeButton');
const registerCodeError = document.getElementById('registerCodeError');

let currentEmail = '';
let currentUsername = '';

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

// Clear expired verifications from storage
async function clearExpiredVerifications() {
    try {
        const data = await chrome.storage.sync.get(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
        if (data.pendingRegistration && data.registrationTimestamp) {
            const now = Date.now();
            const verificationAge = now - data.registrationTimestamp;
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (verificationAge >= maxAge) {
                console.log('Clearing expired registration for:', data.pendingEmail);
                await chrome.storage.sync.remove(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
            }
        }
    } catch (error) {
        console.error('Error clearing expired registrations:', error);
    }
}

// Check if there's a pending registration on page load
async function checkPendingRegistration() {
    try {
        // First clear any expired registrations
        await clearExpiredVerifications();
        
        const data = await chrome.storage.sync.get(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
        if (data.pendingRegistration && data.pendingEmail && data.pendingUsername) {
            // Check if registration is not too old (24 hours)
            const now = Date.now();
            const verificationAge = now - (data.registrationTimestamp || 0);
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
            
            if (verificationAge < maxAge) {
                console.log('Found pending registration for:', data.pendingEmail);
                currentEmail = data.pendingEmail;
                currentUsername = data.pendingUsername;
                registerEmail.value = data.pendingEmail;
                registerUsername.value = data.pendingUsername;
                
                // Show code form directly
                registerForm.classList.add('hidden');
                registerCodeForm.classList.remove('hidden');
                
                // Clear any errors
                hideError(registerError);
                hideError(registerCodeError);
            } else {
                // Registration is too old, clear it
                console.log('Registration expired, clearing pending state');
                await chrome.storage.sync.remove(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
            }
        }
    } catch (error) {
        console.error('Error checking pending registration:', error);
    }
}

// Clear pending registration and go back to register form
async function goBackToRegister() {
    try {
        await chrome.storage.sync.remove(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
        currentEmail = '';
        currentUsername = '';
        registerEmail.value = '';
        registerUsername.value = '';
        
        // Show register form
        registerCodeForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        
        // Clear any errors
        hideError(registerError);
        hideError(registerCodeError);
    } catch (error) {
        console.error('Error going back to register form:', error);
    }
}

registerButton.addEventListener('click', async (e) => {
    e.preventDefault();
    hideError(registerError);
    const email = registerEmail.value.trim();
    const username = registerUsername.value.trim();
    if (!email || !username) {
        showError(registerError, 'Please enter both email and username');
        return;
    }
    registerButton.disabled = true;
    registerButton.textContent = 'Registering...';
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, username })
        });
        const data = await response.json();
        if (!response.ok) {
            showError(registerError, data.message || 'Registration failed');
            return;
        }
        
        // Store pending registration state
        await chrome.storage.sync.set({
            pendingRegistration: true,
            pendingEmail: email,
            pendingUsername: username,
            registrationTimestamp: Date.now()
        });
        
        // Show code form
        registerForm.classList.add('hidden');
        registerCodeForm.classList.remove('hidden');
        currentEmail = email;
        currentUsername = username;
    } catch (error) {
        showError(registerError, error.message || 'Registration error');
    } finally {
        registerButton.disabled = false;
        registerButton.textContent = 'Register';
    }
});

verifyRegisterCodeButton.addEventListener('click', async (e) => {
    e.preventDefault();
    hideError(registerCodeError);
    const email = currentEmail || registerEmail.value.trim();
    const code = registerCodeInput.value.trim();
    if (!email || !code) {
        showError(registerCodeError, 'Please enter the code sent to your email');
        return;
    }
    verifyRegisterCodeButton.disabled = true;
    verifyRegisterCodeButton.textContent = 'Verifying...';
    try {
        const response = await fetch(`${API_URL}/auth/verify-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, code })
        });
        const data = await response.json();
        if (!response.ok) {
            showError(registerCodeError, data.message || 'Verification failed');
            return;
        }
        
        // Clear pending registration state
        await chrome.storage.sync.remove(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
        
        // Registration complete, redirect to login
        window.location.href = 'login.html';
    } catch (error) {
        showError(registerCodeError, error.message || 'Verification error');
    } finally {
        verifyRegisterCodeButton.disabled = false;
        verifyRegisterCodeButton.textContent = 'Verify Code';
    }
});

// Handle email/username input changes - clear pending registration if they change
registerEmail.addEventListener('input', async (e) => {
    const newEmail = e.target.value.trim();
    if (newEmail !== currentEmail && currentEmail) {
        console.log('Email changed, clearing pending registration');
        await chrome.storage.sync.remove(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
        currentEmail = '';
        currentUsername = '';
    }
});

registerUsername.addEventListener('input', async (e) => {
    const newUsername = e.target.value.trim();
    if (newUsername !== currentUsername && currentUsername) {
        console.log('Username changed, clearing pending registration');
        await chrome.storage.sync.remove(['pendingRegistration', 'pendingEmail', 'pendingUsername', 'registrationTimestamp']);
        currentEmail = '';
        currentUsername = '';
    }
});

// Handle Enter key
registerEmail.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        registerButton.click();
    }
});

registerUsername.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        registerButton.click();
    }
});

registerCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        verifyRegisterCodeButton.click();
    }
});

// Input validation for code
registerCodeInput.addEventListener('input', (e) => {
    // Only allow numbers
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    
    // Auto-submit when 6 digits are entered
    if (e.target.value.length === 6) {
        verifyRegisterCodeButton.click();
    }
});

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    await checkPendingRegistration();
    
    // Add back button event listener
    const backToRegisterButton = document.getElementById('backToRegisterButton');
    if (backToRegisterButton) {
        backToRegisterButton.addEventListener('click', goBackToRegister);
    }
    
    // Add resend button event listener
    const resendRegisterCodeButton = document.getElementById('resendRegisterCodeButton');
    if (resendRegisterCodeButton) {
        resendRegisterCodeButton.addEventListener('click', async () => {
            hideError(registerCodeError);
            const email = currentEmail || registerEmail.value.trim();
            const username = currentUsername || registerUsername.value.trim();
            
            if (!email || !username) {
                showError(registerCodeError, 'Please go back and enter your email and username');
                return;
            }
            
            resendRegisterCodeButton.disabled = true;
            resendRegisterCodeButton.textContent = 'Sending...';
            
            try {
                const response = await fetch(`${API_URL}/auth/register`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, username })
                });
                const data = await response.json();
                if (!response.ok) {
                    showError(registerCodeError, data.message || 'Failed to resend code');
                    return;
                }
                
                // Update pending registration state
                await chrome.storage.sync.set({
                    pendingRegistration: true,
                    pendingEmail: email,
                    pendingUsername: username,
                    registrationTimestamp: Date.now()
                });
                
                showError(registerCodeError, 'Code resent successfully!');
                setTimeout(() => hideError(registerCodeError), 3000);
            } catch (error) {
                showError(registerCodeError, error.message || 'Error resending code');
            } finally {
                resendRegisterCodeButton.disabled = false;
                resendRegisterCodeButton.textContent = 'Resend Code';
            }
        });
    }
}); 