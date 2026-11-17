import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import PasswordField, {
  STRONG_PASSWORD_PATTERN,
} from "../components/PasswordField";

// Agency officers self-register here, but nothing is granted automatically.
// The account stays inactive until a Kenya Watch Admin verifies - through an
// official channel - the applicant's identity, employment and legal authority
// to receive referrals. The documents below are the evidence that check needs.
function AgencyApplication() {
  const [agencies, setAgencies] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    agencySlug: "",
    staffNumber: "",
    jobTitle: "",
    dutyStation: "",
    officialEmail: "",
    justification: "",
    declaration: false,
    authorisationLetter: null,
    staffId: null,
  });
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .get("/reports/agency-partners")
      .then((res) => setAgencies(res.data.agencies || []))
      .catch((err) =>
        setError(
          err.response?.data?.error ||
            "Could not load the approved institution list.",
        ),
      );
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setForm({
      ...form,
      [name]:
        type === "checkbox" ? checked : type === "file" ? files[0] : value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.authorisationLetter || !form.staffId) {
      setError(
        "Attach both the institutional authorisation letter and your staff identity document.",
      );
      return;
    }
    setLoading(true);
    try {
      const payload = new FormData();
      [
        "name",
        "email",
        "password",
        "agencySlug",
        "staffNumber",
        "jobTitle",
        "dutyStation",
        "officialEmail",
        "justification",
      ].forEach((key) => payload.append(key, form[key]));
      payload.append("declaration", String(form.declaration));
      payload.append("authorisationLetter", form.authorisationLetter);
      payload.append("staffId", form.staffId);
      await api.post("/auth/agency-application", payload);
      setSubmitted(true);
    } catch (err) {
      setError(
        err.response?.data?.error || "Could not submit the agency application.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="kw-auth-card">
        <h2>Application submitted</h2>
        <div className="kw-success-panel" role="status">
          <span className="kw-claimed-tick" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>
              Thank you. Your agency officer application is now with the Kenya
              Watch team.
            </strong>
            <p>
              A Kenya Watch Admin will verify your identity, your employment
              with the institution you named, and your authority to receive case
              referrals. Verification is done through an official channel with
              the institution. You will be emailed once a decision is made, and
              you cannot sign in until the application is approved.
            </p>
          </div>
        </div>
        <div className="kw-auth-switch">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="kw-auth-card kw-agency-application">
      <h2>Apply for an Agency Case Officer account</h2>
      <div className="kw-helper" style={{ marginBottom: 16 }}>
        This account is for officers of an authorised institution who handle
        cases referred by Kenya Watch. Applications are verified by an Admin
        before any access is granted.
      </div>

      <form className="report-form" onSubmit={handleSubmit}>
        <fieldset className="kw-form-section">
          <legend>Your details</legend>
          <label htmlFor="name">
            Full name as it appears on your staff record
          </label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            maxLength={120}
          />

          <label htmlFor="email">Email you will sign in with</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            required
          />

          <label htmlFor="officialEmail">
            Official work email issued by your institution
          </label>
          <input
            id="officialEmail"
            name="officialEmail"
            type="email"
            value={form.officialEmail}
            onChange={handleChange}
            required
          />
          <div className="kw-helper">
            This must be your institutional address, not a personal one - it is
            used to confirm your affiliation. It may be the same as the email you sign in with.
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={handleChange}
            autoComplete="new-password"
            minLength={8}
            pattern={STRONG_PASSWORD_PATTERN}
            title="At least 8 characters, including a letter, a number and a special character."
          />
          <div className="kw-helper">
            At least 8 characters, including a letter, a number and a special
            character.
          </div>
        </fieldset>

        <fieldset className="kw-form-section">
          <legend>Your institution</legend>
          <label htmlFor="agencySlug">Institution</label>
          <select
            id="agencySlug"
            name="agencySlug"
            value={form.agencySlug}
            onChange={handleChange}
            required
          >
            <option value="">Select your institution...</option>
            {agencies.map((agency) => (
              <option key={agency.slug} value={agency.slug}>
                {agency.name}
              </option>
            ))}
          </select>

          <label htmlFor="staffNumber">Staff or service number</label>
          <input
            id="staffNumber"
            name="staffNumber"
            value={form.staffNumber}
            onChange={handleChange}
            required
            minLength={3}
            maxLength={40}
          />

          <label htmlFor="jobTitle">Official job title</label>
          <input
            id="jobTitle"
            name="jobTitle"
            value={form.jobTitle}
            onChange={handleChange}
            required
            minLength={3}
            maxLength={120}
          />

          <label htmlFor="dutyStation">Duty station or office</label>
          <input
            id="dutyStation"
            name="dutyStation"
            value={form.dutyStation}
            onChange={handleChange}
            required
            minLength={3}
            maxLength={160}
          />
        </fieldset>

        <fieldset className="kw-form-section">
          <legend>Supporting documents (PDF)</legend>
          <label htmlFor="authorisationLetter">
            Institutional authorisation letter
          </label>
          <input
            id="authorisationLetter"
            name="authorisationLetter"
            type="file"
            accept="application/pdf"
            onChange={handleChange}
            required
          />
          <div className="kw-helper">
            A letter on your institution's letterhead naming you and confirming
            that you may receive and handle corruption case referrals. 10 MB
            maximum.
          </div>

          <label htmlFor="staffId">Staff identity document</label>
          <input
            id="staffId"
            name="staffId"
            type="file"
            accept="application/pdf"
            onChange={handleChange}
            required
          />
          <div className="kw-helper">
            A scan of your institutional staff identification. Only what is
            needed is stored; do not upload unrelated personal records. 10 MB
            maximum.
          </div>
        </fieldset>

        <fieldset className="kw-form-section">
          <legend>Your role</legend>
          <label htmlFor="justification">
            How will you use referred cases?
          </label>
          <textarea
            id="justification"
            name="justification"
            value={form.justification}
            onChange={handleChange}
            required
            minLength={30}
            maxLength={1200}
            rows={4}
          />
          <div className="kw-helper">
            30-1200 characters. Describe your official role in receiving and
            following up these cases.
          </div>

          <label className="kw-notify-choice" htmlFor="declaration">
            <input
              id="declaration"
              name="declaration"
              type="checkbox"
              checked={form.declaration}
              onChange={handleChange}
              required
            />
            <span>
              <strong>
                I confirm that I am authorised by my institution to receive and
                handle referred cases for official purposes.
              </strong>
              <small>
                Referred cases contain limited but sensitive information. I will
                use it only for the official purpose for which it was shared,
                and I understand that access is logged and can be withdrawn.
              </small>
            </span>
          </label>
        </fieldset>

        <button type="submit" disabled={loading}>
          {loading
            ? "Submitting application..."
            : "Submit application for verification"}
        </button>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </form>

      <div className="kw-auth-switch">
        Already approved? <Link to="/login">Sign in</Link>
      </div>
      <div className="kw-auth-switch">
        Not an agency officer?{" "}
        <Link to="/register">Create a citizen account</Link> or{" "}
        <Link to="/reviewer-application">apply as a Reviewer</Link>
      </div>
    </div>
  );
}

export default AgencyApplication;
