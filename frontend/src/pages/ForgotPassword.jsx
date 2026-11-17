import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useLanguage } from '../context/LanguageContext';

function ForgotPassword() {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      setMessage(res.data.message);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not submit the reset request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kw-auth-card">
      <h2>{t('forgot_title')}</h2>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="email">{t('label_email')}</label>
          <input id="email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" disabled={loading}>{loading ? t('forgot_sending') : t('forgot_send')}</button>
        {message && <div className="success">{message}</div>}
        {error && <div className="error" role="alert">{error}</div>}
      </form>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        {t('forgot_helper')}
      </div>
      <div className="kw-auth-switch">
        <Link to="/login">{t('forgot_back')}</Link>
      </div>
    </div>
  );
}

export default ForgotPassword;
