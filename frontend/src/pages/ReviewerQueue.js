import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '../api';
import { useAuth } from '../context/AuthContext';

const STATUSES = ['Received', 'In Review', 'Resolved', 'Rejected'];

function CaseDetail({ report, agencies, onChanged }) {
  const [status, setStatus] = useState(report.status);
  const [resolutionNote, setResolutionNote] = useState(report.resolutionNote || '');
  const [resolutionReference, setResolutionReference] = useState(report.resolutionReference || '');
  const [agency, setAgency] = useState(report.agencyReferral?.agency || report.suggestedAgency || '');
  const [referenceNumber, setReferenceNumber] = useState(report.agencyReferral?.referenceNumber || '');
  const [notes, setNotes] = useState(report.agencyReferral?.notes || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleClaim = async () => {
    setBusy(true);
    setError('');
    try {
      const updated = await apiPost(`/reports/${report._id}/claim`, {});
      onChanged(updated);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleStatusSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await apiPatch(`/reports/${report._id}/status`, { status, resolutionNote, resolutionReference });
      onChanged(updated);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleRefer = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await apiPost(`/reports/${report._id}/refer`, { agency, referenceNumber, notes });
      onChanged(updated);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="kw-case-detail">
      <div className="kw-pro-meta"><b>Description:</b> {report.description}</div>
      {Object.keys(report.categorySpecificDetails || {}).length > 0 && (
        <div className="kw-pro-meta"><b>Category details:</b> {JSON.stringify(report.categorySpecificDetails)}</div>
      )}
      <div className="kw-pro-meta"><b>ML classification:</b> {report.classification?.category || 'Classifying...'} / {report.classification?.urgency || '...'}</div>
      <div className="kw-pro-meta"><b>Reporter:</b> {report.hasAccount ? 'Registered reporter' : 'Anonymous'}</div>
      <div className="kw-pro-meta"><b>Claimed by:</b> {report.claimedBy || <span className="kw-faded">Unclaimed</span>}</div>
      <div className="kw-pro-meta"><b>Evidence:</b> {report.evidence.length > 0 ? `${report.evidence.length} file(s)` : 'None'}</div>

      {!report.claimedBy && (
        <button type="button" onClick={handleClaim} disabled={busy}>Claim This Case</button>
      )}

      <form className="kw-pro-form kw-case-form" onSubmit={handleStatusSave}>
        <h4>Update Status</h4>
        <div className="kw-form-section">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {status === 'Resolved' && (
          <>
            <div className="kw-form-section">
              <label>Resolution note<span className="kw-required">*</span></label>
              <textarea value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} required />
            </div>
            <div className="kw-form-section">
              <label>Resolution reference<span className="kw-required">*</span></label>
              <input value={resolutionReference} onChange={(e) => setResolutionReference(e.target.value)} required />
            </div>
          </>
        )}
        <button type="submit" disabled={busy}>Save Status</button>
      </form>

      <form className="kw-pro-form kw-case-form" onSubmit={handleRefer}>
        <h4>Refer to Agency</h4>
        <div className="kw-form-section">
          <label>Agency</label>
          <select value={agency} onChange={(e) => setAgency(e.target.value)}>
            <option value="">Select agency...</option>
            {agencies.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div className="kw-form-section">
          <label>Agency reference number</label>
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
        </div>
        <div className="kw-form-section">
          <label>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <button type="submit" disabled={busy || !agency}>Save Referral</button>
      </form>

      {error && <div className="error">{error}</div>}
    </div>
  );
}

function ReviewerQueue() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    apiGet('/reports/queue').then(setReports).catch((err) => setError(err.message));
    apiGet('/reports/agencies').then((d) => setAgencies(d.agencies)).catch(() => {});
  };

  useEffect(() => {
    if (user && ['reviewer', 'admin'].includes(user.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || !['reviewer', 'admin'].includes(user.role)) {
    return <div className="kw-helper">This page is only available to Reviewers and Admins.</div>;
  }

  const handleChanged = (updated) => {
    setReports(reports.map((r) => (r._id === updated._id ? updated : r)));
  };

  return (
    <div>
      <h2>Reviewer Queue</h2>
      {error && <div className="error">{error}</div>}
      <div className="reports-list">
        {reports.map((r) => (
          <div className="report-card kw-pro-card" key={r._id}>
            <div className="kw-pro-card-row">
              <h3>{r.title}</h3>
              <span className="kw-status-badge">{r.status}</span>
            </div>
            <div className="kw-pro-meta"><b>Tracking Reference:</b> <span className="kw-mono">{r.trackingReference}</span></div>
            <div className="kw-pro-meta"><b>Category:</b> {r.reportedCategory} <b>Urgency:</b> {r.classification?.urgency || 'Classifying...'}</div>
            <div className="kw-pro-meta"><b>Location:</b> {r.county}, {r.subCounty}</div>
            <button type="button" onClick={() => setSelectedId(selectedId === r._id ? null : r._id)}>
              {selectedId === r._id ? 'Close' : 'Open Case'}
            </button>
            {selectedId === r._id && <CaseDetail report={r} agencies={agencies} onChanged={handleChanged} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReviewerQueue;
