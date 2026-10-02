import React, { useEffect, useState } from 'react';
import { apiGet } from '../api';

function Home() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet('/reports')
      .then(setReports)
      .catch(() => setError('Failed to fetch reports - is the backend running?'));
  }, []);

  return (
    <div>
      <div className="kw-reports-summary">
        <h2>All Reports</h2>
        <div className="kw-reports-meta">{reports.length} report{reports.length === 1 ? '' : 's'} submitted</div>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="reports-list">
        {reports.length === 0 && !error && (
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
            <div className="kw-pro-meta"><b>Tracking Reference:</b> <span className="kw-mono">{r.trackingReference}</span></div>
            <div className="kw-pro-meta"><b>Category:</b> {r.reportedCategory}</div>
            <div className="kw-pro-meta"><b>Location:</b> {r.county}, {r.subCounty}</div>
            <div className="kw-pro-meta"><b>Evidence:</b> {r.evidenceCount > 0 ? `${r.evidenceCount} file(s) attached` : <span className="kw-faded">None</span>}</div>
            <div className="kw-pro-meta"><b>Submitted:</b> {new Date(r.createdAt).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Home;
