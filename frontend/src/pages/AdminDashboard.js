import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import usePolling from '../hooks/usePolling';

const quickLinks = [
  { title: 'Review cases', detail: 'Open the shared queue and follow up on reports.', to: '/reviewer-queue', action: 'Open reviewer queue' },
  { title: 'Escalations', detail: 'Check high-priority cases awaiting a reviewer.', to: '/escalations', action: 'View escalations' },
  { title: 'Manage users', detail: 'Create accounts, update roles, or edit account details.', to: '/manage-users', action: 'Manage accounts' },
  { title: 'Archived reports', detail: 'Restore archived cases or permanently remove eligible ones.', to: '/archived-reports', action: 'Review archive' }
];

function MetricCard({ label, value, note, emphasis = false }) {
  return (
    <div className={`kw-admin-metric${emphasis ? ' kw-admin-metric-emphasis' : ''}`}>
      <div className="kw-admin-metric-label">{label}</div>
      <div className="kw-admin-metric-value">{value}</div>
      {note && <div className="kw-admin-metric-note">{note}</div>}
    </div>
  );
}

function AdminDashboard() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const loadOverview = useCallback(async () => {
    if (user?.role !== 'admin') return;
    try {
      const response = await api.get('/reports/admin-overview');
      setOverview(response.data);
      setUpdatedAt(new Date());
      setError('');
    } catch (loadError) {
      setError(loadError.response?.data?.error || 'Could not load the admin overview.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'admin') loadOverview();
  }, [loadOverview, user]);
  usePolling(loadOverview);

  if (!user) {
    return (
      <section className="kw-page-card kw-admin-access" aria-labelledby="admin-access-heading">
        <h2 id="admin-access-heading">Admin sign-in required</h2>
        <p className="kw-helper">Sign in with an Admin account to view system activity and manage the platform.</p>
        <Link className="kw-btn kw-admin-signin-link" to="/login">Sign in</Link>
      </section>
    );
  }

  if (user.role !== 'admin') {
    return (
      <section className="kw-page-card kw-admin-access" aria-labelledby="admin-access-heading">
        <h2 id="admin-access-heading">Admin access only</h2>
        <p className="kw-helper">Your account does not have permission to view this page.</p>
        <Link to="/">Return to the public home page</Link>
      </section>
    );
  }

  const pendingReview = overview
    ? overview.reports.byStatus.Received + overview.reports.byStatus['In Review']
    : 0;

  return (
    <section className="kw-admin-dashboard" aria-labelledby="admin-dashboard-title">
      <div className="kw-admin-heading">
        <div>
          <div className="kw-admin-eyebrow">KENYA WATCH · ADMINISTRATION</div>
          <h2 id="admin-dashboard-title">Admin overview</h2>
          <p className="kw-helper">A live snapshot of reports, workload and system accounts.</p>
        </div>
        {updatedAt && <p className="kw-admin-updated">Updated {updatedAt.toLocaleTimeString()}</p>}
      </div>

      {error && <div className="error" role="alert">{error}</div>}

      {loading && !overview ? (
        <div className="kw-empty-state" role="status">Loading admin overview…</div>
      ) : overview ? (
        <>
          <section className="kw-admin-metrics" aria-label="System summary">
            <MetricCard label="Active reports" value={overview.reports.active} note={`${overview.reports.total} total, including archived`} />
            <MetricCard label="Awaiting review" value={pendingReview} note="Received or in review" />
            <MetricCard label="Escalations" value={overview.escalations.count} note={`Unclaimed over ${overview.escalations.thresholdMinutes} minutes`} emphasis={overview.escalations.count > 0} />
            <MetricCard label="Accounts" value={overview.accounts.total} note={`${overview.accounts.admins} admins · ${overview.accounts.reviewers} reviewers · ${overview.accounts.users} users`} />
          </section>

          <section className="kw-page-card kw-admin-status" aria-labelledby="report-status-heading">
            <div className="kw-admin-section-heading">
              <div>
                <h3 id="report-status-heading">Report status</h3>
                <p className="kw-helper">Current active cases, grouped by their workflow status.</p>
              </div>
              <Link to="/reviewer-queue">Open case queue</Link>
            </div>
            <dl className="kw-admin-status-list">
              {Object.entries(overview.reports.byStatus).map(([status, count]) => (
                <div className="kw-admin-status-item" key={status}>
                  <dt>{status}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
              <div className="kw-admin-status-item">
                <dt>Archived</dt>
                <dd>{overview.reports.archived}</dd>
              </div>
            </dl>
          </section>

          <section className="kw-page-card kw-admin-attention" aria-labelledby="attention-heading">
            <div className="kw-admin-section-heading">
              <div>
                <h3 id="attention-heading">Unclaimed cases to review</h3>
                <p className="kw-helper">Open cases are ranked by urgency, then by age. Classification is a triage aid, not a decision.</p>
              </div>
              <Link to="/reviewer-queue">View full queue</Link>
            </div>
            {overview.attention.length === 0 ? (
              <p className="kw-admin-no-attention">No unclaimed active cases need review.</p>
            ) : (
              <ul className="kw-admin-attention-list">
                {overview.attention.map((report) => (
                  <li className="kw-admin-attention-item" key={report._id}>
                    <div className="kw-admin-attention-copy">
                      <span className="kw-tracking-chip">{report.trackingReference}</span>
                      <strong>{report.title}</strong>
                      <span className="kw-admin-attention-meta">
                        {report.subCounty}, {report.county} · {report.status} · {new Date(report.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="kw-admin-attention-actions">
                      <span className={`kw-urgency-badge kw-urgency-${(report.classification?.urgency || 'low').toLowerCase()}`}>
                        {report.classification?.urgency || 'Unclassified'}
                      </span>
                      <Link
                        to="/reviewer-queue"
                        state={{ focusReportId: report._id }}
                        className="kw-admin-case-link"
                      >
                        Open case
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="admin-actions-heading">
            <div className="kw-admin-section-heading">
              <div>
                <h3 id="admin-actions-heading">Admin actions</h3>
                <p className="kw-helper">Go directly to the tools you use to keep cases moving.</p>
              </div>
            </div>
            <div className="kw-admin-actions">
              {quickLinks.map((item) => (
                <Link to={item.to} className="kw-admin-action" key={item.to}>
                  <span className="kw-admin-action-title">{item.title}</span>
                  <span className="kw-admin-action-detail">{item.detail}</span>
                  <span className="kw-admin-action-link">{item.action} <span aria-hidden="true">→</span></span>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : (
        !error && <div className="kw-empty-state">Admin overview is not available.</div>
      )}
    </section>
  );
}

export default AdminDashboard;
