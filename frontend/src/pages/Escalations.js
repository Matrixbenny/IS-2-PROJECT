import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function urgencyClass(urgency) {
  return `kw-urgency-badge kw-urgency-${(urgency || 'low').toLowerCase()}`;
}

function Escalations() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/reports/escalations').then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.error || err.message));

  useEffect(() => {
    if (user && user.role === 'admin') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || user.role !== 'admin') {
    return <div className="kw-helper">This page is only available to Admins.</div>;
  }

  return (
    <div>
      <h2>Escalations</h2>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        High/Critical urgency cases left unclaimed for over {data?.thresholdMinutes ?? '...'} minutes since classification completed (decision #24).
      </div>
      {error && <div className="error">{error}</div>}
      {data && data.cases.length === 0 && <div className="kw-empty-state">No escalations right now - all urgent cases are being handled in time.</div>}
      <div className="reports-list">
        {data && data.cases.map((r) => (
          <div className="report-card kw-pro-card" key={r._id}>
            <div className="kw-pro-card-row">
              <h3>{r.title}</h3>
              <span className={urgencyClass(r.classification?.urgency)}>{r.classification?.urgency}</span>
            </div>
            <div className="kw-pro-meta"><span className="kw-tracking-chip">{r.trackingReference}</span></div>
            <div className="kw-pro-meta"><b>Category:</b> {r.reportedCategory}</div>
            <div className="kw-pro-meta"><b>Location:</b> {r.subCounty}, {r.county}</div>
            <div className="kw-pro-meta"><b>Unclaimed for:</b> {r.minutesSinceClassified} minutes since classification</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Escalations;
