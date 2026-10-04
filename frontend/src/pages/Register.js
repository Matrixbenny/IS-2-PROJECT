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
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-card">
      <h2>Create an account</h2>
      <div className="kw-helper" style={{ marginBottom: 16 }}>
        Optional - you can also report fully anonymously without an account from the Submit Report page.
      </div>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="name">Full name</label>
          <input id="name" name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" minLength={8} value={form.password} onChange={handleChange} required />
          <div className="kw-helper">At least 8 characters.</div>
        </div>
        <div className="kw-form-section" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input id="emailNotificationsOptIn" name="emailNotificationsOptIn" type="checkbox" style={{ width: 'auto' }} checked={form.emailNotificationsOptIn} onChange={handleChange} />
          <label htmlFor="emailNotificationsOptIn" style={{ marginBottom: 0 }}>Email me about status changes on my reports</label>
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Register'}</button>
        {error && <div className="error">{error}</div>}
      </form>
      <div className="kw-auth-switch">
        Already have an account? <Link to="/login">Sign in</Link>
      </div>
    </div>
  );
}

export default Register;
