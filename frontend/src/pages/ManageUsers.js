import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function ManageUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'reviewer' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = () => api.get('/users').then((res) => setUsers(res.data)).catch((err) => setError(err.response?.data?.error || err.message));

  useEffect(() => {
    if (user && user.role === 'admin') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || user.role !== 'admin') {
    return <div className="kw-helper">This page is only available to Admins.</div>;
  }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/users', form);
      setForm({ name: '', email: '', password: '', role: 'reviewer' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const handleRoleChange = async (id, role) => {
    try {
      await api.patch(`/users/${id}/role`, { role });
      load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div>
      <h2>Manage Users</h2>
      <div className="kw-helper" style={{ marginBottom: 14 }}>Provision Reviewer and Admin accounts here - there is no public sign-up path to these roles.</div>

      <form className="kw-pro-form report-form" onSubmit={handleCreate}>
        <h4 style={{ marginTop: 0 }}>Create Reviewer/Admin Account</h4>
        <div className="kw-form-section">
          <label>Full name</label>
          <input name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label>Email</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label>Password</label>
          <input name="password" type="password" minLength={8} value={form.password} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label>Role</label>
          <select name="role" value={form.role} onChange={handleChange}>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
        {error && <div className="error">{error}</div>}
      </form>

      <div className="kw-page-card">
        <h4 style={{ marginTop: 0 }}>All Accounts</h4>
        <table className="kw-users-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Change Role</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>
                  <select value={u.role} onChange={(e) => handleRoleChange(u._id, e.target.value)}>
                    <option value="user">user</option>
                    <option value="reviewer">reviewer</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ManageUsers;
