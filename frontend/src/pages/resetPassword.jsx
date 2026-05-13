import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPassword, validatePasswordResetToken } from "../services/auth";
import "./login.css";

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token");

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [tokenValid, setTokenValid] = useState(false);

    // Apply dark theme by default
    useEffect(() => {
        document.documentElement.setAttribute("data-theme", "dark");
    }, []);

    useEffect(() => {
        if (!token) {
            setError("Invalid reset link.");
            setLoading(false);
            return;
        }

        const validateToken = async () => {
            try {
                const data = await validatePasswordResetToken(token);
                setEmail(data.email);
                setTokenValid(true);
            } catch (err) {
                setError(err.response?.data?.message || "Invalid or expired reset link");
                setTokenValid(false);
            } finally {
                setLoading(false);
            }
        };

        validateToken();
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (password.length < 6) {
            setError("Password must be at least 6 characters long");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setSubmitting(true);
        try {
            const data = await resetPassword(token, password);
            setSuccess(data.message);
            setTimeout(() => navigate("/login"), 2000);
        } catch (err) {
            setError(err.response?.data?.message || "Unable to reset password");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-wrapper">
                <div className="login-card">
                    <div className="login-header">
                        <h1 className="brand-title">Choose New Password</h1>
                        <p className="brand-subtitle">Set a new password for {email || "your account"}.</p>
                    </div>

                    {loading ? (
                        <div className="helper-text">Validating reset link...</div>
                    ) : tokenValid ? (
                        <form onSubmit={handleSubmit} className="login-form">
                            <div className="form-group">
                                <label htmlFor="password" style={{color:"var(--text-primary)"}}>New Password</label>
                                <input
                                    type="password"
                                    id="password"
                                    placeholder="Enter new password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={submitting}
                                    className="form-input"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="confirmPassword" style={{color:"var(--text-primary)"}}>Confirm Password</label>
                                <input
                                    type="password"
                                    id="confirmPassword"
                                    placeholder="Confirm new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    disabled={submitting}
                                    className="form-input"
                                />
                            </div>

                            {error && <div className="error-message">{error}</div>}
                            {success && <div className="success-message">{success} Redirecting to login...</div>}

                            <button type="submit" className="btn-login" disabled={submitting}>
                                {submitting ? "Updating..." : "Reset Password"}
                            </button>
                        </form>
                    ) : (
                        <div className="login-form">
                            <div className="error-message">{error}</div>
                        </div>
                    )}

                    <div className="form-link-row">
                        <Link to="/login" className="form-link">Back to login</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
