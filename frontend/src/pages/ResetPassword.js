import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../api';

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [token, setToken] = useState(searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { email, token, newPassword });
      setSuccess(res.data.message);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed');
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-card">
      <h2>Reset Password</h2>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="token">Reset token</label>
          <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required />
          <div className="kw-helper">Paste the token from the reset link (or backend console in this demo).</div>
        </div>
        <div className="kw-form-section">
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Updating...' : 'Reset Password'}</button>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
      </form>
      <div className="kw-auth-switch">
        <Link to="/login">Back to sign in</Link>
      </div>
    </div>
  );
}

export default ResetPassword;
