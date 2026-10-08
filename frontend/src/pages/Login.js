import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

function Login() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-card">
      <h2>{t('login_title')}</h2>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="email">{t('label_email')}</label>
          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="password">{t('label_password')}</label>
          <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required />
        </div>
        <button type="submit" disabled={loading}>{loading ? t('btn_signingIn') : t('signIn')}</button>
        {error && <div className="error">{error}</div>}
      </form>
      <div className="kw-auth-switch">
        {t('noAccount')} <Link to="/register">{t('register')}</Link>
      </div>
      <div className="kw-auth-switch">
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
    </div>
  );
}

export default Login;
