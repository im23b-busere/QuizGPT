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
        // Show code form
        registerForm.classList.add('hidden');
        registerCodeForm.classList.remove('hidden');
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
    const email = registerEmail.value.trim();
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
        // Registration complete, redirect to login
        window.location.href = 'login.html';
    } catch (error) {
        showError(registerCodeError, error.message || 'Verification error');
    } finally {
        verifyRegisterCodeButton.disabled = false;
        verifyRegisterCodeButton.textContent = 'Verify Code';
    }
}); 