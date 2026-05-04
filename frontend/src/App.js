

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import SubmitReport from './pages/SubmitReport';
import About from './pages/About';

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
    <Router>
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
        <nav className="kw-nav">
          <Link to="/" className="kw-nav-link">Home</Link>
          <Link to="/submit" className="kw-nav-link">Submit Report</Link>
          <Link to="/about" className="kw-nav-link">About</Link>
        </nav>
        <Routes>
          <Route path="/" element={
            <>
              <Home />
              <div className="kw-reports-summary">
                <h2>All Reports</h2>
                <div className="kw-reports-meta">{reports.length} report{reports.length === 1 ? '' : 's'} submitted</div>
              </div>
              <div className="reports-list">
                {reports.length === 0 && (
                  <div className="kw-empty-state">
                    <span role="img" aria-label="no reports" className="kw-empty-emoji">📭</span>
                    <div>No reports found. Be the first to submit a report!</div>
                  </div>
                )}
                {reports.map((r) => (
                  <div className="report-card kw-pro-card" key={r._id}>
                    <div className="kw-pro-card-row">
                      <h3>{r.title}</h3>
                      <span className="kw-status-badge">{r.status}</span>
                    </div>
                    <p>{r.description}</p>
                    <div className="kw-pro-meta"><b>Location:</b> {r.location || <span className="kw-faded">(not specified)</span>}</div>
                    <div className="kw-pro-meta"><b>Evidence:</b> {r.evidenceUrls && r.evidenceUrls.length > 0 ? r.evidenceUrls.join(', ') : <span className="kw-faded">None</span>}</div>
                    <div className="kw-pro-meta"><b>Demographic:</b> {r.demographic && (r.demographic.ageGroup || r.demographic.gender || r.demographic.occupation) ? `${r.demographic.ageGroup || ''} ${r.demographic.gender || ''} ${r.demographic.occupation || ''}` : <span className="kw-faded">(not specified)</span>}</div>
                    <div className="kw-pro-meta"><b>Date:</b> {new Date(r.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </>
          } />
          <Route path="/submit" element={
            <>
              <SubmitReport />
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
            </>
          } />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
