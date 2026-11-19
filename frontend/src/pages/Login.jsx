import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../api';
import PasswordField from '../components/PasswordField';

function Login() {
  const { login, verifyLogin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const signedInUser = challenge
        ? await verifyLogin(challenge.challengeId, code)
        : await login(form.email, form.password);
      if (signedInUser.mfaRequired) {
        setChallenge(signedInUser);
        setLoading(false);
        return;
      }
      if (signedInUser.role === 'agency') {
        window.location.assign(new URL('/agency-portal/', api.defaults.baseURL).toString());
      } else {
        navigate(signedInUser.role === 'admin' ? '/admin' : '/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      if (challenge && err.response?.status === 401) { setChallenge(null); setCode(''); }
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-card">
      <h2>{t('login_title')}</h2>
      <form className="report-form" onSubmit={handleSubmit}>
        {challenge ? (
          <div className="kw-form-section">
            <p role="status">{challenge.message}</p>
            <label htmlFor="mfa-code">Sign-in code</label>
            <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </div>
        ) : (
          <>
            <div className="kw-form-section">
              <label htmlFor="email">{t('label_email')}</label>
              <input id="email" name="email" type="email" autoComplete="username" value={form.email} onChange={handleChange} required />
            </div>
            <PasswordField
              id="password"
              label={t('label_password')}
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
            />
          </>
        )}
        <button type="submit" disabled={loading}>{loading ? t('btn_signingIn') : t('signIn')}</button>
        {error && (
          <div className="error" role="alert" aria-live="assertive">{error}</div>
        )}
        {error && error.toLowerCase().includes('awaiting admin approval') && (
          <div className="kw-reviewer-app-note" role="status">
            Your reviewer application is still <strong>pending</strong>. An Admin verifies each
            applicant's documents before granting reviewer access — try signing in again after
            you receive approval, or <Link to="/reviewer-application">submit a new application</Link>
            {' '}if this was a rejection.
          </div>
        )}
      </form>
      <div className="kw-auth-switch">
        {t('noAccount')} <Link to="/register">{t('register')}</Link>
      </div>
      <div className="kw-auth-switch">
        <Link to="/forgot-password">{t('forgotPassword')}</Link>
      </div>
    </div>
  );
}

export default Login;
