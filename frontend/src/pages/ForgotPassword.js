import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
    } catch (err) {
      setMessage('If this email is registered, a reset link has been sent.');
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-card">
      <h2>Forgot Password</h2>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send Reset Link'}</button>
        {message && <div className="success">{message}</div>}
      </form>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        No email service is configured for this project yet - for local testing, the reset link is printed to the backend server console instead of being emailed.
      </div>
      <div className="kw-auth-switch">
        <Link to="/login">Back to sign in</Link>
      </div>
    </div>
  );
}

export default ForgotPassword;
