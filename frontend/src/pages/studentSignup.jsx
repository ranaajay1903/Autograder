import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/auth';
import './studentSignup.css';

// Eye Icon SVG Components
const EyeOpenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeClosedIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

export default function StudentSignup() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tokenValid, setTokenValid] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Apply dark theme by default
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  // Validate token on component mount
  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link. Please check the link and try again.');
      setLoading(false);
      return;
    }

    const validateToken = async () => {
      try {
        const response = await api.get(`/invite/validate/${token}`);
        setEmail(response.data.email);
        setTokenValid(true);
        setError('');
      } catch (err) {
        const message = err.response?.data?.message || 'Invalid or expired invitation link';
        setError(message);
        setTokenValid(false);
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!password || !confirmPassword) {
      setError('Please enter password in both fields');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post('/invite/complete-signup', {
        token,
        password,
      });

      setSuccess('Account created successfully! Redirecting to login...');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      const message = err.response?.data?.message || 'Error creating account';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-container">
      <div className="signup-card">
        <div className="signup-header">
          <h1>Create Your Account</h1>
          <p>Welcome to Autograder! Complete your sign-up to get started.</p>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Validating your invitation...</p>
          </div>
        ) : tokenValid ? (
          <form onSubmit={handleSignup} className="signup-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="email-display">
                <input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="email-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a secure password"
                  disabled={submitting}
                  className="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="toggle-password"
                  disabled={submitting}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
              </div>
              <div className="password-requirements">
                <div className="requirement">
                  <span className={password.length >= 6 ? 'met' : 'unmet'}>✓</span>
                  At least 6 characters
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="password-input-wrapper">
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  disabled={submitting}
                  className="password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="toggle-password"
                  disabled={submitting}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeClosedIcon /> : <EyeOpenIcon />}
                </button>
              </div>
              {password && confirmPassword && (
                <div className="match-indicator">
                  {password === confirmPassword ? (
                    <span className="match">✓ Passwords match</span>
                  ) : (
                    <span className="no-match">✗ Passwords do not match</span>
                  )}
                </div>
              )}
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <button
              type="submit"
              disabled={submitting}
              className="submit-button"
            >
              {submitting ? 'Creating Account...' : 'Create Account'}
            </button>

            <p className="login-link">
              Already have an account? <a href="/login">Sign in here</a>
            </p>
          </form>
        ) : (
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <p>{error}</p>
            <a href="/login" className="back-to-login">
              Back to Login
            </a>
          </div>
        )}
      </div>
    </div>
  );
}