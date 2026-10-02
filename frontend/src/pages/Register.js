import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
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
      navigate('/my-reports');
    } catch (err) {
      setError(err.message || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-page">
      <form className="kw-pro-form" onSubmit={handleSubmit}>
        <h2>Create an Account</h2>
        <div className="kw-helper">Optional - lets you privately track your own reports under "My Reports" instead of using a Tracking Reference and Access Key.</div>
        <div className="kw-form-section">
          <label htmlFor="name">Full name<span className="kw-required">*</span></label>
          <input id="name" name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="email">Email<span className="kw-required">*</span></label>
          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="password">Password<span className="kw-required">*</span></label>
          <input id="password" name="password" type="password" minLength={8} value={form.password} onChange={handleChange} required />
          <div className="kw-helper">At least 8 characters.</div>
        </div>
        <div className="kw-form-section">
          <label>
            <input type="checkbox" name="emailNotificationsOptIn" checked={form.emailNotificationsOptIn} onChange={handleChange} />
            {' '}Email me when my report status changes
          </label>
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Register'}</button>
        {error && <div className="error">{error}</div>}
        <div className="kw-helper">Already have an account? <Link to="/login">Log in</Link>.</div>
      </form>
    </div>
  );
}

export default Register;
