const API_URL = 'https://api.quizgpt.site/api';

class AuthService {
    constructor() {
        this.token = null;
        this.user = null;
        this.initialized = false;
    }

    async loadAuthData() {
        try {
            console.log('Loading auth data from storage...'); // Debug log
            const data = await chrome.storage.sync.get(['token', 'user']);
            console.log('Loaded data:', data); // Debug log
            
            if (data.token && data.user) {
                this.token = data.token;
                this.user = data.user;
                console.log('Auth data loaded successfully:', { token: this.token, user: this.user }); // Debug log
            } else {
                console.log('No auth data found in storage'); // Debug log
            }
            
            this.initialized = true;
            return {
                isLoggedIn: !!this.token,
                token: this.token,
                user: this.user
            };
        } catch (error) {
            console.error('Error loading auth data:', error);
            this.initialized = true;
            return { isLoggedIn: false };
        }
    }

    async verifyCode(email, code) {
        try {
            console.log('Verifying code for:', email); // Debug log
            const response = await fetch(`${API_URL}/auth/verify-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, code })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Verification failed');
            }

            const data = await response.json();
            console.log('Verification response:', data); // Debug log

            // Store auth data
            await this.setAuthData(data.token, data.user);
            return data;
        } catch (error) {
            console.error('Code verification error:', error);
            throw error;
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        try {
            if (!this.token) {
                const authData = await this.loadAuthData();
                if (!authData.isLoggedIn) {
                    throw new Error('Not authenticated');
                }
            }

            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('Du hast dein kostenloses Kontingent aufgebraucht. Upgrade auf Premium für unbegrenzten Zugriff auf QuizGPT!');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response;
        } catch (error) {
            console.error('[Auth] Request failed:', error);
            throw error;
        }
    }

    async logout() {
        console.log('Logging out...'); // Debug log
        this.token = null;
        this.user = null;
        await chrome.storage.sync.remove(['token', 'user']);
    }

    async setAuthData(token, user) {
        console.log('Setting auth data:', { token, user }); // Debug log
        if (!token || !user) {
            console.error('Invalid auth data:', { token, user });
            throw new Error('Invalid auth data');
        }
        this.token = token;
        this.user = user;
        await chrome.storage.sync.set({ token, user });
        // Verify the data was stored
        const stored = await chrome.storage.sync.get(['token', 'user']);
        console.log('Stored auth data:', stored); // Debug log
        if (!stored.token || !stored.user) {
            throw new Error('Failed to store auth data');
        }
    }
}

export const authService = new AuthService(); 