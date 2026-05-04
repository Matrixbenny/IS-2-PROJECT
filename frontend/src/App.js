
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    evidenceUrls: '',
    ageGroup: '',
    gender: '',
    occupation: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await axios.get('http://localhost:5000/reports');
      setReports(res.data);
    } catch (err) {
      setError('Failed to fetch reports');
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        title: form.title,
        description: form.description,
        location: form.location,
        evidenceUrls: form.evidenceUrls.split(',').map(url => url.trim()).filter(Boolean),
        demographic: {
          ageGroup: form.ageGroup,
          gender: form.gender,
          occupation: form.occupation
        }
      };
      await axios.post('http://localhost:5000/reports', payload);
      setSuccess('Report submitted successfully!');
      setForm({ title: '', description: '', location: '', evidenceUrls: '', ageGroup: '', gender: '', occupation: '' });
      fetchReports();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit report');
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <header className="kw-header">
        <div className="kw-logo-circle">
          <span role="img" aria-label="shield" className="kw-logo-emoji">🛡️</span>
        </div>
        <div className="kw-branding">
          <h1>Kenya Watch</h1>
          <div className="kw-tagline">A Trusted Platform to Report and Track Corruption</div>
        </div>
      </header>
      <form className="report-form" onSubmit={handleSubmit}>
        <input name="title" value={form.title} onChange={handleChange} placeholder="Title" required />
        <textarea name="description" value={form.description} onChange={handleChange} placeholder="Description" required />
        <input name="location" value={form.location} onChange={handleChange} placeholder="Location" />
        <input name="evidenceUrls" value={form.evidenceUrls} onChange={handleChange} placeholder="Evidence URLs (comma separated)" />
        <input name="ageGroup" value={form.ageGroup} onChange={handleChange} placeholder="Age Group" />
        <input name="gender" value={form.gender} onChange={handleChange} placeholder="Gender" />
        <input name="occupation" value={form.occupation} onChange={handleChange} placeholder="Occupation" />
        <button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit Report'}</button>
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}
      </form>
      <h2>All Reports</h2>
      <div className="reports-list">
        {reports.length === 0 && <div>No reports found.</div>}
        {reports.map((r) => (
          <div className="report-card" key={r._id}>
            <h3>{r.title}</h3>
            <p>{r.description}</p>
            <div><b>Location:</b> {r.location}</div>
            <div><b>Evidence:</b> {r.evidenceUrls && r.evidenceUrls.join(', ')}</div>
            <div><b>Demographic:</b> {r.demographic && `${r.demographic.ageGroup || ''} ${r.demographic.gender || ''} ${r.demographic.occupation || ''}`}</div>
            <div><b>Status:</b> {r.status}</div>
            <div><b>Date:</b> {new Date(r.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
