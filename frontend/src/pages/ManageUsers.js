import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function ManageUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'reviewer' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') load();
    const timer = window.setInterval(() => {
      if (user && user.role === 'admin') load();
    }, 10000);
    return () => window.clearInterval(timer);
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
      const res = await api.post('/users', form);
      setUsers((current) => [res.data, ...current]);
      setForm({ name: '', email: '', password: '', role: 'reviewer' });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id, role) => {
    setError('');
    try {
      const res = await api.patch(`/users/${id}/role`, { role });
      setUsers((current) => current.map((item) => item._id === id ? { ...item, ...res.data } : item));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.patch(`/users/${editing.id}`, { name: editing.name, email: editing.email });
      setUsers((current) => current.map((item) => item._id === editing.id ? { ...item, ...res.data } : item));
      setEditing(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDelete = async (account) => {
    if (!window.confirm(`Delete ${account.name}'s account? Their submitted reports will be kept without this account's identifying links.`)) return;
    setError('');
    try {
      await api.delete(`/users/${account._id}`);
      setUsers((current) => current.filter((item) => item._id !== account._id));
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
        {loading && <div role="status">Saving account...</div>}
        {users.length === 0 && <div className="kw-faded">No accounts found.</div>}
        <table className="kw-users-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Manage</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{editing?.id === u._id ? (
                  <input aria-label={`Name for ${u.email}`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                ) : u.name}</td>
                <td>{editing?.id === u._id ? (
                  <input aria-label={`Email for ${u.name}`} type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                ) : u.email}</td>
                <td>{u.role}</td>
                <td>
                  <select value={u.role} onChange={(e) => handleRoleChange(u._id, e.target.value)}>
                    <option value="user">user</option>
                    <option value="reviewer">reviewer</option>
                    <option value="admin">admin</option>
                  </select>
                  {editing?.id === u._id ? (
                    <>
                      <button type="button" onClick={handleProfileSave}>Save</button>
                      <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setEditing({ id: u._id, name: u.name, email: u.email })}>Edit</button>
                  )}
                  <button type="button" onClick={() => handleDelete(u)}>Delete</button>
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
