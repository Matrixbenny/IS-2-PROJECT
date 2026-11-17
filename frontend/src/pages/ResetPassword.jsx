import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../api';
import { useLanguage } from '../context/LanguageContext';
import PasswordField, { STRONG_PASSWORD_PATTERN } from '../components/PasswordField';

function ResetPassword() {
  const { t } = useLanguage();
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
      setError(err.response?.data?.error || t('reset_failed'));
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-card">
      <h2>{t('reset_title')}</h2>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="email">{t('label_email')}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="token">{t('label_resetToken')}</label>
          <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required />
          <div className="kw-helper">{t('reset_helper')}</div>
        </div>
        <PasswordField
          id="newPassword"
          label={t('label_newPassword')}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          pattern={STRONG_PASSWORD_PATTERN}
          title={t('password_helper')}
        />
        <div className="kw-helper">{t('password_helper')}</div>
        <button type="submit" disabled={loading}>{loading ? t('reset_updating') : t('reset_submit')}</button>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
      </form>
      <div className="kw-auth-switch">
        <Link to="/login">{t('forgot_back')}</Link>
      </div>
    </div>
  );
}

export default ResetPassword;
