import React, { useCallback, useEffect, useState } from 'react';
import api from '../api';
import usePolling from '../hooks/usePolling';

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

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/stats/public');
      setStats(res.data);
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.error || 'Could not load statistics. Is the backend running?');
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  usePolling(loadStats);

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
        <div className="kw-stat-card">
          <div className="kw-stat-big">{stats.medianReviewLagHours !== null ? `${stats.medianReviewLagHours}h` : '—'}</div>
          <div className="kw-stat-caption">Median time to first review</div>
        </div>
      </div>

      {stats.justiceLoop && (
        <div className="kw-page-card" aria-labelledby="justice-loop-heading">
          <h4 id="justice-loop-heading" style={{ marginTop: 0 }}>Is the law doing its job?</h4>
          <div className="kw-helper" style={{ marginBottom: 10 }}>
            What happens after a report reaches an institution. Kenya Watch refers cases; the institutions investigate and decide.
            These aggregate figures make their response public. An agency appears here once it has handled at least{' '}
            {stats.justiceLoop.minReferralsForAgencyFigures} referrals, so no single case can be identified.
          </div>
          <p>
            <strong>{stats.justiceLoop.referred}</strong> referrals sent to institutions ·{' '}
            <strong>{stats.justiceLoop.acknowledged}</strong> acknowledged ·{' '}
            <strong>{stats.justiceLoop.closed}</strong> closed with a recorded outcome.
          </p>
          {stats.justiceLoop.agencies.length === 0 ? (
            <div className="kw-faded">Per-institution figures appear once an institution has handled enough referrals.</div>
          ) : (
            <table className="kw-urgency-heatmap">
              <caption className="kw-sr-only">Response of each institution to referred cases</caption>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Institution</th>
                  <th>Referred</th><th>Acknowledged</th><th>Median hours to respond</th><th>Closed</th><th>Charges filed</th><th>Returned</th>
                </tr>
              </thead>
              <tbody>
                {stats.justiceLoop.agencies.map((row) => (
                  <tr key={row.agency}>
                    <td>{row.agency}</td>
                    <td>{row.referred}</td>
                    <td>{row.acknowledgedRate}%</td>
                    <td>{row.medianHoursToAcknowledge ?? '—'}</td>
                    <td>{row.closed}</td>
                    <td>{row.outcomes.investigated_charged || 0}</td>
                    <td>{row.returned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="kw-page-card">
        <h4 style={{ marginTop: 0 }}>Reported category × triage urgency</h4>
        <div className="kw-helper" style={{ marginBottom: 10 }}>
          Urgency is the internal ML-assisted triage level - shown only as aggregate volume, never per case.
        </div>
        {stats.categoryUrgency.length === 0 && <div className="kw-faded">No data yet.</div>}
        {stats.categoryUrgency.length > 0 && (
          <div>
            {/* Text summary first for screen-reader users - the heatmap below is visual. */}
            <p className="kw-sr-only">
              Urgency breakdown per category: {stats.categoryUrgency.map((row) => `${row.name}: ${row.Low} low, ${row.Medium} medium, ${row.High} high, ${row.Critical} critical`).join('; ')}.
            </p>
            <table className="kw-urgency-heatmap">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Category</th>
                  <th>Low</th><th>Medium</th><th>High</th><th>Critical</th>
                </tr>
              </thead>
              <tbody>
                {stats.categoryUrgency.map((row) => {
                  const rowMax = Math.max(1, ...['Low', 'Medium', 'High', 'Critical'].map((k) => row[k]));
                  return (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      {['Low', 'Medium', 'High', 'Critical'].map((k) => {
                        const level = row[k] === 0 ? 0 : Math.ceil((row[k] / rowMax) * 4);
                        return (
                          <td key={k} className={`kw-heat-cell kw-heat-${level}`}>
                            <span className="kw-sr-only">{k}: </span>{row[k]}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="kw-page-card">
        <h4 style={{ marginTop: 0 }}>By Category</h4>
        {stats.byCategory.length === 0 && <div className="kw-faded">No data yet.</div>}
        {stats.byCategory.map((c) => <BreakdownBar key={c.name} name={c.name} count={c.count} max={maxCategory} />)}
      </div>

      <div className="kw-page-card">
        <h4 style={{ marginTop: 0 }}>By County</h4>
        <div className="kw-helper" style={{ marginBottom: 10 }}>
          Resolution rates appear once a county has at least 2 reports, so single cases can't be identified through this page.
        </div>
        {stats.byCounty.length === 0 && <div className="kw-faded">No data yet.</div>}
        {stats.byCounty.map((c) => (
          <div key={c.name}>
            <BreakdownBar name={c.name} count={c.count} max={maxCounty} />
            {c.resolutionRate !== null && (
              <div className="kw-faded" style={{ fontSize: '0.8rem', margin: '-6px 0 10px' }}>local resolution rate: {c.resolutionRate}%</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Stats;
