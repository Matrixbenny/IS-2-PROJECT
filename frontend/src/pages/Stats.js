import React, { useEffect, useState } from 'react';
import api from '../api';

function BreakdownBar({ name, count, max }) {
  const pct = max === 0 ? 0 : Math.round((count / max) * 100);
  return (
    <div className="kw-stat-row">
      <div className="kw-stat-label">{name}</div>
      <div className="kw-stat-bar-track">
        <div className="kw-stat-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="kw-stat-count">{count}</div>
    </div>
  );
}

function Stats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stats/public')
      .then((res) => setStats(res.data))
      .catch(() => setError('Could not load statistics. Is the backend running?'));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!stats) return <div className="kw-empty-state">Loading statistics...</div>;

  const maxCategory = Math.max(1, ...stats.byCategory.map((c) => c.count));
  const maxCounty = Math.max(1, ...stats.byCounty.map((c) => c.count));

  return (
    <div>
      <h2>Public Statistics</h2>
      <div className="kw-helper" style={{ marginBottom: 18 }}>
        Aggregate figures only - never per-case data, so no individual report or reporter can be identified here.
      </div>

      <div className="kw-stat-summary-row">
        <div className="kw-stat-card">
          <div className="kw-stat-big">{stats.totalReports}</div>
          <div className="kw-stat-caption">Total reports</div>
        </div>
        <div className="kw-stat-card">
          <div className="kw-stat-big">{stats.resolvedReports}</div>
          <div className="kw-stat-caption">Resolved</div>
        </div>
        <div className="kw-stat-card">
          <div className="kw-stat-big">{stats.resolutionRate}%</div>
          <div className="kw-stat-caption">Resolution rate</div>
        </div>
      </div>

      <div className="kw-page-card">
        <h4 style={{ marginTop: 0 }}>By Category</h4>
        {stats.byCategory.length === 0 && <div className="kw-faded">No data yet.</div>}
        {stats.byCategory.map((c) => <BreakdownBar key={c.name} name={c.name} count={c.count} max={maxCategory} />)}
      </div>

      <div className="kw-page-card">
        <h4 style={{ marginTop: 0 }}>By County</h4>
        {stats.byCounty.length === 0 && <div className="kw-faded">No data yet.</div>}
        {stats.byCounty.map((c) => <BreakdownBar key={c.name} name={c.name} count={c.count} max={maxCounty} />)}
      </div>
    </div>
  );
}

export default Stats;
