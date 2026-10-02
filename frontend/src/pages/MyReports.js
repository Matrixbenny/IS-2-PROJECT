import React, { useEffect, useState } from 'react';
import { apiGet } from '../api';
import { useAuth } from '../context/AuthContext';

function MyReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    apiGet('/reports/mine').then(setReports).catch((err) => setError(err.message));
  }, [user]);

  if (!user) {
    return <div className="kw-helper">Log in to see reports you've submitted while signed in.</div>;
  }

  return (
    <div>
      <h2>My Reports</h2>
      {error && <div className="error">{error}</div>}
      {reports.length === 0 && !error && <div className="kw-helper">You haven't submitted any reports while logged in yet.</div>}
      <div className="reports-list">
        {reports.map((r) => (
          <div className="report-card kw-pro-card" key={r._id}>
            <div className="kw-pro-card-row">
              <h3>{r.title}</h3>
              <span className="kw-status-badge">{r.status}</span>
            </div>
            <div className="kw-pro-meta"><b>Tracking Reference:</b> <span className="kw-mono">{r.trackingReference}</span></div>
            <div className="kw-pro-meta"><b>Category:</b> {r.reportedCategory}</div>
            <div className="kw-pro-meta"><b>Description:</b> {r.description}</div>
            {r.resolutionNote && (
              <div className="kw-pro-meta"><b>Resolution:</b> {r.resolutionNote} (Ref: {r.resolutionReference})</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MyReports;
