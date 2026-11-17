import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import PasswordField, { STRONG_PASSWORD_PATTERN } from '../components/PasswordField';

function Register() {
  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [roleChoice, setRoleChoice] = useState('citizen');
  const [form, setForm] = useState({ name: '', email: '', password: '', emailNotificationsOptIn: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || t('register_failed'));
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-card">
      <h2>{t('register_title')}</h2>
      <div className="kw-helper" style={{ marginBottom: 16 }}>
        {t('register_helper')}
      </div>

      {/* Step 1: pick the account purpose. Citizens sign up straight away;
          reviewers are routed to the vetted application form instead. */}
      <div className="kw-role-choice" role="radiogroup" aria-label={t('register_rolePrompt')}>
        <button
          type="button"
          role="radio"
          aria-checked={roleChoice === 'citizen'}
          className={`kw-role-option ${roleChoice === 'citizen' ? 'selected' : ''}`}
          onClick={() => setRoleChoice('citizen')}
        >
          <span className="kw-role-option-icon" aria-hidden="true">🙋</span>
          <span className="kw-role-option-title">{t('register_roleCitizen')}</span>
          <span className="kw-role-option-desc">{t('register_roleCitizenDesc')}</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={roleChoice === 'reviewer'}
          className={`kw-role-option ${roleChoice === 'reviewer' ? 'selected' : ''}`}
          onClick={() => {
            setRoleChoice('reviewer');
            setTimeout(() => navigate('/reviewer-application'), 350);
          }}
        >
          <span className="kw-role-option-icon" aria-hidden="true">⚖️</span>
          <span className="kw-role-option-title">{t('register_roleReviewer')}</span>
          <span className="kw-role-option-desc">{t('register_roleReviewerDesc')}</span>
        </button>
      </div>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="name">{t('label_fullName')}</label>
          <input id="name" name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="email">{t('label_email')}</label>
          <input id="email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} required />
        </div>
        <PasswordField
          id="password"
          label={t('label_password')}
          value={form.password}
          onChange={handleChange}
          autoComplete="new-password"
          minLength={8}
          pattern={STRONG_PASSWORD_PATTERN}
          title={t('password_helper')}
        />
        <div className="kw-helper">{t('password_helper')}</div>
        <fieldset className="kw-notify-choices">
          <legend>{t('register_notifyLegend')}</legend>
          <label className="kw-notify-choice" htmlFor="emailNotificationsOptIn">
            <input
              id="emailNotificationsOptIn"
              name="emailNotificationsOptIn"
              type="checkbox"
              checked={form.emailNotificationsOptIn}
              onChange={handleChange}
            />
            <span>
              <strong>{t('register_notifyEmail')}</strong>
              <small>
                {t('register_notifyEmailDetail')}
                {' '}{form.email || 'your address'} {t('register_notifyOffAnytime')}
              </small>
            </span>
          </label>
        </fieldset>
        <div className="kw-helper" style={{ marginTop: -6, marginBottom: 14 }}>
          {t('register_smsLater')}
        </div>
        <button type="submit" disabled={loading}>{loading ? t('register_submitting') : t('register_submit')}</button>
        {error && <div className="error">{error}</div>}
      </form>
      <div className="kw-auth-switch">
        {t('register_reviewerPrompt')} <Link to="/reviewer-application">{t('register_applyReviewer')}</Link> {t('register_requiresApproval')}
      </div>
      <div className="kw-auth-switch">
        Agency or institution officer? <Link to="/agency-application">Apply for an Agency Case Officer account</Link> (verified by an Admin)
      </div>
      <div className="kw-auth-switch">
        {t('register_haveAccount')} <Link to="/login">{t('signIn')}</Link>
      </div>
    </div>
  );
}

export default Register;
