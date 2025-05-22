const API_URL = 'http://91.99.69.198:3001/api'; // Production server on Hetzner

class AuthService {
    constructor() {
        this.token = null;
        this.user = null;
        this.initialized = false;
        this.initializing = false;
    }

    async loadAuthData() {
        if (this.initializing) {
            console.log('Auth initialization already in progress');
            return;
        }

        this.initializing = true;
        try {
            const data = await chrome.storage.sync.get(['token', 'user']);
            console.log('Loaded auth data:', data);
            
            if (data.token) {
                this.token = data.token;
                this.user = data.user;
                console.log('Auth data loaded successfully');
            } else {
                console.log('No auth data found in storage');
            }
            
            this.initialized = true;
            return !!this.token;
        } catch (error) {
            console.error('Error loading auth data:', error);
            this.initialized = true;
            return false;
        } finally {
            this.initializing = false;
        }
    }

    async refreshToken() {
        try {
            if (!this.token) {
                throw new Error('No token available to refresh');
            }

            const response = await fetch(`${API_URL}/auth/refresh-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: this.token }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Token refresh failed');
            }

            await this.setAuthData(data.token, data.user);
            return data;
        } catch (error) {
            console.error('Token refresh error:', error);
            throw error;
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        try {
            const token = await this.getToken();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
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

    async checkServerConnection() {
        try {
            const response = await fetch(`${API_URL}/auth/health`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 5000 // 5 second timeout
            });
            return response.ok;
        } catch (error) {
            console.error('Server connection check failed:', error);
            return false;
        }
    }

    async register(username, email, password) {
        try {
            console.log('Attempting to connect to server:', API_URL);
            console.log('Registering with:', { username, email });
            
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
                timeout: 10000 // 10 second timeout
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Registration failed with status: ${response.status}`);
            }

            const data = await response.json();
            await this.setAuthData(data.token, data.user);
            return data;
        } catch (error) {
            console.error('Registration error:', error);
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                throw new Error('Unable to connect to server. Please check your internet connection and try again.');
            }
            throw error;
        }
    }

    async login(email, password) {
        try {
            console.log('Attempting to connect to server:', API_URL);
            console.log('Logging in with:', { email });
            
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
                timeout: 10000 // 10 second timeout
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `Login failed with status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Login successful, setting auth data:', data);
            await this.setAuthData(data.token, data.user);
            return data;
        } catch (error) {
            console.error('Login error:', error);
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                throw new Error('Unable to connect to server. Please check your internet connection and try again.');
            }
            throw error;
        }
    }

    async getMembershipStatus() {
        try {
            const response = await this.makeAuthenticatedRequest(`${API_URL}/membership/status`);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Failed to fetch membership status');
            }
            return data;
        } catch (error) {
            console.error('Membership status error:', error);
            throw error;
        }
    }

    async logout() {
        console.log('Logging out...');
        this.token = null;
        this.user = null;
        await chrome.storage.sync.remove(['token', 'user', 'isLoggedIn']);
        // Redirect to login page if we're in the popup
        if (window.location.pathname.includes('popup.html')) {
            window.location.href = 'login.html';
        }
    }

    async setAuthData(token, user) {
        console.log('Setting auth data:', { token, user });
        this.token = token;
        this.user = user;
        await chrome.storage.sync.set({ 
            token, 
            user,
            isLoggedIn: true 
        });
        // Verify the data was stored
        const stored = await chrome.storage.sync.get(['token', 'user']);
        console.log('Stored auth data:', stored);
    }

    isAuthenticated() {
        if (!this.initialized) {
            console.log('Auth not initialized yet');
            return false;
        }
        const isAuth = !!this.token;
        console.log('Checking authentication:', { isAuth, token: this.token ? this.token.substring(0, 10) + '...' : null });
        return isAuth;
    }

    getToken() {
        return this.token;
    }

    getUser() {
        return this.user;
    }
}

export const authService = new AuthService(); 