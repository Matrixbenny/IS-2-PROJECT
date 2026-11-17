import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function ManageUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [reviewerApplications, setReviewerApplications] = useState([]);
  const [reviewerRejectionReasons, setReviewerRejectionReasons] = useState({});
  const [reviewerDocumentsVerified, setReviewerDocumentsVerified] = useState({});
  const [reviewingApplicationId, setReviewingApplicationId] = useState('');
  const [downloadingDocumentId, setDownloadingDocumentId] = useState('');
  const [agencies, setAgencies] = useState([]);
  const [agencyApplications, setAgencyApplications] = useState([]);
  const [agencyReview, setAgencyReview] = useState({});
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [agencyForm, setAgencyForm] = useState({ name: '', email: '', agencySlug: '', verificationReference: '', identityVerified: false });
  const [setupUrl, setSetupUrl] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [decisionNotice, setDecisionNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const viewedByCurrentAdmin = (document) => Boolean(
    document.viewedBy && document.viewedBy.toString() === String(user?.id || user?._id)
  );

  const load = async () => {
    try {
      const [res, agencyOptions, applications, agencyApps] = await Promise.all([
        api.get('/users'),
        api.get('/users/agency-options'),
        api.get('/users/reviewer-applications'),
        api.get('/users/agency-applications')
      ]);
      setUsers(res.data);
      setAgencies(agencyOptions.data.agencies);
      setReviewerApplications(applications.data);
      setAgencyApplications(agencyApps.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  useEffect(() => {
    if (user && user.role === 'admin') load();
    const timer = window.setInterval(() => {
      if (user && user.role === 'admin') load();
    }, 10000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user || user.role !== 'admin') {
    return <div className="kw-helper">This page is only available to Admins.</div>;
  }

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/users', form);
      setUsers((current) => [res.data, ...current]);
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAgencyDocumentDownload = async (application, document) => {
    setError('');
    setDownloadingDocumentId(document.gridFsId);
    try {
      const response = await api.get(
        `/users/${application._id}/agency-application/documents/${document.gridFsId}`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(response.data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.filename || 'agency-document.pdf';
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      const refreshed = await api.get('/users/agency-applications');
      setAgencyApplications(refreshed.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not download the application document.');
    } finally {
      setDownloadingDocumentId('');
    }
  };

  const handleAgencyDecision = async (application, decision) => {
    setError('');
    setDecisionNotice('');
    const review = agencyReview[application._id] || {};
    setLoading(true);
    try {
      const response = await api.patch(`/users/${application._id}/agency-application`, {
        decision,
        rejectionReason: review.rejectionReason || '',
        verificationReference: review.verificationReference || '',
        identityVerified: review.identityVerified === true,
        verificationSteps: Object.entries(review.steps || {}).map(([key, step]) => ({
          key,
          done: step.done === true,
          note: step.note || ''
        }))
      });
      setDecisionNotice(response.data.message || 'Decision saved.');
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAgencyInvite = async (e) => {
    e.preventDefault();
    setError('');
    setSetupUrl('');
    if (!agencyForm.identityVerified) {
      setError('Confirm the officer identity and agency affiliation before creating an invite.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/users/agency-invitations', agencyForm);
      setUsers((current) => [res.data, ...current]);
      setSetupUrl(res.data.setupUrl);
      setAgencyForm({ name: '', email: '', agencySlug: '', verificationReference: '', identityVerified: false });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewerApplication = async (application, decision) => {
    setError('');
    setDecisionNotice('');
    setReviewingApplicationId(application._id);
    try {
      const response = await api.patch(`/users/${application._id}/reviewer-application`, {
        decision,
        reason: reviewerRejectionReasons[application._id] || '',
        documentsVerified: reviewerDocumentsVerified[application._id] === true
      });
      if (decision === 'approve') {
        setReviewerApplications((current) => current.filter((item) => item._id !== application._id));
        setUsers((current) => [response.data, ...current]);
        const email = response.data.decisionEmail;
        if (email?.status === 'sent') {
          setDecisionNotice(`Approved. The "next steps" email was sent to ${response.data.email}.`);
        } else if (email?.status === 'failed') {
          setError(
            `Approved, but the next-steps email to ${response.data.email} could not be delivered (${email.error}). ` +
            'The reviewer can still sign in with the password they chose.'
          );
        }
      } else {
        setReviewerApplications((current) => current.map((item) => (
          item._id === application._id ? { ...item, ...response.data } : item
        )));
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setReviewingApplicationId('');
    }
  };

  const downloadFilePack = async (account) => {
    setError('');
    try {
      const response = await api.get(`/users/${account._id}/reviewer-file-pack`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${account.name.replace(/[^\w.-]+/g, '-')}-reviewer-documents.zip`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not download the reviewer document pack.');
    }
  };

  const handleReviewerDocumentDownload = async (application, document) => {
    setError('');
    setDownloadingDocumentId(document.gridFsId);
    try {
      const response = await api.get(
        `/users/${application._id}/reviewer-application/documents/${document.gridFsId}`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(response.data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setReviewerApplications((current) => current.map((item) => (
        item._id === application._id
          ? {
            ...item,
            reviewerApplicationDocuments: item.reviewerApplicationDocuments.map((file) => (
              file.gridFsId === document.gridFsId
                ? { ...file, viewedBy: user?.id || user?._id, viewedAt: new Date().toISOString() }
                : file
            ))
          }
          : item
      )));
    } catch (err) {
      setError(err.response?.data?.error || 'Could not download the reviewer application document.');
    } finally {
      setDownloadingDocumentId('');
    }
  };

  const handleRoleChange = async (id, role) => {
    setError('');
    try {
      const res = await api.patch(`/users/${id}/role`, { role });
      setUsers((current) => current.map((item) => item._id === id ? { ...item, ...res.data } : item));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleAgencyActiveChange = async (account, isActive) => {
    setError('');
    try {
      const res = await api.patch(`/users/${account._id}/active`, { isActive });
      setUsers((current) => current.map((item) => item._id === account._id ? { ...item, ...res.data } : item));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleResendAgencyInvite = async (account) => {
    setError('');
    setSetupUrl('');
    try {
      const res = await api.post(`/users/${account._id}/agency-invitation`);
      setSetupUrl(res.data.setupUrl);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleCancelAgencyInvite = async (account) => {
    if (!window.confirm(`Cancel the pending setup invitation for ${account.name}?`)) return;
    setError('');
    try {
      await api.delete(`/users/${account._id}`);
      setUsers((current) => current.filter((item) => item._id !== account._id));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.patch(`/users/${editing.id}`, { name: editing.name, email: editing.email });
      setUsers((current) => current.map((item) => item._id === editing.id ? { ...item, ...res.data } : item));
      setEditing(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDelete = async (account) => {
    if (!window.confirm(`Delete ${account.name}'s account? Their submitted reports will be kept without this account's identifying links.`)) return;
    setError('');
    try {
      await api.delete(`/users/${account._id}`);
      setUsers((current) => current.filter((item) => item._id !== account._id));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <div>
      <h2>Manage Users</h2>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        Agency access is issued to a named person only after their identity, agency affiliation, and official receiving channel have been verified outside Kenya Watch. Agency accounts can access only cases referred to their institution.
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {decisionNotice && <div className="kw-notify-status" role="status">{decisionNotice}</div>}

      <section className="kw-page-card" aria-labelledby="reviewer-applications-heading">
        <h3 id="reviewer-applications-heading">Reviewer applications awaiting approval</h3>
        <p className="kw-helper">
          Applicants cannot sign in or access reports until approved. Open both PDFs and personally check the applicant’s qualifications and document authenticity before approving.
          {' '}Approving sends the applicant an automatic "next steps" email. Their original PDFs are retained on the reviewer record, byte-for-byte, and can be re-opened or downloaded as a pack from All Accounts at any time.
        </p>
        {reviewerApplications.filter((application) => application.reviewerApplicationStatus === 'pending').length === 0
          ? <div className="kw-faded">No reviewer applications are awaiting approval.</div>
          : reviewerApplications.filter((application) => application.reviewerApplicationStatus === 'pending').map((application) => (
            <article className="kw-case-form kw-pro-form" key={application._id}>
              <h4>{application.name}</h4>
              <div><b>Email:</b> {application.email}</div>
              <p><b>Application statement:</b> {application.reviewerApplicationNote}</p>
              <h5>Required supporting documents</h5>
              <ul>
                {application.reviewerApplicationDocuments?.map((document) => (
                  <li key={document.gridFsId}>
                    {document.kind === 'cv' ? 'CV / resume' : 'Qualification / training proof'} — {document.filename}
                    {' '}({Math.ceil(document.size / 1024)} KB){' '}
                    <button
                      type="button"
                      className="kw-btn-secondary"
                      disabled={downloadingDocumentId === document.gridFsId}
                      onClick={() => handleReviewerDocumentDownload(application, document)}
                    >
                      {downloadingDocumentId === document.gridFsId ? 'Opening...' : 'Open PDF'}
                    </button>
                    {viewedByCurrentAdmin(document)
                      ? <span className="kw-helper"> Opened by you</span>
                      : document.viewedBy
                        ? <span className="kw-helper"> Opened by another Admin; open it yourself before approving</span>
                        : null}
                  </li>
                ))}
              </ul>
              <label className="kw-reviewer-documents-confirm">
                <input
                  type="checkbox"
                  checked={reviewerDocumentsVerified[application._id] || false}
                  onChange={(event) => setReviewerDocumentsVerified({
                    ...reviewerDocumentsVerified,
                    [application._id]: event.target.checked
                  })}
                />
                I opened both documents and personally checked their authenticity and relevance.
              </label>
              <div className="kw-form-section">
                <label htmlFor={`reviewer-rejection-${application._id}`}>Reason if rejecting</label>
                <textarea
                  id={`reviewer-rejection-${application._id}`}
                  minLength={10}
                  maxLength={1000}
                  value={reviewerRejectionReasons[application._id] || ''}
                  onChange={(event) => setReviewerRejectionReasons({
                    ...reviewerRejectionReasons,
                    [application._id]: event.target.value
                  })}
                  placeholder="Provide at least 10 characters to reject an application."
                />
              </div>
              <div className="kw-recorder-options">
                <button
                  type="button"
                  disabled={
                    reviewingApplicationId === application._id ||
                    !reviewerDocumentsVerified[application._id] ||
                    !['cv', 'qualification'].every((kind) => application.reviewerApplicationDocuments?.some((document) => document.kind === kind && viewedByCurrentAdmin(document)))
                  }
                  onClick={() => handleReviewerApplication(application, 'approve')}
                >
                  Approve Reviewer
                </button>
                <button
                  type="button"
                  className="kw-btn-secondary"
                  disabled={
                    reviewingApplicationId === application._id ||
                    (reviewerRejectionReasons[application._id] || '').trim().length < 10
                  }
                  onClick={() => handleReviewerApplication(application, 'reject')}
                >
                  Reject application
                </button>
              </div>
            </article>
          ))}
        {reviewerApplications.some((application) => application.role === 'reviewer') && (
          <details>
            <summary>Approved reviewers - retained application documents</summary>
            {reviewerApplications.filter((application) => application.role === 'reviewer').map((application) => (
              <div key={application._id} className="kw-pro-meta">
                <b>{application.name}</b> ({application.email}) —{' '}
                {application.reviewerApplicationDocuments?.length || 0} document(s) kept as submitted{' '}
                {application.reviewerApplicationDocuments?.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="kw-btn-secondary"
                      disabled={downloadingDocumentId === application._id}
                      onClick={() => downloadFilePack(application)}
                    >
                      {downloadingDocumentId === application._id ? 'Preparing…' : 'Download pack (ZIP)'}
                    </button>
                    <ul>
                      {application.reviewerApplicationDocuments.map((document) => (
                        <li key={document.gridFsId}>
                          {document.kind === 'cv' ? 'CV / resume' : 'Qualification / training proof'} —{' '}
                          {document.filename} ({Math.ceil(document.size / 1024)} KB){' '}
                          <button
                            type="button"
                            className="kw-btn-secondary"
                            disabled={downloadingDocumentId === document.gridFsId}
                            onClick={() => handleReviewerDocumentDownload(application, document)}
                          >
                            Open exact PDF
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </details>
        )}
        {reviewerApplications.some((application) => application.reviewerApplicationStatus === 'rejected') && (
          <details>
            <summary>Previously rejected applications</summary>
            {reviewerApplications.filter((application) => application.reviewerApplicationStatus === 'rejected').map((application) => (
              <p key={application._id}>
                {application.name} ({application.email}) — {application.reviewerApplicationRejectionReason}
              </p>
            ))}
          </details>
        )}
      </section>

      <form className="kw-pro-form report-form" onSubmit={handleCreate}>
        <h4 style={{ marginTop: 0 }}>Create Reviewer Account (Admin provisioned)</h4>
        <p className="kw-helper">This directly provisions an account by Admin decision. Other applicants use the separate approval workflow above.</p>
        <div className="kw-form-section">
          <label>Full name</label>
          <input name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label>Email</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} required />
        </div>
        <div className="kw-form-section">
          <label>Password</label>
          <input name="password" type="password" minLength={8} value={form.password} onChange={handleChange} required />
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
      </form>

      <section className="kw-page-card" aria-labelledby="agency-applications-heading">
        <h4 id="agency-applications-heading" style={{ marginTop: 0 }}>Agency Officer Applications</h4>
        <div className="kw-helper" style={{ marginBottom: 12 }}>
          Officers who applied for their own account. Approving grants access to the Agency Case Portal,
          so verify identity, employment and legal authority with the institution first - open both
          documents, then record how you verified the officer.
        </div>
        {agencyApplications.length === 0 && <div className="kw-faded">No agency applications yet.</div>}
        {agencyApplications.map((application) => (
          <article key={application._id} className="kw-application-card">
            <div className="kw-pro-card-row">
              <h5 style={{ margin: 0 }}>{application.name}</h5>
              <span className={`kw-status-badge ${application.agencyApplicationStatus === 'pending' ? 'status-in-review' : application.agencyApplicationStatus === 'approved' ? 'status-resolved' : 'status-rejected'}`}>
                {application.agencyApplicationStatus}
              </span>
            </div>
            <div className="kw-pro-meta"><b>Institution:</b> {agencies.find((a) => a.slug === application.agencySlug)?.name || application.agencySlug}</div>
            <div className="kw-pro-meta"><b>Login email:</b> {application.email}</div>
            <div className="kw-pro-meta"><b>Official work email:</b> {application.agencyApplicationOfficialEmail}</div>
            <div className="kw-pro-meta"><b>Staff number:</b> {application.agencyApplicationStaffNumber}</div>
            <div className="kw-pro-meta"><b>Job title:</b> {application.agencyApplicationJobTitle}</div>
            <div className="kw-pro-meta"><b>Duty station:</b> {application.agencyApplicationDutyStation}</div>
            <div className="kw-pro-meta"><b>Role in handling referrals:</b> {application.agencyApplicationJustification}</div>
            <ul>
              {(application.agencyApplicationDocuments || []).map((document) => (
                <li key={document.gridFsId}>
                  {document.kind === 'authorisation_letter' ? 'Institutional authorisation letter' : 'Staff identity document'} —{' '}
                  {document.filename} ({Math.ceil(document.size / 1024)} KB){' '}
                  <button
                    type="button"
                    className="kw-btn-secondary"
                    disabled={downloadingDocumentId === document.gridFsId}
                    onClick={() => handleAgencyDocumentDownload(application, document)}
                  >
                    Open exact PDF
                  </button>
                  {document.viewedAt && <div className="kw-helper">Opened by an Admin {new Date(document.viewedAt).toLocaleString()}</div>}
                </li>
              ))}
            </ul>

            {/* Document screening results — automatic authenticity indicators */}
            {(application.agencyApplicationScreening || []).length > 0 && (
              <div className="kw-screening-box">
                <b>Document screening (automatic):</b>
                <ul>
                  {(application.agencyApplicationScreening || []).map((doc) => (
                    <li key={doc.kind}>
                      <b>{doc.kind === 'authorisation_letter' ? 'Authorisation letter' : 'Staff ID'}</b> —
                      {' '}{doc.pageCount || '?'} page(s), {doc.imageBased ? 'image-only (consistent with a scan)' : 'has text layer'}
                      {doc.producer ? `, produced by "${doc.producer}"` : ', no producer metadata'}
                      {doc.digitallySigned ? ', digitally signed' : ''}
                      {doc.encrypted ? ', ENCRYPTED (content not inspectable)' : ''}
                      <ul className="kw-screening-flags">
                        {(doc.flags || []).map((flag, i) => (
                          <li key={i} className={`kw-flag-${flag.level}`}>{flag.message}</li>
                        ))}
                        <li className="kw-helper">SHA-256: {doc.fingerprint?.slice(0, 16)}…</li>
                      </ul>
                    </li>
                  ))}
                </ul>
                <div className="kw-helper">
                  Screening is an indicator, not proof. A clean scan can still be a forged letter — the checklist below is what establishes authenticity.
                </div>
              </div>
            )}

            {application.agencyApplicationStatus === 'pending' && (
              <div className="kw-application-actions">
                <div className="kw-verification-checklist">
                  <b>Kenya public-service verification checklist</b> — every step must be completed
                  through an official channel before approval. Record how you did each check.
                  <div className="kw-helper" style={{ marginTop: 4 }}>
                    Tip: never rely on phone numbers or email addresses the applicant gave you — use the
                    institution's published switchboard or liaison contacts (website, official directory).
                  </div>
                  {[
                    ['institution_contact', 'Reached the institution via its official switchboard/published liaison contact (not applicant-provided details)'],
                    ['employment_confirmed', 'HR/registry confirms: employed, correct job title, correct duty station'],
                    ['staff_number_checked', 'Staff/service number matches institutional records'],
                    ['authorisation_letter_confirmed', 'Signatory/registry confirms the authorisation letter is genuine and currently valid'],
                    ['identity_document_checked', 'Staff ID compared against institutional records (photo, name, number)'],
                    ['official_email_confirmed', 'Work email confirmed to exist on the institutional domain (contacted the officer through it)'],
                    ['authority_scope_confirmed', 'Role legally permits receiving third-party corruption case information (e.g. investigator, authorised liaison)']
                  ].map(([key, label]) => (
                    <div key={key} className="kw-check-item">
                      <label className="kw-notify-choice">
                        <input
                          type="checkbox"
                          checked={agencyReview[application._id]?.steps?.[key]?.done === true}
                          onChange={(e) => setAgencyReview({
                            ...agencyReview,
                            [application._id]: {
                              ...agencyReview[application._id],
                              steps: {
                                ...(agencyReview[application._id]?.steps || {}),
                                [key]: { done: e.target.checked, note: agencyReview[application._id]?.steps?.[key]?.note || '' }
                              }
                            }
                          })}
                        />
                        <span>{label}</span>
                      </label>
                      <input
                        aria-label={`How you did this check: ${label}`}
                        placeholder="How did you confirm this? (reference, name of person spoken to, date…)"
                        value={agencyReview[application._id]?.steps?.[key]?.note || ''}
                        onChange={(e) => setAgencyReview({
                          ...agencyReview,
                          [application._id]: {
                            ...agencyReview[application._id],
                            steps: {
                              ...(agencyReview[application._id]?.steps || {}),
                              [key]: { done: agencyReview[application._id]?.steps?.[key]?.done === true, note: e.target.value }
                            }
                          }
                        })}
                      />
                    </div>
                  ))}
                </div>
                <div className="kw-form-section">
                  <label htmlFor={`agency-verify-ref-${application._id}`}>Verification reference</label>
                  <input
                    id={`agency-verify-ref-${application._id}`}
                    maxLength={200}
                    value={agencyReview[application._id]?.verificationReference || ''}
                    onChange={(e) => setAgencyReview({ ...agencyReview, [application._id]: { ...agencyReview[application._id], verificationReference: e.target.value } })}
                  />
                  <div className="kw-helper">How you confirmed the officer with the institution, e.g. an officer verification form reference or liaison call record.</div>
                </div>
                <label className="kw-notify-choice">
                  <input
                    type="checkbox"
                    checked={agencyReview[application._id]?.identityVerified === true}
                    onChange={(e) => setAgencyReview({ ...agencyReview, [application._id]: { ...agencyReview[application._id], identityVerified: e.target.checked } })}
                  />
                  <span>
                    <strong>I verified this officer's identity, employment and legal authority through an official channel.</strong>
                  </span>
                </label>
                <div className="kw-form-section">
                  <label htmlFor={`agency-reject-${application._id}`}>Reason if rejecting</label>
                  <input
                    id={`agency-reject-${application._id}`}
                    value={agencyReview[application._id]?.rejectionReason || ''}
                    onChange={(e) => setAgencyReview({ ...agencyReview, [application._id]: { ...agencyReview[application._id], rejectionReason: e.target.value } })}
                  />
                  <div className="kw-helper">Required to reject (at least 10 characters). The officer is told the reason.</div>
                </div>
                <button type="button" disabled={loading} onClick={() => handleAgencyDecision(application, 'approved')}>Approve and activate</button>
                <button type="button" className="kw-btn-secondary" disabled={loading} onClick={() => handleAgencyDecision(application, 'rejected')}>Reject application</button>
              </div>
            )}
            {application.agencyApplicationStatus === 'approved' && (
              <div className="kw-claim-notice">
                Approved and active. Verification: {application.agencyVerificationReference}
              </div>
            )}
            {application.agencyApplicationStatus === 'rejected' && (
              <div className="kw-helper">Rejected: {application.agencyApplicationRejectionReason}</div>
            )}
          </article>
        ))}
      </section>

      <form className="kw-pro-form report-form" onSubmit={handleAgencyInvite}>
        <h4 style={{ marginTop: 0 }}>Invite an Agency Case Officer</h4>
        <div className="kw-helper">The one-time setup link expires in 24 hours. Share it only with the verified officer through the agency's approved contact channel.</div>
        <div className="kw-form-section">
          <label htmlFor="agency-officer-name">Officer name</label>
          <input id="agency-officer-name" value={agencyForm.name} onChange={(e) => setAgencyForm({ ...agencyForm, name: e.target.value })} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="agency-officer-email">Official email</label>
          <input id="agency-officer-email" type="email" value={agencyForm.email} onChange={(e) => setAgencyForm({ ...agencyForm, email: e.target.value })} required />
        </div>
        <div className="kw-form-section">
          <label htmlFor="agency-officer-agency">Agency</label>
          <select id="agency-officer-agency" value={agencyForm.agencySlug} onChange={(e) => setAgencyForm({ ...agencyForm, agencySlug: e.target.value })} required>
            <option value="">Select agency...</option>
            {agencies.map((agency) => <option key={agency.slug} value={agency.slug}>{agency.name}</option>)}
          </select>
        </div>
        <div className="kw-form-section">
          <label htmlFor="agency-verification-reference">Identity/affiliation verification reference</label>
          <input id="agency-verification-reference" maxLength={200} value={agencyForm.verificationReference} onChange={(e) => setAgencyForm({ ...agencyForm, verificationReference: e.target.value })} required />
          <div className="kw-helper">For example, a liaison validation record or official directory reference. Do not enter passwords or sensitive personal data.</div>
        </div>
        <div className="kw-form-section">
          <label>
            <input type="checkbox" checked={agencyForm.identityVerified} onChange={(e) => setAgencyForm({ ...agencyForm, identityVerified: e.target.checked })} required />
            I personally confirmed this officer and their agency affiliation through an official channel.
          </label>
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Creating invite...' : 'Create One-Time Invite'}</button>
        {setupUrl && (
          <div className="kw-page-card" role="status">
            <p>Select and copy this one-time setup link, then deliver it through the verified institutional channel. It will not be shown again:</p>
            <input aria-label="One-time agency account setup link" readOnly value={setupUrl} onFocus={(e) => e.target.select()} />
          </div>
        )}
      </form>

      <div className="kw-page-card">
        <h4 style={{ marginTop: 0 }}>All Accounts</h4>
        {loading && <div role="status">Saving account...</div>}
        {users.length === 0 && <div className="kw-faded">No accounts found.</div>}
        <table className="kw-users-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role / agency</th><th>Account status</th><th>Manage</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td>{editing?.id === u._id ? (
                  <input aria-label={`Name for ${u.email}`} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                ) : u.name}</td>
                <td>{editing?.id === u._id ? (
                  <input aria-label={`Email for ${u.name}`} type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                ) : u.email}</td>
                <td>
                  {u.role}{u.agencySlug && <div>{agencies.find((agency) => agency.slug === u.agencySlug)?.name || u.agencySlug}</div>}
                  {u.reviewerApplicationDocuments?.length > 0 && (
                    <div className="kw-helper">
                      {u.reviewerApplicationDocuments.length} application document(s) on file
                    </div>
                  )}
                </td>
                <td>{u.role === 'agency'
                  ? (u.agencyInvitationAcceptedAt ? (u.isActive ? 'Active' : 'Deactivated') : 'Invitation pending')
                  : 'Active'}</td>
                <td>
                  {u.role === 'admin' ? (
                    <span className="kw-helper">Protected Admin account</span>
                  ) : u.role === 'agency' ? (
                    <>
                      <span className="kw-helper">Verified: {u.agencyVerificationReference}</span>
                      {u.agencyInvitationAcceptedAt ? (
                        <button type="button" onClick={() => handleAgencyActiveChange(u, !u.isActive)}>
                          {u.isActive ? 'Deactivate access' : 'Reactivate access'}
                        </button>
                      ) : (
                        <>
                          <button type="button" onClick={() => handleResendAgencyInvite(u)}>Issue new setup link</button>
                          <button type="button" onClick={() => handleCancelAgencyInvite(u)}>Cancel invitation</button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <select value={u.role} onChange={(e) => handleRoleChange(u._id, e.target.value)}>
                        <option value="user">user</option>
                        <option value="reviewer">reviewer</option>
                      </select>
                      {editing?.id === u._id ? (
                        <>
                          <button type="button" onClick={handleProfileSave}>Save</button>
                          <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setEditing({ id: u._id, name: u.name, email: u.email })}>Edit</button>
                      )}
                      {u.reviewerApplicationDocuments?.length > 0 && (
                        <button type="button" onClick={() => downloadFilePack(u)}>Download documents</button>
                      )}
                      <button type="button" onClick={() => handleDelete(u)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ManageUsers;
