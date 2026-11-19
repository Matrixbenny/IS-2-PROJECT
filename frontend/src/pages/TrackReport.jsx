import React, { useCallback, useState } from 'react';
import api from '../api';
import CaseJourney from '../components/CaseJourney';
import EvidenceDownloads from '../components/EvidenceDownloads';
import usePolling from '../hooks/usePolling';

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}

const OUTCOME_LABELS = {
  investigated_charged: 'Investigated and charges filed',
  investigated_no_action: 'Investigated, no charges filed',
  referred_elsewhere: 'Referred to another authority',
  administrative_action: 'Administrative action taken',
  not_pursued: 'Not pursued by this institution'
};

function TrackReport() {
  const [ref, setRef] = useState('');
  const [key, setKey] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshReport = useCallback(async () => {
    if (!report) return;
    try {
      const res = await api.get('/reports/track', { params: { ref: ref.trim(), key: key.trim() } });
      setReport(res.data);
      setError('');
    } catch (loadError) {
      if (loadError.response?.status === 404) {
        setReport(null);
        setError('This report is no longer available.');
      } else {
        setError(loadError.response?.data?.error || 'Could not refresh this report.');
      }
    }
  }, [report, ref, key]);

  usePolling(refreshReport);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setReport(null);
    setLoading(true);
    try {
      const res = await api.get('/reports/track', { params: { ref: ref.trim(), key: key.trim() } });
      setReport(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Lookup failed');
    }
    setLoading(false);
  };

  return (
    <div>
      <h2>Track Your Report</h2>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        Enter the Tracking Reference and Access Key you received when you submitted your report.
      </div>
      <form className="report-form kw-pro-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="ref">Tracking Reference</label>
          <input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="KW-XXXXXX" required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="key">Access Key</label>
          <input id="key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="purple-tiger-lemon-forest" required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Looking up...' : 'Check Status'}</button>
        {error && <div className="error">{error}</div>}
      </form>

      {report && (
        <div className="kw-page-card">
          <div className="kw-pro-card-row">
            <h3 style={{ margin: 0 }}>{report.title}</h3>
            <span className={`kw-status-badge ${statusClass(report.status)}`}>{report.status}</span>
          </div>
          <div className="kw-pro-meta"><span className="kw-tracking-chip">{report.trackingReference}</span></div>
          {report.caseStatus?.claimed && (
            <div className="kw-claimed-banner" role="status">
              <span className="kw-claimed-tick" aria-hidden="true">✓</span>
              <span>
                <strong>Received and claimed.</strong> A Kenya Watch reviewer has taken up your case
                {report.caseStatus.claimedAt ? ` on ${new Date(report.caseStatus.claimedAt).toLocaleDateString()}` : ''}
                {' '}and it is currently <strong>under review</strong>.
              </span>
            </div>
          )}
          <div className="kw-pro-meta"><b>Category:</b> {report.reportedCategory}</div>
          <div className="kw-pro-meta"><b>Location:</b> {report.subCounty}, {report.county}</div>
          <div className="kw-pro-meta"><b>Description:</b> {report.description}</div>
          <EvidenceDownloads
            reportId={report._id}
            evidence={report.evidence}
            trackingReference={report.trackingReference}
            trackingKey={key.trim()}
          />
          <div className="kw-pro-meta"><b>Submitted:</b> {new Date(report.createdAt).toLocaleString()}</div>
          {report.resolutionNote && (
            <div className="kw-pro-meta"><b>Resolution:</b> {report.resolutionNote} (Ref: {report.resolutionReference})</div>
          )}
          {report.status === 'Rejected' && report.rejectionReason && (
            <div className="kw-pro-meta kw-rejection-box" role="status">
              <b>Why this case was closed:</b> {report.rejectionReason}
            </div>
          )}
          <div className="kw-pro-meta"><b>Status history:</b></div>
          <ul>
            {report.statusHistory.map((h, i) => (
              <li key={i} className="kw-pro-meta">
                {h.status} - {new Date(h.changedAt).toLocaleString()}
                {h.note && <div className="kw-helper">{h.note}</div>}
              </li>
            ))}
          </ul>
          <CaseJourney report={report} />
          {report.agencyReferrals?.length > 0 && (
            <section aria-labelledby="agency-progress-heading">
              <h4 id="agency-progress-heading">
                {report.agencyReferrals.length > 1 ? 'Agency follow-up (several institutions are handling your report)' : 'Agency follow-up'}
              </h4>
              {report.agencyReferrals.map((referral) => (
                <div key={referral.agency} className="kw-agency-progress">
                  {referral.outcome && (
                    <div className="kw-outcome-panel" role="status">
                      <div className="kw-outcome-heading">
                        <span className="kw-claimed-tick" aria-hidden="true">✓</span>
                        <strong>Outcome from {referral.agency}</strong>
                      </div>
                      <p className="kw-outcome-label">{OUTCOME_LABELS[referral.outcome] || referral.outcome}</p>
                      <p className="kw-outcome-summary">{referral.outcomeSummary}</p>
                      <div className="kw-pro-meta">
                        {referral.outcomeReference && <div><b>Reference:</b> {referral.outcomeReference}</div>}
                        {referral.legalBasis && <div><b>Legal basis:</b> {referral.legalBasis}</div>}
                        {referral.closedAt && <div><b>Closed:</b> {new Date(referral.closedAt).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  )}
                  <p className="kw-pro-meta">
                    Referred to {referral.agency} · {referral.status.replaceAll('_', ' ')}
                  </p>
                  {referral.updates.length > 0 ? (
                    <ul>
                      {referral.updates.map((update, index) => (
                        <li key={`${update.createdAt}-${index}`} className="kw-pro-meta">
                          {update.message} · {new Date(update.createdAt).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    !referral.outcome && <p className="kw-helper">The agency is handling the referral. Reporter-facing messages appear here after Kenya Watch review.</p>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default TrackReport;
