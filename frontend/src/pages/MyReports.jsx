import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import EvidenceDownloads from "../components/EvidenceDownloads";
import NotificationSettings from "../components/NotificationSettings";
import AnonymousAvatar from "../components/AnonymousAvatar";
import CaseJourney, { JOURNEY_STEPS, journeyStage } from "../components/CaseJourney";
import ChangePassword from "../components/ChangePassword";
import {
  CHART_COLORS,
  CaseHub,
  ChartTable,
  DonutChart,
  LineChart,
  StageBars
} from "../components/DashboardCharts";
import usePolling from "../hooks/usePolling";

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
}

const OUTCOME_LABELS = {
  investigated_charged: "Investigated and charges filed",
  investigated_no_action: "Investigated, no charges filed",
  referred_elsewhere: "Referred to another authority",
  administrative_action: "Administrative action taken",
  not_pursued: "Not pursued by this institution"
};

const STAGE_COLORS = [CHART_COLORS.slate, CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.amber, CHART_COLORS.teal];

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Cumulative reports submitted at the end of each of the last six months.
function monthlyTrend(reports) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: "short" }), end: new Date(d.getFullYear(), d.getMonth() + 1, 1) });
  }
  return months.map((month) => ({
    label: month.label,
    value: reports.filter((report) => report.createdAt && new Date(report.createdAt) < month.end).length
  }));
}

function CommentForm({ reportId, onAdded }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post(`/reports/${reportId}/comments`, { text });
      setText("");
      setAdded(true);
      onAdded(res.data.comments);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="kw-form-section" onSubmit={submit} style={{ marginTop: 10 }}>
      <label htmlFor={`comment-${reportId}`}>Add follow-up information for reviewers</label>
      <textarea
        id={`comment-${reportId}`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setAdded(false);
        }}
        placeholder="e.g. I remembered the number plate of the vehicle involved..."
        maxLength={2000}
      />
      <div className="kw-receipt-actions">
        <button type="submit" className="kw-btn kw-btn-secondary" disabled={busy || text.trim().length < 2}>
          {busy ? "Sending..." : "Add information"}
        </button>
      </div>
      {added && <div className="kw-helper" role="status">Added - reviewers will see this alongside your report.</div>}
      {error && <div className="error" role="alert">{error}</div>}
    </form>
  );
}

function MyReports() {
  const { user, deleteAccount, logout } = useAuth();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showDeleteForm, setShowDeleteForm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadReports = useCallback(async () => {
    if (!user || user.role !== "user") {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get("/reports/mine");
      setReports(res.data);
      setError("");
    } catch (loadError) {
      setError(loadError.response?.data?.error || loadError.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);
  usePolling(loadReports);

  const stages = useMemo(() => reports.map((report) => journeyStage(report)), [reports]);

  if (!user) {
    return (
      <div className="kw-page-card kw-dashboard-access">
        <div className="kw-dashboard-icon" aria-hidden="true">🔐</div>
        <h2>Sign in to your dashboard</h2>
        <p>Log in to see and follow up on reports you submitted with your account.</p>
        <Link className="kw-btn kw-dashboard-link" to="/login">Sign in</Link>
      </div>
    );
  }
  if (user.role !== "user") {
    return (
      <div className="kw-page-card kw-dashboard-access">
        <div className="kw-dashboard-icon" aria-hidden="true">🧭</div>
        <h2>Use your role workspace</h2>
        <p>My Reports is available to citizen accounts only. Use your role-specific workspace instead.</p>
        <ChangePassword />
      </div>
    );
  }

  const activeCount = reports.filter((report) => ["Received", "In Review"].includes(report.status)).length;
  const resolvedCount = reports.filter((report) => report.status === "Resolved").length;
  const rejectedCount = reports.filter((report) => report.status === "Rejected").length;
  const withAgency = stages.filter((stage) => stage >= 3).length;
  const investigating = stages.filter((stage) => stage === 4).length;
  const withOutcome = stages.filter((stage) => stage === 5).length;
  const outcomeRate = reports.length === 0 ? 0 : Math.round((withOutcome / reports.length) * 100);
  const greetingName = user.name?.trim().split(/\s+/)[0] || "there";
  const trend = monthlyTrend(reports);
  const recent = reports.slice(0, 12).reverse();

  const statusSegments = [
    { label: "Received", value: reports.filter((r) => r.status === "Received").length, color: CHART_COLORS.slate },
    { label: "In review", value: reports.filter((r) => r.status === "In Review").length, color: CHART_COLORS.blue },
    { label: "Resolved", value: resolvedCount, color: CHART_COLORS.teal },
    { label: "Closed without action", value: rejectedCount, color: CHART_COLORS.rose }
  ];

  const submitAccountDeletion = async (event) => {
    event.preventDefault();
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteAccount({ password: deletePassword, confirmation: deleteConfirmation });
    } catch (deleteRequestError) {
      setDeleteError(deleteRequestError.response?.data?.error || "Could not delete the account. Please try again.");
      setDeleting(false);
    }
  };

  return (
    <div className="kw-dash">
      <aside className="kw-dash-sidebar" aria-label="Your profile and shortcuts">
        <div className="kw-dash-profile">
          <AnonymousAvatar seed={user.id || user.email || user.name} size={96} />
          <strong className="kw-dash-name">{user.name}</strong>
          {user.email && <span className="kw-dash-email">{user.email}</span>}
          <span className="kw-dash-anon-note">Your profile picture is always a masked figure. Kenya Watch never shows or stores a photo of you.</span>
        </div>
        <nav className="kw-dash-nav" aria-label="Dashboard sections">
          <a href="#dash-overview" className="kw-dash-nav-link">▦ Dashboard</a>
          <a href="#citizen-reports-heading" className="kw-dash-nav-link">▤ My reports</a>
          <Link to="/submit" className="kw-dash-nav-link">＋ New report</Link>
          <Link to="/track" className="kw-dash-nav-link">⌕ Track a report</Link>
          <a href="#notifications" className="kw-dash-nav-link">🔔 Notifications</a>
          <a href="#change-password-heading" className="kw-dash-nav-link">🔑 Password &amp; security</a>
          <a href="#delete-account-heading" className="kw-dash-nav-link">⚠ Delete account</a>
        </nav>
        <button type="button" className="kw-dash-logout" onClick={logout}>Sign out</button>
      </aside>

      <div className="kw-dash-main kw-citizen-dashboard">
        <header className="kw-dash-top" id="dash-overview">
          <div>
            <div className="kw-dashboard-eyebrow">YOUR PRIVATE SPACE</div>
            <h2>Welcome back, {greetingName}</h2>
            <p>Follow every report from the moment it is received to the moment an institution records its decision.</p>
          </div>
          <div className="kw-dash-top-actions">
            <Link className="kw-dashboard-new-report" to="/submit"><span aria-hidden="true">＋</span> Submit a report</Link>
            <Link className="kw-dash-pill" to="/about">How cases are handled</Link>
          </div>
        </header>

        <section className="kw-dashboard-stats" aria-label="Your report summary">
          <article className="kw-dashboard-stat">
            <span className="kw-dashboard-stat-icon kw-dashboard-stat-teal" aria-hidden="true">▤</span>
            <div><span className="kw-dashboard-stat-value">{reports.length}</span><span className="kw-dashboard-stat-label">Total reports</span></div>
          </article>
          <article className="kw-dashboard-stat">
            <span className="kw-dashboard-stat-icon kw-dashboard-stat-blue" aria-hidden="true">◷</span>
            <div><span className="kw-dashboard-stat-value">{activeCount}</span><span className="kw-dashboard-stat-label">In progress</span></div>
          </article>
          <article className="kw-dashboard-stat">
            <span className="kw-dashboard-stat-icon kw-dashboard-stat-green" aria-hidden="true">✓</span>
            <div><span className="kw-dashboard-stat-value">{resolvedCount}</span><span className="kw-dashboard-stat-label">Resolved</span></div>
          </article>
        </section>

        {reports.length > 0 && (
          <section className="kw-dash-grid" aria-label="Your cases at a glance">
            <article className="kw-dash-card">
              <h3>Where your cases are</h3>
              <CaseHub
                seed={user.id || user.email || user.name}
                ariaLabel={`${reports.length} reports: ${activeCount} in progress, ${withAgency} sent to the authorities, ${investigating} being investigated, ${withOutcome} with a recorded outcome`}
                satellites={[
                  { label: "Reports", value: reports.length, color: CHART_COLORS.slate },
                  { label: "In review", value: activeCount, color: CHART_COLORS.blue },
                  { label: "With police", value: withAgency, color: CHART_COLORS.purple },
                  { label: "Investigating", value: investigating, color: CHART_COLORS.amber },
                  { label: "Outcome", value: withOutcome, color: CHART_COLORS.teal },
                  { label: "Closed", value: rejectedCount, color: CHART_COLORS.rose }
                ]}
              />
            </article>

            <article className="kw-dash-card">
              <h3>Reports by status</h3>
              <DonutChart
                segments={statusSegments}
                centerValue={reports.length}
                centerLabel="reports"
                ariaLabel={`Reports by status: ${statusSegments.map((s) => `${s.label} ${s.value}`).join(", ")}`}
              />
            </article>

            <article className="kw-dash-card">
              <h3>Reports over time</h3>
              <LineChart
                points={trend}
                ariaLabel={`Cumulative reports by month: ${trend.map((p) => `${p.label} ${p.value}`).join(", ")}`}
              />
              <ChartTable caption="Cumulative reports by month" rows={trend.map((p) => [p.label, p.value])} />
            </article>

            <article className="kw-dash-card kw-dash-wide">
              <h3>Case progress tracking</h3>
              <div className="kw-dash-wide-body">
                <div className="kw-dash-bigstat">
                  <strong>{withAgency}<small> / {reports.length}</small></strong>
                  <span>reports in the hands of an institution</span>
                </div>
                <div className="kw-dash-bars">
                  <StageBars
                    bars={recent.map((report, i) => ({ label: String(i + 1), stage: journeyStage(report), color: STAGE_COLORS[journeyStage(report) - 1] }))}
                    ariaLabel={`Stage reached by each report, from 1 (${JOURNEY_STEPS[0].label}) to 5 (${JOURNEY_STEPS[4].label}): ${recent.map((r, i) => `report ${i + 1} stage ${journeyStage(r)}`).join(", ")}`}
                  />
                  <div className="kw-helper">Each bar is one report; taller means further along its journey (1 Received … 5 Outcome recorded).</div>
                </div>
              </div>
            </article>

            <article className="kw-dash-card">
              <h3>Outcomes recorded</h3>
              <DonutChart
                segments={[
                  { label: "Outcome recorded", value: withOutcome, color: CHART_COLORS.teal },
                  { label: "Still in progress", value: Math.max(reports.length - withOutcome, 0), color: "#cbd5e1" }
                ]}
                centerValue={`${outcomeRate}%`}
                centerLabel="decided"
                ariaLabel={`${outcomeRate} percent of your reports have an outcome recorded by an institution`}
              />
            </article>
          </section>
        )}

        <div id="notifications"><NotificationSettings /></div>

        <section className="kw-dashboard-reports" aria-labelledby="citizen-reports-heading">
          <div className="kw-dashboard-section-heading">
            <div>
              <div className="kw-dashboard-eyebrow">CASE ACTIVITY</div>
              <h2 id="citizen-reports-heading">Your reports</h2>
            </div>
            {!loading && <span className="kw-dashboard-count">{reports.length} {reports.length === 1 ? "report" : "reports"}</span>}
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          {loading && <div className="kw-dashboard-loading" role="status">Loading your reports…</div>}
          {!loading && !error && reports.length === 0 && (
            <div className="kw-dashboard-empty">
              <div className="kw-dashboard-empty-icon" aria-hidden="true">🗂️</div>
              <h3>Your report list is ready when you are</h3>
              <p>You haven’t submitted a report while signed in yet. Any anonymous reports can be followed from the Track page.</p>
              <Link className="kw-btn kw-dashboard-link" to="/submit">Create your first report</Link>
            </div>
          )}
          {!loading && reports.length > 0 && (
            <div className="kw-dashboard-report-list">
              {reports.map((r) => (
                <article className="kw-dashboard-report" key={r._id}>
                  <div className="kw-dashboard-report-top">
                    <div className="kw-dashboard-report-title">
                      <span className="kw-dashboard-report-mark" aria-hidden="true">●</span>
                      <div>
                        <h3>{r.title}</h3>
                        <div className="kw-dashboard-report-subtitle">{r.reportedCategory} <span aria-hidden="true">·</span> {r.county}{r.subCounty ? `, ${r.subCounty}` : ""}</div>
                      </div>
                    </div>
                    <span className={`kw-status-badge ${statusClass(r.status)}`}>{r.status}</span>
                  </div>
                  <div className="kw-dashboard-report-meta">
                    <span className="kw-dashboard-reference"><span aria-hidden="true">#</span> {r.trackingReference}</span>
                    {r.createdAt && <span>Submitted {new Date(r.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>}
                  </div>
                  <CaseJourney report={r} />
                  <p className="kw-dashboard-description">{r.description}</p>
                  <EvidenceDownloads reportId={r._id} evidence={r.evidence} />
                  {(r.agencyReferrals || []).length > 0 && (
                    <div className="kw-pro-meta">
                      <b>{r.agencyReferrals.length > 1 ? "Institutions handling your report:" : "Institution handling your report:"}</b>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {r.agencyReferrals.map((referral) => (
                          <li key={referral.agency}>
                            {referral.agency} — {(referral.status || "sent").replaceAll("_", " ")}
                            {referral.outcome && `: ${OUTCOME_LABELS[referral.outcome] || referral.outcome}`}
                            {referral.outcomeSummary && <div className="kw-helper">{referral.outcomeSummary}</div>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.status === "Resolved" && r.resolutionNote && (
                    <div className="kw-dashboard-outcome">
                      <b>Resolution</b>
                      <p>{r.resolutionNote}{r.resolutionReference ? ` (Reference: ${r.resolutionReference})` : ""}</p>
                    </div>
                  )}
                  {r.status === "Rejected" && (
                    <div className="kw-pro-meta kw-rejection-box" role="status">
                      <b>Why this case was closed:</b>{" "}
                      {r.rejectionReason ||
                        "The review team determined this report falls outside the platform scope. You may submit a new report with additional detail."}
                    </div>
                  )}
                  {(r.comments?.length || 0) > 0 && (
                    <div className="kw-pro-meta">
                      <b>Additional information you added:</b>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {r.comments.map((c) => (
                          <li key={c._id || c.createdAt}>{c.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <CommentForm
                    reportId={r._id}
                    onAdded={(comments) => setReports((prev) => prev.map((x) => (x._id === r._id ? { ...x, comments } : x)))}
                  />
                </article>
              ))}
            </div>
          )}
        </section>

        <ChangePassword />

        <section className="kw-dashboard-danger-zone" aria-labelledby="delete-account-heading">
          <div>
            <div className="kw-dashboard-eyebrow">ACCOUNT CONTROLS</div>
            <h2 id="delete-account-heading">Delete your account</h2>
            <p>You can permanently remove your citizen account whenever you choose.</p>
          </div>
          {!showDeleteForm ? (
            <button type="button" className="kw-btn kw-btn-danger" onClick={() => setShowDeleteForm(true)}>
              Permanently delete account
            </button>
          ) : (
            <form className="kw-delete-account-form" onSubmit={submitAccountDeletion}>
              <div className="kw-dashboard-delete-warning">
                <strong>This cannot be undone.</strong> Your account, sign-in sessions and notifications will be deleted. Reports already submitted will remain for case integrity, but the account link and your comment attribution will be removed. You may lose access to reports saved only in this account.
              </div>
              <div className="kw-form-section">
                <label htmlFor="delete-account-password">Confirm your password</label>
                <input
                  id="delete-account-password"
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  required
                />
              </div>
              <div className="kw-form-section">
                <label htmlFor="delete-account-confirmation">Type DELETE to confirm</label>
                <input
                  id="delete-account-confirmation"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  autoComplete="off"
                  required
                />
              </div>
              {deleteError && <div className="error" role="alert">{deleteError}</div>}
              <div className="kw-receipt-actions">
                <button type="submit" className="kw-btn kw-btn-danger" disabled={deleting || deleteConfirmation !== "DELETE" || !deletePassword}>
                  {deleting ? "Deleting account…" : "Confirm permanent deletion"}
                </button>
                <button
                  type="button"
                  className="kw-btn kw-btn-secondary"
                  onClick={() => {
                    setShowDeleteForm(false);
                    setDeletePassword("");
                    setDeleteConfirmation("");
                    setDeleteError("");
                  }}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

export default MyReports;
