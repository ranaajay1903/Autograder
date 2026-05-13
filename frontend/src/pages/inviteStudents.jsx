import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/auth';
import './inviteStudents.css';

export default function InviteStudents() {
  const navigate = useNavigate();
  const [emails, setEmails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [results, setResults] = useState(null);

  const handleGoBack = () => {
    navigate('/admin/dashboard');
  };

  const parseEmails = (text) => {
    return text
      .split(/[\s,;\n]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0);
  };

  const handleSendInvites = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setResults(null);

    const emailList = parseEmails(emails);
    if (emailList.length === 0) {
      setError('Please enter at least one email address');
      return;
    }

    setLoading(true);
    try {
      const selectedCourseId = localStorage.getItem('selectedCourseId');
      if (!selectedCourseId) {
        setError('Please select a course before inviting students.');
        setLoading(false);
        return;
      }

      const response = await api.post(`/invite/send?courseId=${selectedCourseId}`, {
        emails: emailList,
      });

      setResults(response.data.results);
      setSuccess(`${response.data.results.successCount} invitation(s) sent successfully!`);
      setEmails('');

      // Show development mode links if available
      if (response.data.invites && response.data.invites.length > 0) {
        console.log('📧 Development Mode - Invite Links:');
        response.data.invites.forEach(inv => {
          console.log(`${inv.email}: ${inv.inviteLink}`);
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error sending invitations');
      console.error('Invite error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="invite-container">
      <div className="invite-header">
        <button className="back-button" onClick={handleGoBack}>
          ← Back to Admin Dashboard
        </button>
        <h1>Invite Students</h1>
        <p className="subtitle">Enter email addresses of students to invite them to join the platform</p>
      </div>

      <div className="invite-content">
        <form onSubmit={handleSendInvites} className="invite-form">
          <div className="form-group">
            <label htmlFor="emails">Student Email Addresses:</label>
            <textarea
              id="emails"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="Enter emails separated by commas, semicolons, or new lines&#10;Example:&#10;student1@example.com&#10;student2@example.com&#10;student3@example.com"
              rows="8"
              disabled={loading}
            />
            <p className="help-text">
              You can paste multiple emails separated by commas, semicolons, or new lines
            </p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <button type="submit" disabled={loading} className="submit-button">
            {loading ? 'Sending Invitations...' : 'Send Invitations'}
          </button>
        </form>

        {results && (
          <div className="results-section">
            <h2>Invitation Results</h2>
            
            {results.successEmails && results.successEmails.length > 0 && (
              <div className="results-group">
                <h3>✓ Successfully Sent ({results.successEmails.length})</h3>
                <ul className="success-list">
                  {results.successEmails.map((email, idx) => (
                    <li key={idx}>{email}</li>
                  ))}
                </ul>
              </div>
            )}

            {results.failedEmails && results.failedEmails.length > 0 && (
              <div className="results-group">
                <h3>✗ Failed ({results.failedEmails.length})</h3>
                <ul className="error-list">
                  {results.failedEmails.map((item, idx) => (
                    <li key={idx}>
                      <strong>{item.email}</strong> - {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
