import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import EvidenceDownloads from '../components/EvidenceDownloads';
import usePolling from '../hooks/usePolling';

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}
function urgencyClass(urgency) {
  return `kw-urgency-badge kw-urgency-${(urgency || 'low').toLowerCase()}`;
}

const STATUSES = ['Received', 'In Review', 'Resolved', 'Rejected'];

function CaseDetail({ report, agencies, agenciesError, onChanged, isAdmin }) {
  const [status, setStatus] = useState(report.status);
  const [resolutionNote, setResolutionNote] = useState(report.resolutionNote || '');
  const [resolutionReference, setResolutionReference] = useState(report.resolutionReference || '');
  const [rejectionReason, setRejectionReason] = useState(report.rejectionReason || '');
  const [agency, setAgency] = useState(report.agencyReferral?.agency || report.suggestedAgency || '');
  const [notes, setNotes] = useState(report.agencyReferral?.notes || '');
  const [referralSummary, setReferralSummary] = useState('');
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  // Case file packet - every item defaults to NOT released.
  const [releaseNarrative, setReleaseNarrative] = useState(false);
  const [releaseCategoryDetails, setReleaseCategoryDetails] = useState(false);
  const [releaseEvidenceIds, setReleaseEvidenceIds] = useState([]);
  const [releaseReporterContact, setReleaseReporterContact] = useState(false);
  const [informationRequests, setInformationRequests] = useState([]);
  const [answerDrafts, setAnswerDrafts] = useState({});

  // Agency questions arrive while the reviewer is working, so poll them.
  const loadInformationRequests = () => {
    api.get(`/reports/${report._id}/information-requests`)
      .then((res) => setInformationRequests(res.data.requests || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadInformationRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report._id]);

  const submitAnswer = async (requestId) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/reports/${report._id}/information-requests/${requestId}/answer`, {
        answer: answerDrafts[requestId] || ''
      });
      setAnswerDrafts({ ...answerDrafts, [requestId]: '' });
      loadInformationRequests();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [mlSuggestion, setMlSuggestion] = useState(null);
  const [mlSuggestionError, setMlSuggestionError] = useState('');
  const [mlSuggestionLoading, setMlSuggestionLoading] = useState(false);
  const [categoryReview, setCategoryReview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [reviewDecision, setReviewDecision] = useState('category');
  const [reviewCategory, setReviewCategory] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [adjudicationDecision, setAdjudicationDecision] = useState('category');
  const [adjudicationCategory, setAdjudicationCategory] = useState('');
  const [adjudicationNote, setAdjudicationNote] = useState('');

  useEffect(() => {
    if (categoryReview?.ownDecision !== 'category') {
      setSuggestions([]);
      setSuggestionsError('');
      setMlSuggestion(null);
      setMlSuggestionError('');
      return;
    }
    setSuggestionsLoading(true);
    setSuggestionsError('');
    api.get(`/reports/${report._id}/related-suggestions`)
      .then((res) => setSuggestions(res.data))
      .catch((err) => setSuggestionsError(err.response?.data?.error || 'Could not load related-case suggestions.'))
      .finally(() => setSuggestionsLoading(false));
  }, [categoryReview?.ownDecision, report._id]);

  useEffect(() => {
    if (categoryReview?.ownDecision !== 'category') {
      setMlSuggestion(null);
      setMlSuggestionError('');
      return;
    }
    setMlSuggestionLoading(true);
    setMlSuggestionError('');
    api.get(`/reports/${report._id}/ml-category-suggestion`)
      .then((res) => setMlSuggestion(res.data))
      .catch((err) => setMlSuggestionError(err.response?.data?.error || 'Could not load the experimental model suggestion.'))
      .finally(() => setMlSuggestionLoading(false));
  }, [categoryReview?.ownDecision, report._id]);

  useEffect(() => {
    Promise.all([
      api.get(`/reports/${report._id}/category-review`),
      api.get('/reports/categories')
    ]).then(([reviewResponse, categoryResponse]) => {
      setCategoryReview(reviewResponse.data);
      setCategories(categoryResponse.data.categories);
    }).catch((err) => setError(err.response?.data?.error || 'Could not load the independent category-review workflow.'));
  }, [report._id]);

  const refreshAfterCategoryReview = async () => {
    const [reviewResponse, reportResponse] = await Promise.all([
      api.get(`/reports/${report._id}/category-review`),
      api.get(`/reports/${report._id}`)
    ]);
    setCategoryReview(reviewResponse.data);
    onChanged(reportResponse.data);
  };

  const handleCategoryAnnotation = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/reports/${report._id}/category-review/annotations`, {
        decision: reviewDecision,
        ...(reviewDecision === 'category' ? { category: reviewCategory } : {}),
        note: reviewNote
      });
      setReviewDecision('category');
      setReviewCategory('');
      setReviewNote('');
      await refreshAfterCategoryReview();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCategoryAdjudication = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(`/reports/${report._id}/category-review/adjudication`, {
        decision: adjudicationDecision,
        ...(adjudicationDecision === 'category' ? { category: adjudicationCategory } : {}),
        note: adjudicationNote
      });
      setAdjudicationDecision('category');
      setAdjudicationCategory('');
      setAdjudicationNote('');
      await refreshAfterCategoryReview();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

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

  const handleLegalHoldToggle = async (e) => {
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/reports/${report._id}/legal-hold`, { legalHold: e.target.checked });
      onChanged(res.data);
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
      const res = await api.patch(`/reports/${report._id}/status`, { status, resolutionNote, resolutionReference, rejectionReason });
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
      const res = await api.post(`/reports/${report._id}/refer`, {
        agency,
        notes,
        referralSummary,
        transferConfirmed,
        releaseNarrative,
        releaseCategoryDetails,
        releaseEvidenceIds,
        releaseReporterContact
      });
      onChanged(res.data);
      setReferralSummary('');
      setTransferConfirmed(false);
      setReleaseNarrative(false);
      setReleaseCategoryDetails(false);
      setReleaseEvidenceIds([]);
      setReleaseReporterContact(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  const handlePublicMessageReview = async (updateId, decision) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/agency-portal/cases/${report._id}/updates/${updateId}/review`, { decision });
      const res = await api.get(`/reports/${report._id}`);
      onChanged(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    const confirmed = window.confirm(
      'Archive this report? It will disappear from active views, but its audit history and evidence will be retained.'
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      await api.delete(`/reports/${report._id}`);
      onChanged({ _id: report._id, archived: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setBusy(false);
  };

  if (report.isOwnReport) {
    return (
      <div className="kw-case-detail">
        <div className="kw-own-case-notice" role="status">
          <strong>This is your own report.</strong>
          {' '}A reviewer cannot claim, label, refer or resolve a case they submitted. Another reviewer or the Admin will handle it.
          You can still follow it from <b>My Reports</b> if you submitted it with your citizen account.
        </div>
        <div className="kw-pro-meta"><b>Description:</b> {report.description}</div>
        <div className="kw-pro-meta"><b>Location:</b> {report.subCounty}, {report.county}</div>
        <div className="kw-pro-meta"><b>Status:</b> <span className={`kw-status-badge ${statusClass(report.status)}`}>{report.status}</span></div>
      </div>
    );
  }

  return (
    <div className="kw-case-detail">
      <div className="kw-pro-meta"><b>Description:</b> {report.description}</div>
      {report.classification?.lingoTerms?.length > 0 && (
        <div className="kw-lingo-hint">
          <b>Language signals:</b> {report.classification.lingoTerms.join(', ')}
          <span className="kw-faded"> - Sheng/Kiswahili/dialect terms recognised by the keyword triage. A hint only, not a finding.</span>
        </div>
      )}
      {Object.keys(report.categorySpecificDetails || {}).length > 0 && (
        <div className="kw-pro-meta"><b>Category details:</b> {JSON.stringify(report.categorySpecificDetails)}</div>
      )}
      {categoryReview?.ownAnnotationSubmitted ? (
        <>
          <div className="kw-pro-meta"><b>Reporter-selected category:</b> {report.reportedCategory}</div>
          <div className="kw-pro-meta">
            <b>Current triage aid:</b> {report.classification?.category || 'Not available'}{' '}
            {report.classification?.urgency && <span className={urgencyClass(report.classification.urgency)}>{report.classification.urgency}</span>}
          </div>
        </>
      ) : (
        <div className="kw-helper">Reporter-selected category and existing classifier output are hidden until you submit an independent category review.</div>
      )}
      <section className="kw-pro-form kw-case-form" aria-labelledby={`independent-review-${report._id}`}>
        <h4 id={`independent-review-${report._id}`}>Independent category review for ML evaluation</h4>
        <p className="kw-helper">
          Classify the alleged conduct described in the report; this is not a finding that wrongdoing occurred.
          Before you submit, the reporter's chosen category and current classifier output are hidden to reduce anchoring.
          The first two labels are private from each other. Agreement becomes a candidate adjudicated label; disagreement requires an Admin decision.
        </p>
        {categoryReview ? (
          <p className="kw-pro-meta">
            <b>Review progress:</b> {categoryReview.annotationCount}/2 independent labels · {categoryReview.status.replaceAll('_', ' ')}
            {categoryReview.ownDecision === 'category' && categoryReview.ownCategory && <> · Your assessment: {categoryReview.ownCategory}</>}
            {categoryReview.ownDecision === 'insufficient_information' && <> · Your assessment: Insufficient information</>}
            {categoryReview.adjudicatedDecision === 'category' && categoryReview.adjudicatedCategory && <> · Final reviewed label: {categoryReview.adjudicatedCategory}</>}
            {categoryReview.adjudicatedDecision === 'insufficient_information' && <> · Final outcome: Insufficient information; excluded from category training</>}
          </p>
        ) : <p className="kw-helper" role="status">Loading category-review status…</p>}
        {categoryReview?.status === 'awaiting_second_review' && !categoryReview.ownAnnotationSubmitted && (
          <form className="kw-pro-form" onSubmit={handleCategoryAnnotation}>
            <div className="kw-form-section">
              <label htmlFor={`ml-decision-${report._id}`}>Your independent assessment</label>
              <select
                id={`ml-decision-${report._id}`}
                value={reviewDecision}
                onChange={(event) => {
                  setReviewDecision(event.target.value);
                  setReviewCategory('');
                  setReviewNote('');
                }}
              >
                <option value="category">I can identify a category</option>
                <option value="insufficient_information">Insufficient information to classify</option>
              </select>
            </div>
            {reviewDecision === 'category' && (
              <div className="kw-form-section">
                <label htmlFor={`ml-category-${report._id}`}>Category of the alleged conduct</label>
                <select id={`ml-category-${report._id}`} value={reviewCategory} onChange={(event) => setReviewCategory(event.target.value)} required>
                  <option value="">Select a category…</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            )}
            <div className="kw-form-section">
              <label htmlFor={`ml-category-note-${report._id}`}>
                {reviewDecision === 'insufficient_information' ? 'What information is missing or unclear? (required)' : 'Optional short rationale (do not include identity details)'}
              </label>
              <textarea id={`ml-category-note-${report._id}`} maxLength={1000} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
            </div>
            <button
              type="submit"
              className="kw-btn kw-btn-secondary"
              disabled={busy || (reviewDecision === 'category' && !reviewCategory) || (reviewDecision === 'insufficient_information' && !reviewNote.trim())}
            >
              Submit independent assessment
            </button>
          </form>
        )}
        {isAdmin && categoryReview?.status === 'needs_adjudication' && (
          <form className="kw-pro-form" onSubmit={handleCategoryAdjudication}>
            <p>Independent reviewers' assessments are shown below. Resolve the disagreement or decide that the available information is insufficient; document the reason.</p>
            <ul>
              {categoryReview.proposedAnnotations.map((annotation, index) => (
                <li key={`${annotation.decision}-${annotation.category || 'insufficient'}-${index}`}>
                  {annotation.decision === 'insufficient_information' ? 'Insufficient information' : annotation.category}
                  {annotation.note ? ` — ${annotation.note}` : ' — no rationale provided'}
                </li>
              ))}
            </ul>
            <div className="kw-form-section">
              <label htmlFor={`adjudication-decision-${report._id}`}>Admin outcome</label>
              <select
                id={`adjudication-decision-${report._id}`}
                value={adjudicationDecision}
                onChange={(event) => {
                  setAdjudicationDecision(event.target.value);
                  setAdjudicationCategory('');
                }}
              >
                <option value="category">Assign a category</option>
                <option value="insufficient_information">Insufficient information to classify</option>
              </select>
            </div>
            {adjudicationDecision === 'category' && (
              <div className="kw-form-section">
                <label htmlFor={`adjudicated-category-${report._id}`}>Adjudicated category</label>
                <select id={`adjudicated-category-${report._id}`} value={adjudicationCategory} onChange={(event) => setAdjudicationCategory(event.target.value)} required>
                  <option value="">Select a category…</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            )}
            <div className="kw-form-section">
              <label htmlFor={`adjudication-note-${report._id}`}>Adjudication reason</label>
              <textarea id={`adjudication-note-${report._id}`} maxLength={1000} value={adjudicationNote} onChange={(event) => setAdjudicationNote(event.target.value)} required />
            </div>
            <button type="submit" className="kw-btn kw-btn-secondary" disabled={busy || (adjudicationDecision === 'category' && !adjudicationCategory)}>Record adjudication</button>
          </form>
        )}
      </section>
      <div className="kw-pro-meta"><b>Reporter:</b> {report.hasAccount ? 'Registered reporter' : 'Anonymous'}</div>
      <div className="kw-pro-meta"><b>Claimed by:</b> {report.claimedBy ? 'Claimed' : <span className="kw-faded">Unclaimed</span>}</div>
      <div className="kw-pro-meta"><b>Evidence:</b> {report.evidence.length > 0 ? `${report.evidence.length} file(s)` : 'None'}</div>
      <EvidenceDownloads reportId={report._id} evidence={report.evidence} />
      {isAdmin && (
        <div className="kw-pro-meta">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!report.legalHold} onChange={handleLegalHoldToggle} disabled={busy} />
            Under active legal hold (exempt from identity anonymization)
          </label>
          {report.legalHold && <div className="kw-helper">Remove the legal hold before archiving this report.</div>}
          <button type="button" className="kw-btn kw-btn-secondary" onClick={handleArchive} disabled={busy || report.legalHold}>
            Archive Report
          </button>
        </div>
      )}

      {!report.claimedBy && (
        <button type="button" className="kw-btn" onClick={handleClaim} disabled={busy}>
          {busy ? 'Claiming...' : 'Claim This Case'}
        </button>
      )}
      {report.claimedBy && (
        <div className="kw-claim-notice" role="status">
          Claimed and now <strong>In Review</strong>. The reporter is shown that the case has been
          received and is under review.
        </div>
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
        {status === 'Rejected' && (
          <div className="kw-form-section">
            <label>Reason shown to the reporter<span className="kw-required">*</span></label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              required
              minLength={10}
              placeholder="Plain-language explanation the reporter will see, e.g. the report needs specifics we cannot verify - please re-submit with the exact office, date and amount."
            />
            <div className="kw-helper">A rejection always tells the reporter why - never a silent dead end.</div>
          </div>
        )}
        <button type="submit" className="kw-btn" disabled={busy}>Save Status</button>
      </form>

      <form className="kw-pro-form kw-case-form" onSubmit={handleRefer}>
        <h4>Prepare secure agency referral</h4>
        <div className="kw-helper">
          Saving delivers this brief to the selected agency's verified Kenya Watch accounts. Proceed only when a formal
          partner agreement and authorised receiving contact are in place. Below, choose exactly which case material the
          agency needs to investigate — nothing is released unless you tick it, and every file they open is logged.
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
            {agencies.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
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
            <input
              type="checkbox"
              checked={releaseNarrative}
              onChange={(e) => setReleaseNarrative(e.target.checked)}
            />
            <span>
              <strong>The complaint narrative</strong>
              <small>The description the reporter wrote. Needed for almost any real investigation.</small>
            </span>
          </label>

          {Object.keys(report.categorySpecificDetails || {}).length > 0 && (
            <label className="kw-release-option">
              <input
                type="checkbox"
                checked={releaseCategoryDetails}
                onChange={(e) => setReleaseCategoryDetails(e.target.checked)}
              />
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
                Every released file is downloadable only by that agency's verified officers, and each download is recorded.
              </div>
              {(report.evidence || []).map((item) => (
                <label key={item.id} className="kw-release-option">
                  <input
                    type="checkbox"
                    checked={releaseEvidenceIds.includes(item.id)}
                    onChange={(e) => setReleaseEvidenceIds((current) => (
                      e.target.checked
                        ? [...current, item.id]
                        : current.filter((id) => id !== item.id)
                    ))}
                  />
                  <span>
                    <strong>{item.filename}</strong>
                    <small>{item.type} · uploaded {item.uploadedAt ? new Date(item.uploadedAt).toLocaleDateString() : 'earlier'}</small>
                  </span>
                </label>
              ))}
            </div>
          )}

          <label className="kw-release-option">
            <input
              type="checkbox"
              checked={releaseReporterContact}
              onChange={(e) => setReleaseReporterContact(e.target.checked)}
            />
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
            <input type="checkbox" checked={transferConfirmed} onChange={(e) => setTransferConfirmed(e.target.checked)} required />
            I confirmed the official receiving contact, authority to share this material, and that only the minimum information required for follow-up is being released.
          </label>
        </div>
        {agency === report.agencyReferral?.agency && report.agencyReferral?.referralSummary && (
          <div className="kw-helper">This case is already assigned to this agency. Select a different approved recipient only when a formal transfer is required.</div>
        )}
        {agency === report.agencyReferral?.agency && !report.agencyReferral?.referralSummary && (
          <div className="kw-helper">This is a legacy referral without a structured sharing brief. Submitting a reviewed brief will archive the old handoff in history and create a secure portal referral.</div>
        )}
        <button
          type="submit"
          className="kw-btn kw-btn-secondary"
          disabled={
            busy ||
            !agency ||
            !transferConfirmed ||
            referralSummary.trim().length < 40 ||
            agencies.length === 0 ||
            (agency === report.agencyReferral?.agency && !!report.agencyReferral?.referralSummary)
          }
        >
          {agency === report.agencyReferral?.agency && !report.agencyReferral?.referralSummary ? 'Create Structured Referral' : 'Send Secure Referral'}
        </button>
      </form>

      {informationRequests.length > 0 && (
        <div className="kw-info-requests" aria-label="Questions from the receiving agency">
          <h4>Questions from {report.agencyReferral?.agency || 'the agency'}</h4>
          <div className="kw-helper">
            The investigating officer needs more information to proceed. Your answer goes back to that agency's
            portal only — it is never published to the public case list.
          </div>
          {informationRequests.map((request) => (
            <article key={request._id} className="kw-info-request">
              <div className="kw-info-question">{request.question}</div>
              <div className="kw-helper">
                Asked by {request.requestedByEmail} · {new Date(request.requestedAt).toLocaleString()}
              </div>
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
                    value={answerDrafts[request._id] || ''}
                    onChange={(e) => setAnswerDrafts({ ...answerDrafts, [request._id]: e.target.value })}
                  />
                  <button
                    type="button"
                    className="kw-btn kw-btn-secondary"
                    disabled={busy || (answerDrafts[request._id] || '').trim().length < 5}
                    onClick={() => submitAnswer(request._id)}
                  >
                    Send answer to agency
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {report.agencyReferral?.agency && (
        <section className="kw-case-form kw-pro-form" aria-label="Current agency handoff">
          <h4>Current agency handoff</h4>
          <div className="kw-pro-meta"><b>Agency:</b> {report.agencyReferral.agency}</div>
          <div className="kw-pro-meta"><b>Recorded:</b> {report.agencyReferral.referredAt ? new Date(report.agencyReferral.referredAt).toLocaleString() : 'Date not recorded'}</div>
          <div className="kw-pro-meta"><b>Referral status:</b> {(report.agencyReferral.status || 'sent').replaceAll('_', ' ')}</div>
          <div className="kw-pro-meta"><b>Shared brief:</b> {report.agencyReferral.referralSummary || 'Not recorded'}</div>
          <div className="kw-pro-meta"><b>Agency reference:</b> {report.agencyReferral.referenceNumber || 'Not yet provided'}</div>
          <div className="kw-pro-meta"><b>Internal liaison note:</b> {report.agencyReferral.notes || 'None'}</div>
          <div className="kw-pro-meta"><b>Agency updates:</b> {report.agencyReferral.agencyUpdates?.length || 0}</div>
          {report.agencyReferral.agencyUpdates?.map((update, index) => (
            <div className="kw-pro-meta" key={`${update.createdAt}-${index}`}>
              <b>{update.createdByName || 'Agency officer'}</b> · {new Date(update.createdAt).toLocaleString()} · {(update.status || 'update').replaceAll('_', ' ')}
              <div>{update.note}</div>
              {update.publicMessage && (
                <div className="kw-pro-form">
                  <b>Proposed reporter message</b> ({update.publicMessageStatus})
                  <div>{update.publicMessage}</div>
                  {isAdmin && update.publicMessageStatus === 'pending' && (
                    <>
                      <button type="button" className="kw-btn kw-btn-secondary" disabled={busy} onClick={() => handlePublicMessageReview(update._id, 'approved')}>Approve for reporter</button>
                      <button type="button" className="kw-btn kw-btn-secondary" disabled={busy} onClick={() => handlePublicMessageReview(update._id, 'rejected')}>Reject</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {report.agencyReferral.previousReferrals?.length > 0 && (
            <details>
              <summary>Previous agency handoffs ({report.agencyReferral.previousReferrals.length})</summary>
              <ul>
                {report.agencyReferral.previousReferrals.map((referral, index) => (
                  <li key={`${referral.agency}-${referral.endedAt}-${index}`}>
                    <b>{referral.agency}</b> — {referral.referenceNumber || 'No agency reference'}; status {referral.status || 'unknown'}; ended{' '}
                    {referral.endedAt ? new Date(referral.endedAt).toLocaleString() : 'date not recorded'}
                    {referral.agencyUpdates?.length > 0 && (
                      <ul>
                        {referral.agencyUpdates.map((update, updateIndex) => (
                          <li key={`${update.createdAt}-${updateIndex}`}>
                            {new Date(update.createdAt).toLocaleString()} — {update.note}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {categoryReview?.ownDecision === 'category' && (
        <section className="kw-case-form kw-pro-form" aria-label="Experimental ML category suggestion">
          <h4>Experimental ML category suggestion</h4>
          <div className="kw-helper">
            This separate model has not been validated for real-world performance. It does not set the report category or urgency; your assessment remains your own.
          </div>
          {mlSuggestionLoading && <div className="kw-helper" role="status">Generating an experimental suggestion…</div>}
          {mlSuggestionError && <div className="error" role="alert">{mlSuggestionError}</div>}
          {mlSuggestion && (
            <div className="kw-pro-meta">
              <b>Model suggestion only:</b> {mlSuggestion.suggestion}
              <div><b>Training data:</b> {mlSuggestion.trainingDataStatus === 'synthetic_only_not_for_real_world_validation_or_production_training' ? 'Synthetic examples only' : 'Not validated for real-world performance'}</div>
              <div className="kw-faded">{mlSuggestion.warning}</div>
              <div className="kw-faded">Model version: {mlSuggestion.modelVersion}</div>
            </div>
          )}
        </section>
      )}

      <div className="kw-case-form kw-pro-form">
        <h4>Possible Related Reports</h4>
        <div className="kw-helper">
          TF-IDF text similarity ranks recent reports in the same county. Similarity is a lexical matching score, not a probability or confirmation that two reports describe the same incident. Review each case yourself; suggestions never merge or link reports automatically.
        </div>
        {report.relatedCaseLinks && report.relatedCaseLinks.length > 0 && (
          <div className="kw-pro-meta"><b>Already linked:</b> {report.relatedCaseLinks.length} case(s)</div>
        )}
        {!categoryReview?.ownAnnotationSubmitted && (
          <div className="kw-helper">Submit your independent category label before viewing related-case suggestions.</div>
        )}
        {categoryReview?.ownDecision === 'insufficient_information' && (
          <div className="kw-helper">Related-case suggestions are unavailable because you could not identify a category from the report.</div>
        )}
        {categoryReview?.ownDecision === 'category' && suggestionsLoading && <div className="kw-helper" role="status">Searching for textually similar reports in this county…</div>}
        {suggestionsError && <div className="error" role="alert">{suggestionsError}</div>}
        {categoryReview?.ownDecision === 'category' && !suggestionsLoading && !suggestionsError && suggestions.length === 0 && (
          <div className="kw-faded">No reports passed the minimum text-similarity threshold in this county.</div>
        )}
        {suggestions.map((s) => (
          <div className="kw-pro-meta" key={s.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>{s.title} - {s.subCounty}</span>
              <span className="kw-tracking-chip">Text match: {s.similarityPercent}%</span>
            </div>
            {s.sharedTerms?.length > 0 && (
              <div className="kw-faded">
                Shared terms: {s.sharedTerms.join(', ')}
                {s.lingoMatched && <span className="kw-lingo-chip">matched via Sheng/Kiswahili term</span>}
              </div>
            )}
            <button type="button" className="kw-btn-secondary kw-btn" style={{ marginTop: 8, padding: '5px 12px', fontSize: '0.82rem' }} onClick={() => handleLink(s.id)} disabled={busy}>Link after review</button>
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}

function ReviewerQueue() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // "queue" = every case awaiting review; "mine" = only what this reviewer claimed.
  const [view, setView] = useState('queue');
  const [reports, setReports] = useState([]);
  const [myClaims, setMyClaims] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [agenciesError, setAgenciesError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/reports/queue').then((res) => setReports(res.data)).catch((err) => setError(err.response?.data?.error || err.message));
    api.get('/reports/my-claimed')
      .then((res) => setMyClaims(res.data))
      .catch((err) => setError(err.response?.data?.error || err.message));
    api.get('/reports/agencies')
      .then((res) => {
        setAgencies(res.data.agencies);
        setAgenciesError('');
      })
      .catch((err) => setAgenciesError(err.response?.data?.error || 'Could not load approved agency partners.'));
  };

  useEffect(() => {
    if (user && ['reviewer', 'admin'].includes(user.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  usePolling(load);

  useEffect(() => {
    const focusReportId = location.state?.focusReportId;
    if (!focusReportId || !reports.some((report) => report._id === focusReportId)) return;
    setSelectedId(focusReportId);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, reports]);

  if (!user || !['reviewer', 'admin'].includes(user.role)) {
    return <div className="kw-helper">This page is only available to Reviewers and Admins.</div>;
  }

  const handleChanged = (updated) => {
    const remove = (list) => (updated.archived ? list.filter((r) => r._id !== updated._id) : list.map((r) => (r._id === updated._id ? updated : r)));
    if (updated.archived) setSelectedId(null);
    setReports(remove);
    // A case shows in "My claimed" the moment it is claimed, and leaves once it
    // is resolved or rejected (the default list hides closed cases).
    const isMine = updated.claimedByMe === true || updated.claimedBy;
    const stillOpen = ['Received', 'In Review'].includes(updated.status) && !updated.archived;
    setMyClaims((current) => {
      const exists = current.some((r) => r._id === updated._id);
      if (exists) {
        if (!stillOpen || !isMine) return current.filter((r) => r._id !== updated._id);
        return current.map((r) => (r._id === updated._id ? updated : r));
      }
      if (!isMine || !stillOpen) return current;
      return [updated, ...current];
    });
  };

  const visible = view === 'mine' ? myClaims : reports;

  return (
    <div>
      <h2>Reviewer Queue</h2>
      <section className="kw-role-separation" aria-label="Internal reviewer workspace">
        <h3>Kenya Watch internal review workspace</h3>
        <p>
          Reviewers assess incoming reports and manage Kenya Watch case status. Agency officers use a separate portal and can see only the limited referral brief sent to their assigned agency; they do not use this queue.
        </p>
        <a href={new URL('/agency-portal/', api.defaults?.baseURL || 'http://localhost:5000/api').toString()}>
          Open the separate Agency Case Portal
        </a>
      </section>
      {error && <div className="error">{error}</div>}

      <div className="kw-queue-tabs" role="tablist" aria-label="Reviewer case views">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'queue'}
          className={`kw-queue-tab ${view === 'queue' ? 'active' : ''}`}
          onClick={() => { setView('queue'); setSelectedId(null); }}
        >
          Review queue <span className="kw-queue-tab-count">{reports.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'mine'}
          className={`kw-queue-tab ${view === 'mine' ? 'active' : ''}`}
          onClick={() => { setView('mine'); setSelectedId(null); }}
        >
          My claimed cases <span className="kw-queue-tab-count">{myClaims.length}</span>
        </button>
      </div>

      {view === 'mine' && myClaims.length === 0 && (
        <div className="kw-empty-state">
          <span role="img" aria-label="no claimed cases" className="kw-empty-emoji">📂</span>
          <div>You have not claimed any cases yet. Open a case in the Review queue and click "Claim This Case".</div>
        </div>
      )}

      <div className="reports-list">
        {visible.map((r) => (
          <div className="report-card kw-pro-card" key={r._id} id={`report-${r._id}`}>
            <div className="kw-pro-card-row">
              <h3>{r.title}</h3>
              <span className={`kw-status-badge ${statusClass(r.status)}`}>{r.status}</span>
            </div>
            <div className="kw-pro-meta"><span className="kw-tracking-chip">{r.trackingReference}</span></div>
            {r.reportedCategory ? (
              <div className="kw-pro-meta"><b>Reporter category:</b> {r.reportedCategory}{' '}
                {r.classification?.urgency && <span className={urgencyClass(r.classification.urgency)}>{r.classification.urgency}</span>}
              </div>
            ) : (
              <div className="kw-pro-meta">Independent category review pending</div>
            )}
            <div className="kw-pro-meta"><b>Location:</b> {r.subCounty}, {r.county}</div>
            {r.isOwnReport && (
              <div className="kw-own-case-badge">Your own report - another reviewer must handle this</div>
            )}
            {r.openInformationRequests > 0 && (
              <div className="kw-own-case-badge" role="status">
                {r.agencyReferral?.agency || 'The receiving agency'} is waiting for your answer
                ({r.openInformationRequests} open {r.openInformationRequests === 1 ? 'question' : 'questions'}). Open the case to reply.
              </div>
            )}
            {r.claimedByMe && (
              <span className="kw-claim-badge kw-claim-mine">Claimed by you</span>
            )}
            {r.claimedByOther && (
              <span className="kw-claim-badge kw-claim-other">Claimed by another reviewer</span>
            )}
            <button type="button" className="kw-btn kw-btn-secondary" onClick={() => setSelectedId(selectedId === r._id ? null : r._id)}>
              {selectedId === r._id ? 'Close' : 'Open Case'}
            </button>
            {selectedId === r._id && <CaseDetail report={r} agencies={agencies} agenciesError={agenciesError} onChanged={handleChanged} isAdmin={user.role === 'admin'} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ReviewerQueue;
