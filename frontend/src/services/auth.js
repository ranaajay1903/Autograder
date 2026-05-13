import axios from "axios";

// ============================================================
// 🚀 RUNTIME URL DETECTION (The "Nuclear" Fix)
// This ignores Vercel settings and checks the browser URL directly.
// ============================================================
const isLocalHost = window.location.hostname.includes("localhost");
const envApiUrl = import.meta.env.VITE_API_URL;
const sameOriginApiUrl = `${window.location.origin}/api`;

const API_URL = isLocalHost
  ? (envApiUrl || "http://localhost:5000/api")
  : (envApiUrl || sameOriginApiUrl);

console.log("🌐 Frontend connected to:", API_URL);
// ============================================================

const api = axios.create({
    baseURL: API_URL
});

export const AUTH_LOGOUT_EVENT = "auth:logout";

const clearAuthStorage = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("lastActivityAt");
    localStorage.removeItem("selectedCourseId");
    localStorage.removeItem("selectedCourse");
};

// Request Interceptor: Attach token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response Interceptor: Automatically handles expired tokens
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        // If the error is 401 (Unauthorized/Expired) and we haven't tried refreshing yet
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const refreshToken = localStorage.getItem("refreshToken");

            if (refreshToken) {
                try {
                    // Call the refresh endpoint
                    const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
                    const newToken = res.data.token;
                    
                    // Store new token
                    localStorage.setItem("token", newToken);
                    
                    // Update header and retry the original request
                    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                    return api(originalRequest);
                } catch (refreshError) {
                    // If refresh fails, log out the user
                    logout();
                }
            }
        }
        return Promise.reject(error);
    }
);

export const login = async (email, password) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("refreshToken", res.data.refreshToken); // Store refresh token
    localStorage.setItem("user", JSON.stringify(res.data.user));
    return res.data;
};

export const requestPasswordReset = async (email) => {
    const res = await axios.post(`${API_URL}/auth/password-reset/forgot-password`, { email });
    return res.data;
};

export const validatePasswordResetToken = async (token) => {
    const res = await axios.get(`${API_URL}/auth/password-reset/validate/${token}`);
    return res.data;
};

export const resetPassword = async (token, password) => {
    const res = await axios.post(`${API_URL}/auth/password-reset/reset-password`, { token, password });
    return res.data;
};

export const logout = () => {
    clearAuthStorage();
    window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
    window.location.replace("/");
};

export const getToken = () => localStorage.getItem("token");

export const getUser = () => {
    const user = localStorage.getItem("user");
    return user ? JSON.parse(user) : null;
};

export default api;
