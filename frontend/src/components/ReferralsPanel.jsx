import React, { useCallback, useEffect, useState } from 'react';
import api from '../api';

const OUTCOME_LABELS = {
  investigated_charged: 'Investigated and charges filed',
  investigated_no_action: 'Investigated, no charges filed',
  referred_elsewhere: 'Referred to another authority',
  administrative_action: 'Administrative action taken',
  not_pursued: 'Not pursued by this institution'
};

const ROLE_LABELS = {
  investigator: 'Investigates',
  prosecutor: 'Prosecutes',
  auditor: 'Audits',
  oversight: 'Oversight',
  administrative: 'Administrative discipline'
};

function errorText(err) {
  return err.response?.data?.error || err.message;
}

// Routing aid: which institution(s) should get this case. It only suggests; the
// reviewer picks, and what they pick is recorded next to the suggestion.
function RoutingPanel({ reportId, referralVersion, onPick }) {
  const [routing, setRouting] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/reports/${reportId}/routing-suggestion`)
      .then((res) => { if (!cancelled) { setRouting(res.data); setMessage(''); } })
      .catch((err) => {
        if (cancelled) return;
        setRouting(null);
        setMessage(err.response?.data?.error || 'Routing suggestions are not available right now.');
      });
    return () => { cancelled = true; };
  }, [reportId, referralVersion]);

  if (!routing) {
    return message ? (
      <section className="kw-routing" aria-label="Suggested routing">
        <h4>Suggested routing</h4>
        <div className="kw-helper">{message}</div>
      </section>
    ) : null;
  }

  const intake = routing.agencies.filter((agency) => agency.stage === 'intake');
  const followOn = routing.agencies.filter((agency) => agency.stage === 'follow_on');

  const renderAgency = (agency) => (
    <li key={agency.name} className={`kw-routing-agency${agency.recommended ? ' kw-routing-recommended' : ''}`}>
      <div className="kw-routing-head">
        <strong>{agency.name}</strong>
        {agency.recommended && <span className="kw-claim-badge kw-claim-mine">Recommended</span>}
        <span className="kw-faded">{ROLE_LABELS[agency.role] || agency.role}</span>
      </div>
      <div className="kw-helper">{agency.reasons.join('; ')}</div>
      {agency.note && <div className="kw-helper">{agency.note}</div>}
      {agency.alreadyReferred ? (
        <div className="kw-helper"><b>Already referred.</b></div>
      ) : agency.available === false ? (
        <div className="kw-helper"><b>No active portal account yet.</b> Ask an Admin to complete this institution's onboarding.</div>
      ) : (
        <button type="button" className="kw-btn kw-btn-secondary" onClick={() => onPick(agency.name)}>
          Prepare referral to this agency
        </button>
      )}
    </li>
  );

  return (
    <section className="kw-routing" aria-label="Suggested routing">
      <h4>Suggested routing</h4>
      <div className="kw-helper">{routing.disclaimer}</div>
      <div className="kw-pro-meta">
        <b>Kinds of wrongdoing detected:</b>{' '}
        {routing.categories.length === 0
          ? 'none beyond "Other" - choose the institution manually'
          : routing.categories.map((item) => `${item.category} (${item.sources.join(', ')})`).join('; ')}
      </div>
      {routing.multiAgency && (
        <div className="kw-helper" role="note">
          This case appears to involve more than one kind of wrongdoing, so more than one institution is recommended.
          Each gets its own referral and its own case file.
        </div>
      )}
      {intake.length > 0 && <ul className="kw-routing-list">{intake.map(renderAgency)}</ul>}
      {followOn.length > 0 && (
        <>
          <div className="kw-pro-meta"><b>Later step</b></div>
          <ul className="kw-routing-list">{followOn.map(renderAgency)}</ul>
        </>
      )}
    </section>
  );
}

function CaseFileEditor({ report, referral, busy, onSave }) {
  const released = referral.caseFile || {};
  const [narrative, setNarrative] = useState(Boolean(released.narrative));
  const [details, setDetails] = useState(Boolean(released.categoryDetails));
  const [ids, setIds] = useState((released.evidence || []).map((item) => item.evidenceId));
  const [reviewed, setReviewed] = useState(false);
  const alreadyReleased = new Set((released.evidence || []).map((item) => item.evidenceId));
  const addingFiles = ids.some((id) => !alreadyReleased.has(id));

  return (
    <details className="kw-casefile-edit">
      <summary>Change what {referral.agency} can see</summary>
      <div className="kw-helper">
        Add a file the agency asked for, or take access back. Removing a file stops that agency downloading it immediately.
      </div>
      <label className="kw-release-option">
        <input type="checkbox" checked={narrative} onChange={(e) => setNarrative(e.target.checked)} />
        <span><strong>The complaint narrative</strong></span>
      </label>
      {Object.keys(report.categorySpecificDetails || {}).length > 0 && (
        <label className="kw-release-option">
          <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
          <span><strong>Category-specific details</strong></span>
        </label>
      )}
      {(report.evidence || []).map((item) => (
        <label key={item.id} className="kw-release-option">
          <input
            type="checkbox"
            checked={ids.includes(item.id)}
            onChange={(e) => setIds((current) => (e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)))}
          />
          <span><strong>{item.filename}</strong><small>{item.type}</small></span>
        </label>
      ))}
      {addingFiles && (
        <label className="kw-release-option">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          <span><strong>I have reviewed every newly released file.</strong></span>
        </label>
      )}
      <button
        type="button"
        className="kw-btn kw-btn-secondary"
        disabled={busy || (addingFiles && !reviewed)}
        onClick={() => onSave({
          releaseNarrative: narrative,
          releaseCategoryDetails: details,
          releaseEvidenceIds: ids,
          evidenceReviewed: reviewed
        })}
      >
        Save case file changes
      </button>
    </details>
  );
}

function ReferralCard({ report, referral, requests, isAdmin, busy, run }) {
  const [answers, setAnswers] = useState({});
  const [endReason, setEndReason] = useState('transferred');
  const [endNote, setEndNote] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const base = `/reports/${report._id}/referrals/${referral._id}`;
  const status = (referral.status || 'sent').replaceAll('_', ' ');

  return (
    <section className="kw-case-form kw-pro-form kw-referral-card" aria-label={`Referral to ${referral.agency}`}>
      <h4>{referral.agency}</h4>
      <div className="kw-pro-meta"><b>Status:</b> {status}</div>
      <div className="kw-pro-meta"><b>Recorded:</b> {referral.referredAt ? new Date(referral.referredAt).toLocaleString() : 'Date not recorded'}</div>
      <div className="kw-pro-meta"><b>Shared brief:</b> {referral.referralSummary || 'Not recorded'}</div>
      <div className="kw-pro-meta"><b>Agency reference:</b> {referral.referenceNumber || 'Not yet provided'}</div>
      <div className="kw-pro-meta"><b>Internal liaison note:</b> {referral.notes || 'None'}</div>
      <div className="kw-pro-meta">
        <b>Released to this agency:</b>{' '}
        {[
          referral.caseFile?.narrative ? 'narrative' : null,
          referral.caseFile?.categoryDetails ? 'category details' : null,
          (referral.caseFile?.evidence || []).length ? `${referral.caseFile.evidence.length} evidence file(s)` : null
        ].filter(Boolean).join(', ') || 'brief only'}
      </div>
      {(referral.accessLog || []).length > 0 && (
        <details>
          <summary>Who opened the released material ({referral.accessLog.length})</summary>
          <ul>
            {referral.accessLog.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="kw-pro-meta">
                {new Date(entry.at).toLocaleString()} · {entry.userEmail} · {entry.action === 'download_evidence' ? `downloaded ${entry.filename}` : 'opened the case file'}
              </li>
            ))}
          </ul>
        </details>
      )}

      {referral.resolution?.outcome && (
        <div className="kw-outcome-panel" role="status">
          <strong>Outcome recorded by the agency:</strong> {OUTCOME_LABELS[referral.resolution.outcome] || referral.resolution.outcome}
          <div>{referral.resolution.outcomeSummary}</div>
          <div className="kw-pro-meta">Reference: {referral.resolution.outcomeReference}{referral.resolution.legalBasis ? ` · ${referral.resolution.legalBasis}` : ''}</div>
        </div>
      )}

      {requests.length > 0 && (
        <div className="kw-info-requests" aria-label={`Questions from ${referral.agency}`}>
          <h5>Questions from {referral.agency}</h5>
          <div className="kw-helper">
            The investigating officer needs more information. Your answer goes back to that agency's portal only. If they need
            a file, use "Change what {referral.agency} can see" below.
          </div>
          {requests.map((request) => (
            <article key={request._id} className="kw-info-request">
              <div className="kw-info-question">{request.question}</div>
              <div className="kw-helper">Asked by {request.requestedByEmail} · {new Date(request.requestedAt).toLocaleString()}</div>
              {request.status === 'answered' ? (
                <div className="kw-info-answer">
                  <b>Your answer:</b> {request.answer}
                  <div className="kw-helper">Answered {new Date(request.answeredAt).toLocaleString()}</div>
                </div>
              ) : (
                <div className="kw-form-section">
                  <label htmlFor={`answer-${request._id}`}>Answer</label>
                  <textarea
                    id={`answer-${request._id}`}
                    rows={3}
                    maxLength={5000}
                    value={answers[request._id] || ''}
                    onChange={(e) => setAnswers({ ...answers, [request._id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className="kw-btn kw-btn-secondary"
                    disabled={busy || (answers[request._id] || '').trim().length < 5}
                    onClick={() => run(
                      () => api.post(`/reports/${report._id}/information-requests/${request._id}/answer`, { answer: answers[request._id] }),
                      () => setAnswers({ ...answers, [request._id]: '' })
                    )}
                  >
                    Send answer to agency
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <div className="kw-pro-meta"><b>Agency updates:</b> {referral.agencyUpdates?.length || 0}</div>
      {referral.agencyUpdates?.map((update, index) => (
        <div className="kw-pro-meta" key={`${update.createdAt}-${index}`}>
          <b>{update.createdByName || 'Agency officer'}</b> · {new Date(update.createdAt).toLocaleString()} · {(update.status || 'update').replaceAll('_', ' ')}
          <div>{update.note}</div>
          {update.publicMessage && (
            <div className="kw-pro-form">
              <b>Proposed reporter message</b> ({update.publicMessageStatus})
              <div>{update.publicMessage}</div>
              {isAdmin && update.publicMessageStatus === 'pending' && (
                <>
                  <button type="button" className="kw-btn kw-btn-secondary" disabled={busy}
                    onClick={() => run(() => api.patch(`/agency-portal/cases/${report._id}/updates/${update._id}/review`, { decision: 'approved' }))}>
                    Approve for reporter
                  </button>
                  <button type="button" className="kw-btn kw-btn-secondary" disabled={busy}
                    onClick={() => run(() => api.patch(`/agency-portal/cases/${report._id}/updates/${update._id}/review`, { decision: 'rejected' }))}>
                    Reject
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {(referral.reopenHistory || []).length > 0 && (
        <details>
          <summary>Reopened {referral.reopenHistory.length} time(s)</summary>
          <ul>
            {referral.reopenHistory.map((entry, index) => (
              <li key={`${entry.reopenedAt}-${index}`} className="kw-pro-meta">
                {new Date(entry.reopenedAt).toLocaleString()} · {entry.reopenedByName}: {entry.reason}
                {entry.previousOutcome && ` (replaced outcome: ${OUTCOME_LABELS[entry.previousOutcome] || entry.previousOutcome})`}
              </li>
            ))}
          </ul>
        </details>
      )}

      {referral.status !== 'closed' && (
        <CaseFileEditor
          report={report}
          referral={referral}
          busy={busy}
          onSave={(body) => run(() => api.patch(`${base}/case-file`, body))}
        />
      )}

      {isAdmin && referral.status === 'closed' && (
        <details className="kw-reopen">
          <summary>Reopen this referral (Admin)</summary>
          <div className="kw-helper">
            Use when a case was closed in error or new facts have emerged. The earlier outcome is kept in the history and the
            report leaves "Resolved".
          </div>
          <label htmlFor={`reopen-${referral._id}`}>Reason for reopening</label>
          <textarea id={`reopen-${referral._id}`} rows={2} minLength={20} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
          <button
            type="button"
            className="kw-btn kw-btn-secondary"
            disabled={busy || reopenReason.trim().length < 20}
            onClick={() => run(() => api.post(`${base}/reopen`, { reason: reopenReason }), () => setReopenReason(''))}
          >
            Reopen referral
          </button>
        </details>
      )}

      {referral.status !== 'closed' && (
        <details className="kw-end-referral">
          <summary>Sent to the wrong place? End this referral</summary>
          <label htmlFor={`end-reason-${referral._id}`}>What happened</label>
          <select id={`end-reason-${referral._id}`} value={endReason} onChange={(e) => setEndReason(e.target.value)}>
            <option value="transferred">Transferred - another agency should handle it</option>
            <option value="withdrawn">Withdrawn - no longer needs to be handled by this agency</option>
          </select>
          <label htmlFor={`end-note-${referral._id}`}>Reason (kept in the record)</label>
          <input id={`end-note-${referral._id}`} value={endNote} minLength={10} onChange={(e) => setEndNote(e.target.value)} />
          <div className="kw-helper">The agency loses access to this case immediately. Refer the case to the right institution separately.</div>
          <button
            type="button"
            className="kw-btn kw-btn-secondary"
            disabled={busy || endNote.trim().length < 10}
            onClick={() => {
              if (!window.confirm(`End the referral to ${referral.agency}? They will no longer see this case.`)) return;
              run(() => api.post(`${base}/end`, { reason: endReason, note: endNote }), () => setEndNote(''));
            }}
          >
            End referral
          </button>
        </details>
      )}
    </section>
  );
}

function ReferralsPanel({ report, agencies, agenciesError, isAdmin, onChanged }) {
  const referrals = report.agencyReferrals || [];
  const active = referrals.filter((item) => item.agency && !item.endedAt);
  const ended = referrals.filter((item) => item.agency && item.endedAt);

  const [agency, setAgency] = useState('');
  const [notes, setNotes] = useState('');
  const [referralSummary, setReferralSummary] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [releaseNarrative, setReleaseNarrative] = useState(false);
  const [releaseCategoryDetails, setReleaseCategoryDetails] = useState(false);
  const [releaseEvidenceIds, setReleaseEvidenceIds] = useState([]);
  const [releaseReporterContact, setReleaseReporterContact] = useState(false);
  const [evidenceReviewed, setEvidenceReviewed] = useState(false);
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadRequests = useCallback(() => {
    api.get(`/reports/${report._id}/information-requests`)
      .then((res) => setRequests(res.data.requests || []))
      .catch(() => {});
  }, [report._id]);

  // Agency questions arrive while the reviewer is working, so keep checking.
  useEffect(() => {
    loadRequests();
    const timer = window.setInterval(loadRequests, 30000);
    return () => window.clearInterval(timer);
  }, [loadRequests]);

  // Run an action, then reload the report so every card reflects the change.
  const run = async (action, afterSuccess) => {
    setBusy(true);
    setError('');
    try {
      await action();
      if (afterSuccess) afterSuccess();
      const fresh = await api.get(`/reports/${report._id}`);
      onChanged(fresh.data);
      loadRequests();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRefer = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/reports/${report._id}/refer`, {
        agency,
        notes,
        referralSummary,
        transferConfirmed: confirmed,
        releaseNarrative,
        releaseCategoryDetails,
        releaseEvidenceIds,
        releaseReporterContact,
        evidenceReviewed
      });
      onChanged(res.data);
      setAgency('');
      setNotes('');
      setReferralSummary('');
      setConfirmed(false);
      setReleaseNarrative(false);
      setReleaseCategoryDetails(false);
      setReleaseEvidenceIds([]);
      setReleaseReporterContact(false);
      setEvidenceReviewed(false);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  };

  const referable = agencies.filter((item) => !active.some((referral) => referral.agency === item.name));
  const needsReviewConfirmation = releaseEvidenceIds.length > 0;

  return (
    <div className="kw-referrals-panel">
      <RoutingPanel
        reportId={report._id}
        referralVersion={active.length}
        onPick={(name) => setAgency(name)}
      />

      {error && <div className="error" role="alert">{error}</div>}

      {active.length > 0 && <h4>Agencies handling this case ({active.length})</h4>}
      {active.map((referral) => (
        <ReferralCard
          key={referral._id}
          report={report}
          referral={referral}
          requests={requests.filter((item) => item.referralId === referral._id)}
          isAdmin={isAdmin}
          busy={busy}
          run={run}
        />
      ))}

      <form className="kw-pro-form kw-case-form" onSubmit={handleRefer}>
        <h4>{active.length > 0 ? 'Refer to another agency' : 'Prepare secure agency referral'}</h4>
        <div className="kw-helper">
          Saving delivers this brief to the selected agency's verified Kenya Watch accounts. Proceed only when a formal
          partner agreement and authorised receiving contact are in place. Choose exactly which case material the agency
          needs to investigate — nothing is released unless you tick it, and every file they open is logged. A case with
          several kinds of wrongdoing can be referred to several agencies; each gets its own case file.
        </div>
        <div className="kw-form-section">
          <label htmlFor={`agency-${report._id}`}>Agency</label>
          {agencies.length === 0 && (
            <div className="kw-helper" role={agenciesError ? 'alert' : undefined}>
              {agenciesError || 'No active agency partner account is available. Ask an Admin to complete partner onboarding first.'}
            </div>
          )}
          <select id={`agency-${report._id}`} value={agency} onChange={(e) => setAgency(e.target.value)}>
            <option value="">Select agency...</option>
            {referable.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div className="kw-form-section">
          <label htmlFor={`referral-summary-${report._id}`}>Referral brief (shared with agency, at least 40 characters)</label>
          <textarea id={`referral-summary-${report._id}`} minLength={40} maxLength={5000} value={referralSummary} onChange={(e) => setReferralSummary(e.target.value)} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor={`referral-notes-${report._id}`}>Internal liaison note (not shared with agency)</label>
          <input id={`referral-notes-${report._id}`} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <fieldset className="kw-casefile-release">
          <legend>Case file to release to the agency</legend>
          <div className="kw-helper">
            An investigating officer cannot act on a summary alone. Release only what that institution legally needs and
            is authorised to hold. The reporter's identity is never available to release.
          </div>

          <label className="kw-release-option">
            <input type="checkbox" checked={releaseNarrative} onChange={(e) => setReleaseNarrative(e.target.checked)} />
            <span>
              <strong>The complaint narrative</strong>
              <small>The description the reporter wrote. Needed for almost any real investigation.</small>
            </span>
          </label>

          {Object.keys(report.categorySpecificDetails || {}).length > 0 && (
            <label className="kw-release-option">
              <input type="checkbox" checked={releaseCategoryDetails} onChange={(e) => setReleaseCategoryDetails(e.target.checked)} />
              <span>
                <strong>Category-specific details</strong>
                <small>The structured answers given for this category (figures, officials, dates).</small>
              </span>
            </label>
          )}

          {(report.evidence || []).length > 0 && (
            <div className="kw-release-evidence">
              <strong>Evidence files ({report.evidence.length} attached)</strong>
              <div className="kw-helper">
                Open and review each file first. Every released file is downloadable only by that agency's verified
                officers, and each download is recorded.
              </div>
              {(report.evidence || []).map((item) => (
                <label key={item.id} className="kw-release-option">
                  <input
                    type="checkbox"
                    checked={releaseEvidenceIds.includes(item.id)}
                    onChange={(e) => setReleaseEvidenceIds((current) => (
                      e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                    ))}
                  />
                  <span>
                    <strong>{item.filename}</strong>
                    <small>{item.type} · uploaded {item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : 'earlier'}</small>
                  </span>
                </label>
              ))}
              {needsReviewConfirmation && (
                <label className="kw-release-option">
                  <input type="checkbox" checked={evidenceReviewed} onChange={(e) => setEvidenceReviewed(e.target.checked)} />
                  <span><strong>I have reviewed every file I am releasing and it is relevant to this agency.</strong></span>
                </label>
              )}
            </div>
          )}

          <label className="kw-release-option">
            <input type="checkbox" checked={releaseReporterContact} onChange={(e) => setReleaseReporterContact(e.target.checked)} />
            <span>
              <strong>Ask Kenya Watch to contact the reporter for more information</strong>
              <small>
                Only applies where the reporter is a registered citizen who opted in to being contacted. Kenya Watch
                never passes on identity for anonymous reports — the agency asks us and we follow up.
              </small>
            </span>
          </label>
        </fieldset>

        <div className="kw-form-section">
          <label>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} required />
            I confirmed the official receiving contact, authority to share this material, and that only the minimum information required for follow-up is being released.
          </label>
        </div>
        <button
          type="submit"
          className="kw-btn kw-btn-secondary"
          disabled={
            busy ||
            !agency ||
            !confirmed ||
            referralSummary.trim().length < 40 ||
            agencies.length === 0 ||
            (needsReviewConfirmation && !evidenceReviewed)
          }
        >
          Send Secure Referral
        </button>
      </form>

      {ended.length > 0 && (
        <details>
          <summary>Ended agency referrals ({ended.length})</summary>
          <ul>
            {ended.map((referral) => (
              <li key={referral._id}>
                <b>{referral.agency}</b> — {referral.referenceNumber || 'No agency reference'}; status {referral.status || 'unknown'};{' '}
                {referral.endReason || 'ended'} {referral.endedAt ? new Date(referral.endedAt).toLocaleString() : ''}
                {referral.endNote ? ` — ${referral.endNote}` : ''}
                {referral.agencyUpdates?.length > 0 && (
                  <ul>
                    {referral.agencyUpdates.map((update, index) => (
                      <li key={`${update.createdAt}-${index}`}>{new Date(update.createdAt).toLocaleString()} — {update.note}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default ReferralsPanel;
