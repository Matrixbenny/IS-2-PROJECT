import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import EvidenceDownloads from "../components/EvidenceDownloads";
import NotificationSettings from "../components/NotificationSettings";
import usePolling from "../hooks/usePolling";

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
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
    <form
      className="kw-form-section"
      onSubmit={submit}
      style={{ marginTop: 10 }}
    >
      <label htmlFor={`comment-${reportId}`}>
        Add follow-up information for reviewers
      </label>
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
        <button
          type="submit"
          className="kw-btn kw-btn-secondary"
          disabled={busy || text.trim().length < 2}
        >
          {busy ? "Sending..." : "Add information"}
        </button>
      </div>
      {added && (
        <div className="kw-helper" role="status">
          Added - reviewers will see this alongside your report.
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}

function MyReports() {
  const { user, deleteAccount } = useAuth();
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
        <p>
        My Reports is available to citizen accounts only. Use your role-specific workspace instead.
        </p>
      </div>
    );
  }

  const activeCount = reports.filter((report) => ['Received', 'In Review'].includes(report.status)).length;
  const resolvedCount = reports.filter((report) => report.status === 'Resolved').length;
  const greetingName = user.name?.trim().split(/\s+/)[0] || 'there';

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
    <div className="kw-citizen-dashboard">
      <section className="kw-dashboard-hero">
        <div className="kw-dashboard-hero-copy">
          <div className="kw-dashboard-eyebrow">YOUR PRIVATE SPACE</div>
          <h2>Welcome back, {greetingName}</h2>
          <p>Keep an eye on your reports and share additional details with the review team.</p>
        </div>
        <div className="kw-dashboard-hero-icon" aria-hidden="true">🛡️</div>
        <Link className="kw-dashboard-new-report" to="/submit">
          <span aria-hidden="true">＋</span> Submit a report
        </Link>
      </section>

      <NotificationSettings />

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

      <section className="kw-dashboard-reports" aria-labelledby="citizen-reports-heading">
        <div className="kw-dashboard-section-heading">
          <div>
            <div className="kw-dashboard-eyebrow">CASE ACTIVITY</div>
            <h2 id="citizen-reports-heading">Your reports</h2>
          </div>
          {!loading && <span className="kw-dashboard-count">{reports.length} {reports.length === 1 ? 'report' : 'reports'}</span>}
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
                      <div className="kw-dashboard-report-subtitle">{r.reportedCategory} <span aria-hidden="true">·</span> {r.county}{r.subCounty ? `, ${r.subCounty}` : ''}</div>
                    </div>
                  </div>
                  <span className={`kw-status-badge ${statusClass(r.status)}`}>{r.status}</span>
                </div>
                <div className="kw-dashboard-report-meta">
                  <span className="kw-dashboard-reference"><span aria-hidden="true">#</span> {r.trackingReference}</span>
                  {r.createdAt && <span>Submitted {new Date(r.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>}
                </div>
                <p className="kw-dashboard-description">{r.description}</p>
                <EvidenceDownloads reportId={r._id} evidence={r.evidence} />
                {r.status === "Resolved" && r.resolutionNote && (
                  <div className="kw-dashboard-outcome">
                    <b>Resolution</b>
                    <p>{r.resolutionNote}{r.resolutionReference ? ` (Reference: ${r.resolutionReference})` : ''}</p>
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
                  onAdded={(comments) =>
                    setReports((prev) =>
                      prev.map((x) => (x._id === r._id ? { ...x, comments } : x)),
                    )
                  }
                />
              </article>
            ))}
          </div>
        )}
      </section>

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
  );
}

export default MyReports;
