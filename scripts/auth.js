const API_URL = 'http://localhost:3001/api'; // Change this to your production URL when deploying

class AuthService {
    constructor() {
        this.token = null;
        this.user = null;
        this.loadAuthData();
    }

    async loadAuthData() {
        try {
            const data = await chrome.storage.sync.get(['token', 'user']);
            console.log('Loaded auth data:', data);
            this.token = data.token;
            this.user = data.user;
            return !!this.token;
        } catch (error) {
            console.error('Error loading auth data:', error);
            return false;
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
            // If refresh fails, clear auth data and redirect to login
            await this.logout();
            throw error;
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        try {
            if (!this.token) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${this.token}`,
                },
            });

            // If token expired, try to refresh it
            if (response.status === 401) {
                await this.refreshToken();
                // Retry the original request with new token
                return fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'Authorization': `Bearer ${this.token}`,
                    },
                });
            }

            return response;
        } catch (error) {
            console.error('Authenticated request error:', error);
            throw error;
        }
    }

    async register(username, email, password) {
        try {
            console.log('Registering with:', { username, email });
            const response = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Registration failed');
            }

            await this.setAuthData(data.token, data.user);
            return data;
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    async login(email, password) {
        try {
            console.log('Logging in with:', { email });
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Login failed');
            }

            console.log('Login successful, setting auth data:', data);
            await this.setAuthData(data.token, data.user);
            return data;
        } catch (error) {
            console.error('Login error:', error);
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
        const isAuth = !!this.token;
        console.log('Checking authentication:', { isAuth, token: this.token });
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