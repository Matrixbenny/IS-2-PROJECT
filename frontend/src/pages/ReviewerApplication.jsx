import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PasswordField, { STRONG_PASSWORD_PATTERN } from '../components/PasswordField';
import api from '../api';

function ReviewerApplication() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    applicationNote: '',
    cv: null,
    qualification: null
  });
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const application = new FormData();
      application.append('name', form.name);
      application.append('email', form.email);
      application.append('password', form.password);
      application.append('applicationNote', form.applicationNote);
      application.append('cv', form.cv);
      application.append('qualification', form.qualification);
      await api.post('/auth/reviewer-application', application);
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Could not submit your reviewer application.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <section className="kw-auth-card" aria-labelledby="reviewer-application-submitted">
        <h2 id="reviewer-application-submitted">Application sent to Admin</h2>
        <div className="kw-reviewer-app-note" role="status">
          <strong>Your application is pending.</strong> You cannot sign in as a Reviewer yet —
          an Admin must verify your documents and approve you first. Keep this email handy;
          once approved, sign in on the main site and your Reviewer tools will unlock automatically.
        </div>
        <Link to="/login">Return to sign in</Link>
      </section>
    );
  }

  return (
    <section className="kw-auth-card" aria-labelledby="reviewer-application-heading">
      <h2 id="reviewer-application-heading">Apply to become a Reviewer</h2>
      <div className="kw-reviewer-app-note" role="note">
        <strong>How reviewer onboarding works:</strong> submit this application → Admin verifies your documents →
        Admin approves → <em>then</em> you can sign in with reviewer access. Pending applications cannot sign in
        and cannot see any reports.
      </div>
      <div className="kw-role-separation">
        Reviewer applications and supporting documents are sent to the Kenya Watch Admin for manual review. Submitting an application does not grant access to reports. Upload PDF files only; do not upload national ID or police-clearance documents.
      </div>
      <form className="report-form" onSubmit={handleSubmit}>
        <div className="kw-form-section">
          <label htmlFor="reviewer-app-name">Full name</label>
          <input
            id="reviewer-app-name"
            name="name"
            autoComplete="name"
            maxLength={120}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </div>
        <div className="kw-form-section">
          <label htmlFor="reviewer-app-email">Email</label>
          <input
            id="reviewer-app-email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
        </div>
        <PasswordField
          id="reviewer-app-password"
          label="Choose a password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          autoComplete="new-password"
          minLength={8}
          pattern={STRONG_PASSWORD_PATTERN}
          title="At least 8 characters, including a letter, a number and a special character."
        />
        <div className="kw-form-section">
          <label htmlFor="reviewer-app-note">Why would you like to review reports?</label>
          <textarea
            id="reviewer-app-note"
            name="applicationNote"
            minLength={30}
            maxLength={1000}
            value={form.applicationNote}
            onChange={(event) => setForm({ ...form, applicationNote: event.target.value })}
            required
          />
          <div className="kw-helper">Please write 30–1000 characters. Do not include passwords or sensitive personal information.</div>
        </div>
        <div className="kw-form-section">
          <label htmlFor="reviewer-app-cv">CV or resume (PDF, max 10 MB)</label>
          <input
            id="reviewer-app-cv"
            name="cv"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setForm({ ...form, cv: event.target.files?.[0] || null })}
            required
          />
        </div>
        <div className="kw-form-section">
          <label htmlFor="reviewer-app-qualification">Proof of relevant qualification or training (PDF, max 10 MB)</label>
          <input
            id="reviewer-app-qualification"
            name="qualification"
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => setForm({ ...form, qualification: event.target.files?.[0] || null })}
            required
          />
        </div>
        <p className="kw-helper">
          The Admin can view these documents only while the application is pending. They are deleted from file storage when the Admin approves or rejects the application.
        </p>
        <button type="submit" disabled={loading}>{loading ? 'Sending application...' : 'Send to Admin for approval'}</button>
        {error && <div className="error" role="alert">{error}</div>}
      </form>
      <div className="kw-auth-switch">Already have an account? <Link to="/login">Sign in</Link></div>
    </section>
  );
}

export default ReviewerApplication;
