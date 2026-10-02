import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function Login() {
  const { login } = useAuth();
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
      navigate('/my-reports');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
    setLoading(false);
  };

  return (
    <div className="kw-auth-page">
      <form className="kw-pro-form" onSubmit={handleSubmit}>
        <h2>Log In</h2>
        <div className="kw-helper">Optional citizen account (Path B) - most reporters never need this. You can always report anonymously instead.</div>
        <div className="kw-form-section">
          <label htmlFor="email">Email<span className="kw-required">*</span></label>
          <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="password">Password<span className="kw-required">*</span></label>
          <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Logging in...' : 'Log In'}</button>
        {error && <div className="error">{error}</div>}
        <div className="kw-helper">No account? <Link to="/register">Register here</Link>.</div>
      </form>
    </div>
  );
}

export default Login;
