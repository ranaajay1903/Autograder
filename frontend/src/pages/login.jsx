import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../services/auth"; // <--- Now importing the correct service
import "./login.css";

export default function Login({ setIsAuthenticated, setUserRole, setUser }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    // Apply dark theme by default
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const data = await login(email, password);

            const normalizedRole = (data.user.role === 'ta' || data.user.role === 'TA') ? 'grader' : data.user.role;
            const userToStore = { ...data.user, role: normalizedRole };

            setIsAuthenticated(true);
            setUserRole(normalizedRole);
            setUser(userToStore);
            navigate(`/${normalizedRole}`);

        } catch (err) {
            console.error("Login error:", err);
            // Handle error response from axios
            const msg = err.response?.data?.message || "Login failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-wrapper">
                {/* Main Login Card */}
                <div className="login-card">
                    <div className="login-header">
                        <h1 className="brand-title">Autograder</h1>
                    </div>

                    <form onSubmit={handleLogin} className="login-form">
                        <div className="form-group">
                            <label htmlFor="email" style={{color:"var(--text-primary)"}}>Email</label>
                            <input
                                type="email"
                                id="email"
                                placeholder="Enter email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                disabled={loading}
                                className="form-input"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password" style={{color:"var(--text-primary)"}}>Password</label>
                            <input
                                type="password"
                                id="password"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                disabled={loading}
                                className="form-input"
                            />
                        </div>

                        <div className="form-link-row">
                            <Link to="/forgot-password" className="form-link">Forgot password?</Link>
                        </div>

                        {error && <div className="error-message">{error}</div>}

                        <button
                            type="submit"
                            className="btn-login"
                            disabled={loading}
                        >
                            {loading ? "Logging in..." : "Login"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
