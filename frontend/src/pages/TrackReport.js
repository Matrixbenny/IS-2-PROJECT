import React, { useState } from 'react';
import { apiGet } from '../api';

function TrackReport() {
  const [refInput, setRefInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setReport(null);
    setLoading(true);
    try {
      const data = await apiGet(`/reports/track?ref=${encodeURIComponent(refInput.trim())}&key=${encodeURIComponent(keyInput.trim())}`);
      setReport(data);
    } catch (err) {
      setError(err.message || 'Could not find a matching report');
    }
    setLoading(false);
  };

  return (
    <div>
      <h2>Track Your Report</h2>
      <div className="kw-helper">Enter the Tracking Reference and Access Key you were given when you submitted your report.</div>
      <form className="kw-pro-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="ref">Tracking Reference<span className="kw-required">*</span></label>
          <input id="ref" value={refInput} onChange={(e) => setRefInput(e.target.value)} placeholder="KW-XXXXXX" required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="key">Access Key<span className="kw-required">*</span></label>
          <input id="key" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="e.g. purple-tiger-lemon-forest" required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Looking up...' : 'Check Status'}</button>
        {error && <div className="error">{error}</div>}
      </form>

      {report && (
        <div className="report-card kw-pro-card">
          <div className="kw-pro-card-row">
            <h3>{report.title}</h3>
            <span className="kw-status-badge">{report.status}</span>
          </div>
          <div className="kw-pro-meta"><b>Category:</b> {report.reportedCategory}</div>
          <div className="kw-pro-meta"><b>Location:</b> {report.county}, {report.subCounty}</div>
          <div className="kw-pro-meta"><b>Description:</b> {report.description}</div>
          <div className="kw-pro-meta"><b>Evidence:</b> {report.evidence.length > 0 ? `${report.evidence.length} file(s) attached` : <span className="kw-faded">None</span>}</div>
          {report.resolutionNote && (
            <div className="kw-pro-meta"><b>Resolution:</b> {report.resolutionNote} (Ref: {report.resolutionReference})</div>
          )}
          <div className="kw-pro-meta"><b>Status History:</b></div>
          <ul>
            {report.statusHistory.map((h) => (
              <li key={h._id}>{h.status} - {new Date(h.changedAt).toLocaleString()}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default TrackReport;
