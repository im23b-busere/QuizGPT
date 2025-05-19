import { authService } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth data to be loaded
    await authService.loadAuthData();

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegisterLink = document.getElementById('showRegister');
    const showLoginLink = document.getElementById('showLogin');
    const errorMessage = document.getElementById('errorMessage');

    // Check if user is already logged in
    if (authService.isAuthenticated()) {
        console.log('Already authenticated, redirecting to popup');
        window.location.href = 'popup.html';
        return;
    }

    // Show/hide forms
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        errorMessage.classList.add('hidden');
    });

    // Handle login
    document.getElementById('loginButton').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        try {
            await authService.login(email, password);
            // Wait a moment to ensure storage is updated
            await new Promise(resolve => setTimeout(resolve, 100));
            window.location.href = 'popup.html';
        } catch (error) {
            showError(error.message);
        }
    });

    // Handle registration
    document.getElementById('registerButton').addEventListener('click', async () => {
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;

        try {
            await authService.register(username, email, password);
            // Wait a moment to ensure storage is updated
            await new Promise(resolve => setTimeout(resolve, 100));
            window.location.href = 'popup.html';
        } catch (error) {
            showError(error.message);
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }
}); 