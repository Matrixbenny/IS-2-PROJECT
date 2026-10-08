import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}
function urgencyClass(urgency) {
  return `kw-urgency-badge kw-urgency-${(urgency || 'low').toLowerCase()}`;
}

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
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    api.get(`/reports/${report._id}/related-suggestions`).then((res) => setSuggestions(res.data)).catch(() => {});
  }, [report._id]);

  const handleLink = async (relatedId) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/reports/${report._id}/link`, { relatedId });
      onChanged(res.data);
      setSuggestions(suggestions.filter((s) => s.id !== relatedId));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  const handleClaim = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/reports/${report._id}/claim`);
      onChanged(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  const handleStatusSave = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/reports/${report._id}/status`, { status, resolutionNote, resolutionReference });
      onChanged(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  const handleRefer = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/reports/${report._id}/refer`, { agency, referenceNumber, notes });
      onChanged(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  return (
    <div className="kw-case-detail">
      <div className="kw-pro-meta"><b>Description:</b> {report.description}</div>
      {Object.keys(report.categorySpecificDetails || {}).length > 0 && (
        <div className="kw-pro-meta"><b>Category details:</b> {JSON.stringify(report.categorySpecificDetails)}</div>
      )}
      <div className="kw-pro-meta">
        <b>ML classification:</b> {report.classification?.category || 'Classifying...'}{' '}
        {report.classification?.urgency && <span className={urgencyClass(report.classification.urgency)}>{report.classification.urgency}</span>}
      </div>
      <div className="kw-pro-meta"><b>Reporter:</b> {report.hasAccount ? 'Registered reporter' : 'Anonymous'}</div>
      <div className="kw-pro-meta"><b>Claimed by:</b> {report.claimedBy ? 'Claimed' : <span className="kw-faded">Unclaimed</span>}</div>
      <div className="kw-pro-meta"><b>Evidence:</b> {report.evidence.length > 0 ? `${report.evidence.length} file(s)` : 'None'}</div>

      {!report.claimedBy && (
        <button type="button" className="kw-btn" onClick={handleClaim} disabled={busy}>Claim This Case</button>
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
        <button type="submit" className="kw-btn" disabled={busy}>Save Status</button>
      </form>

      <form className="kw-pro-form kw-case-form" onSubmit={handleRefer}>
        <h4>Refer to Agency</h4>
        <div className="kw-helper">Kenya Watch does not auto-submit anything externally - this records a referral you make through a real-world channel (phone/email/letter).</div>
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
        <button type="submit" className="kw-btn kw-btn-secondary" disabled={busy || !agency}>Save Referral</button>
      </form>

      <div className="kw-case-form kw-pro-form">
        <h4>Related Cases</h4>
        <div className="kw-helper">Soft suggestions only - linking is additive and never merges or auto-links cases (decision #16).</div>
        {report.relatedCaseLinks && report.relatedCaseLinks.length > 0 && (
          <div className="kw-pro-meta"><b>Already linked:</b> {report.relatedCaseLinks.length} case(s)</div>
        )}
        {suggestions.length === 0 && <div className="kw-faded">No similar cases found (same category + county).</div>}
        {suggestions.map((s) => (
          <div className="kw-pro-meta" key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><span className="kw-tracking-chip">{s.trackingReference}</span> {s.title} - {s.subCounty}</span>
            <button type="button" className="kw-btn-secondary kw-btn" style={{ marginTop: 0, padding: '5px 12px', fontSize: '0.82rem' }} onClick={() => handleLink(s.id)} disabled={busy}>Link</button>
          </div>
        ))}
      </div>

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
    api.get('/reports/queue').then((res) => setReports(res.data)).catch((err) => setError(err.response?.data?.error || err.message));
    api.get('/reports/agencies').then((res) => setAgencies(res.data.agencies)).catch(() => {});
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
              <span className={`kw-status-badge ${statusClass(r.status)}`}>{r.status}</span>
            </div>
            <div className="kw-pro-meta"><span className="kw-tracking-chip">{r.trackingReference}</span></div>
            <div className="kw-pro-meta"><b>Category:</b> {r.reportedCategory}{' '}
              {r.classification?.urgency && <span className={urgencyClass(r.classification.urgency)}>{r.classification.urgency}</span>}
            </div>
            <div className="kw-pro-meta"><b>Location:</b> {r.subCounty}, {r.county}</div>
            <button type="button" className="kw-btn kw-btn-secondary" onClick={() => setSelectedId(selectedId === r._id ? null : r._id)}>
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
