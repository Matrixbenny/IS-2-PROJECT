import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import { ReviewTerms } from '../components/LingoSuggestions';
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
  const portalBaseUrl = (api.defaults?.baseURL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

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
            <MetricCard label="Accounts" value={overview.accounts.total} note={`${overview.accounts.admins} admins · ${overview.accounts.reviewers} reviewers · ${overview.accounts.agencyOfficers} agency officers · ${overview.accounts.users} users`} />
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

          <section className="kw-page-card kw-admin-agency" aria-labelledby="agency-heading">
            <div className="kw-admin-section-heading">
              <div>
                <h3 id="agency-heading">Agency handoffs</h3>
                <p className="kw-helper">Secure case handoffs to individually verified partner accounts. Reporter messages from agencies require Admin approval before publication.</p>
              </div>
              <a href={`${portalBaseUrl}/agency-portal/`} target="_blank" rel="noopener noreferrer">
                Open agency case portal
              </a>
            </div>
            <div className="kw-admin-agency-summary" aria-label="Agency referral summary">
              <div><strong>{overview.agencyReferrals.total}</strong><span>current referrals</span></div>
              <div><strong>{overview.agencyReferrals.updates}</strong><span>agency updates recorded</span></div>
              <div><strong>{overview.agencyReferrals.pendingReporterMessages}</strong><span>reporter messages awaiting review</span></div>
            </div>
            {(overview.agencyReferrals.returnedForRerouting || []).length > 0 && (
              <div className="kw-admin-recent-referrals">
                <h4>Returned by an agency, needing a new route ({overview.agencyReferrals.returnedCount})</h4>
                <p className="kw-helper">An institution found these outside its mandate. Until a reviewer refers them again, nobody is working them.</p>
                <ul className="kw-admin-attention-list">
                  {overview.agencyReferrals.returnedForRerouting.map((item) => (
                    <li className="kw-admin-attention-item" key={item.reportId}>
                      <div className="kw-admin-attention-copy">
                        <span className="kw-tracking-chip">{item.trackingReference}</span>
                        <strong>{item.agency}</strong>
                        <span>{item.reason}</span>
                      </div>
                      <Link to="/reviewer-queue" state={{ focusReportId: item.reportId }} className="kw-admin-case-link">Re-route</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(overview.agencyReferrals.staleReferrals || []).length > 0 && (
              <div className="kw-admin-recent-referrals">
                <h4>Referrals that have stalled ({overview.agencyReferrals.staleCount})</h4>
                <p className="kw-helper">
                  Not acknowledged within {overview.agencyReferrals.staleThresholds.unacknowledgedHours} hours, or no activity for{' '}
                  {overview.agencyReferrals.staleThresholds.idleDays} days. Follow up with the institution's liaison.
                </p>
                <ul className="kw-admin-attention-list">
                  {overview.agencyReferrals.staleReferrals.map((item, index) => (
                    <li className="kw-admin-attention-item" key={`${item.reportId}-${item.agency}-${index}`}>
                      <div className="kw-admin-attention-copy">
                        <span className="kw-tracking-chip">{item.trackingReference}</span>
                        <strong>{item.agency}</strong>
                        <span className="kw-admin-attention-meta">
                          {(item.status || 'sent').replaceAll('_', ' ')} · last activity {new Date(item.lastActivity).toLocaleDateString()}
                        </span>
                      </div>
                      <Link to="/reviewer-queue" state={{ focusReportId: item.reportId }} className="kw-admin-case-link">Open case</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {overview.agencyReferrals.routing?.decisions > 0 && (
              <p className="kw-helper">
                Routing aid: reviewers followed its recommendation in {overview.agencyReferrals.routing.followedSuggestion} of{' '}
                {overview.agencyReferrals.routing.decisions} referrals. This measures agreement, not correctness.
              </p>
            )}
            {(overview.agencyReferrals.informationRequestsAwaitingAnswer || []).length > 0 && (
              <div className="kw-admin-recent-referrals">
                <h4>Agency questions awaiting a Kenya Watch answer ({overview.agencyReferrals.openInformationRequests})</h4>
                <p className="kw-helper">The investigating officer cannot proceed until these are answered. Oldest first.</p>
                <ul className="kw-admin-attention-list">
                  {overview.agencyReferrals.informationRequestsAwaitingAnswer.map((item, index) => (
                    <li className="kw-admin-attention-item" key={`${item.reportId}-${index}`}>
                      <div className="kw-admin-attention-copy">
                        <span className="kw-tracking-chip">{item.trackingReference}</span>
                        <strong>{item.agency}</strong>
                        <span>{item.question}</span>
                        <span className="kw-admin-attention-meta">Asked {new Date(item.requestedAt).toLocaleString()}</span>
                      </div>
                      <Link to="/reviewer-queue" state={{ focusReportId: item.reportId }} className="kw-admin-case-link">Answer</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {overview.agencyReferrals.messagesForReview.length > 0 && (
              <div className="kw-admin-recent-referrals">
                <h4>Reporter messages to review</h4>
                <ul className="kw-admin-attention-list">
                  {overview.agencyReferrals.messagesForReview.map((item) => (
                    <li className="kw-admin-attention-item" key={item.updateId}>
                      <div className="kw-admin-attention-copy">
                        <span className="kw-tracking-chip">{item.trackingReference}</span>
                        <strong>{item.agency}</strong>
                        <span>{item.message}</span>
                      </div>
                      <Link to="/reviewer-queue" state={{ focusReportId: item.reportId }} className="kw-admin-case-link">Review message</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {overview.agencyReferrals.byAgency.length > 0 ? (
              <ul className="kw-admin-agency-list" aria-label="Referrals grouped by agency">
                {overview.agencyReferrals.byAgency.map((item) => (
                  <li key={item._id}>
                    <span>{item._id}</span>
                    <span>{item.reports} {item.reports === 1 ? 'case' : 'cases'} · {item.updates} {item.updates === 1 ? 'update' : 'updates'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="kw-admin-no-attention">No active reports have been referred to an agency yet.</p>
            )}
            {overview.agencyReferrals.recent.length > 0 && (
              <div className="kw-admin-recent-referrals">
                <h4>Recent referrals</h4>
                <ul className="kw-admin-attention-list">
                  {overview.agencyReferrals.recent.map((referral) => (
                    <li className="kw-admin-attention-item" key={referral._id}>
                      <div className="kw-admin-attention-copy">
                        <span className="kw-tracking-chip">{referral.trackingReference}</span>
                        <strong>{referral.title}</strong>
                        <span className="kw-admin-attention-meta">
                          {referral.agency} · {(referral.referralStatus || 'sent').replaceAll('_', ' ')} · {referral.referenceNumber || 'No agency reference entered'} ·{' '}
                          {new Date(referral.referredAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="kw-admin-attention-actions">
                        <span>{referral.agencyUpdateCount} {referral.agencyUpdateCount === 1 ? 'update' : 'updates'}</span>
                        <Link
                          to="/reviewer-queue"
                          state={{ focusReportId: referral._id }}
                          className="kw-admin-case-link"
                        >
                          Open case
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
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
          <ReviewTerms />
        </>
      ) : (
        !error && <div className="kw-empty-state">Admin overview is not available.</div>
      )}
    </section>
  );
}

export default AdminDashboard;
