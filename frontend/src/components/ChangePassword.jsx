import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import PasswordField, { STRONG_PASSWORD_PATTERN } from './PasswordField';

const POLICY = 'At least 8 characters with an uppercase letter, a lowercase letter, a number and a special character.';

// A signed-in user changes their own password. The current password is required,
// and every other device is signed out when it succeeds.
function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const mismatch = confirmPassword !== '' && confirmPassword !== newPassword;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword !== confirmPassword) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      setMessage(res.data.message || 'Password changed.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change the password. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="kw-page-card kw-change-password" aria-labelledby="change-password-heading">
      <div className="kw-dashboard-eyebrow">PASSWORD &amp; SECURITY</div>
      <h2 id="change-password-heading">Change your password</h2>
      <p className="kw-helper">
        Forgot it instead? Use <Link to="/forgot-password">Forgot password</Link> on the sign-in page. Changing it signs out every other
        device where you are signed in.
      </p>
      <form className="report-form" onSubmit={submit}>
        <PasswordField
          id="current-password"
          label="Current password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
        <PasswordField
          id="new-password"
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          pattern={STRONG_PASSWORD_PATTERN}
          title={POLICY}
        />
        <div className="kw-helper">{POLICY}</div>
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
        {mismatch && <div className="error" role="alert">The new password and its confirmation do not match.</div>}
        <button type="submit" className="kw-btn" disabled={busy || !currentPassword || !newPassword || mismatch}>
          {busy ? 'Changing…' : 'Change password'}
        </button>
        {error && <div className="error" role="alert">{error}</div>}
        {message && <div className="success" role="status">{message}</div>}
      </form>
    </section>
  );
}

export default ChangePassword;
