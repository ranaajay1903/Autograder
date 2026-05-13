import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../services/auth";
import "./login.css";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [devLink, setDevLink] = useState("");

    // Apply dark theme by default
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", "dark");
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess("");
        setDevLink("");

        try {
            const data = await requestPasswordReset(email);
            setSuccess(data.message);
            if (data.resetLink) {
                setDevLink(data.resetLink);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Unable to send reset link");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-wrapper">
                <div className="login-card">
                    <div className="login-header">
                        <h1 className="brand-title">Reset Password</h1>
                        <p className="brand-subtitle">Enter your email and we will send you a reset link.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
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

                        {error && <div className="error-message">{error}</div>}
                        {success && <div className="success-message">{success}</div>}
                        {devLink && <div className="helper-text">Development reset link: <a href={devLink}>{devLink}</a></div>}

                        <button type="submit" className="btn-login" disabled={loading}>
                            {loading ? "Sending..." : "Send Reset Link"}
                        </button>
                    </form>

                    <div className="form-link-row">
                        <Link to="/login" className="form-link">Back to login</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
