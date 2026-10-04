import React, { useState } from 'react';
import api from '../api';

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}

function TrackReport() {
  const [ref, setRef] = useState('');
  const [key, setKey] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setReport(null);
    setLoading(true);
    try {
      const res = await api.get('/reports/track', { params: { ref: ref.trim(), key: key.trim() } });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Lookup failed');
    }
    setLoading(false);
  };

  return (
    <div>
      <h2>Track Your Report</h2>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        Enter the Tracking Reference and Access Key you received when you submitted your report.
      </div>
      <form className="report-form kw-pro-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="ref">Tracking Reference</label>
          <input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="KW-XXXXXX" required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="key">Access Key</label>
          <input id="key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="purple-tiger-lemon-forest" required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Looking up...' : 'Check Status'}</button>
        {error && <div className="error">{error}</div>}
      </form>

      {report && (
        <div className="kw-page-card">
          <div className="kw-pro-card-row">
            <h3 style={{ margin: 0 }}>{report.title}</h3>
            <span className={`kw-status-badge ${statusClass(report.status)}`}>{report.status}</span>
          </div>
          <div className="kw-pro-meta"><span className="kw-tracking-chip">{report.trackingReference}</span></div>
          <div className="kw-pro-meta"><b>Category:</b> {report.reportedCategory}</div>
          <div className="kw-pro-meta"><b>Location:</b> {report.subCounty}, {report.county}</div>
          <div className="kw-pro-meta"><b>Description:</b> {report.description}</div>
          <div className="kw-pro-meta"><b>Submitted:</b> {new Date(report.createdAt).toLocaleString()}</div>
          {report.resolutionNote && (
            <div className="kw-pro-meta"><b>Resolution:</b> {report.resolutionNote} (Ref: {report.resolutionReference})</div>
          )}
          <div className="kw-pro-meta"><b>Status history:</b></div>
          <ul>
            {report.statusHistory.map((h, i) => (
              <li key={i} className="kw-pro-meta">{h.status} - {new Date(h.changedAt).toLocaleString()}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TrackReport;
