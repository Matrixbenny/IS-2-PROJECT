import React, { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import EvidenceDownloads from '../components/EvidenceDownloads';
import usePolling from '../hooks/usePolling';

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}

function MyReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  const loadReports = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/reports/mine');
      setReports(res.data);
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.error || loadError.message);
    }
  }, [user]);

  useEffect(() => { loadReports(); }, [loadReports]);
  usePolling(loadReports);

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
              <span className={`kw-status-badge ${statusClass(r.status)}`}>{r.status}</span>
            </div>
            <div className="kw-pro-meta"><span className="kw-tracking-chip">{r.trackingReference}</span></div>
            <div className="kw-pro-meta"><b>Category:</b> {r.reportedCategory}</div>
            <div className="kw-pro-meta"><b>Description:</b> {r.description}</div>
            <EvidenceDownloads reportId={r._id} evidence={r.evidence} />
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
