import React from "react";
import { Link } from "react-router-dom";

// Plain-language privacy notice for the Kenya Data Protection Act, 2019.
// The Act requires that a person whose data you collect is told, at the point of
// collection, what is collected, why, who receives it, how long it is kept, and
// what rights they have (sections 25–26 and 29–40). This page is that notice.
function Privacy() {
  return (
    <div className="kw-page-card kw-privacy">
      <h2>Privacy notice and your data rights</h2>
      <p className="kw-helper">
        This notice explains how Kenya Watch handles personal data, in line with
        the Kenya Data Protection Act, 2019 and Article 31 of the Constitution.
      </p>

      <h3>What we collect</h3>
      <ul>
        <li>
          <strong>If you report anonymously:</strong> the content of your
          report, its category, county and sub-county, and any files you upload.
          We do <strong>not</strong> collect your name, email, phone number or
          IP-linked identity for the report itself.
        </li>
        <li>
          <strong>If you create an account:</strong> your name, email address
          and a securely hashed password — nothing more.
        </li>
        <li>
          <strong>Optional demographic answers:</strong> age group, gender and
          occupation, which you may skip entirely.
        </li>
        <li>
          <strong>If you apply as a reviewer or agency officer:</strong> the
          details and documents you submit for verification, which are required
          to confirm you are who you say you are.
        </li>
      </ul>

      <h3>Why we hold it</h3>
      <p>
        Report data is held to investigate the corruption you have described and
        to tell you the outcome. Account data is held to let you track your
        reports. Verification data is held to confirm the identity and authority
        of the people who handle cases.
      </p>

      <h3>Who sees what</h3>
      <ul>
        <li>
          <strong>Reviewers</strong> see report content but never who filed it.
        </li>
        <li>
          <strong>Agency officers</strong> see only the case file a reviewer
          explicitly released to them, and only for cases referred to their own
          institution.
        </li>
        <li>
          <strong>The public case list</strong> shows general details only —
          never identity, never the full narrative.
        </li>
        <li>Nothing is sold, and no data is shared for marketing.</li>
      </ul>

      <h3>How long it is kept</h3>
      <p>
        Closed reports are anonymised after a retention period (90 days by
        default), removing anything that could link the case to you. Cases under
        active legal proceedings are placed on legal hold and are not anonymised
        during that time, because evidence must be preserved for court.
      </p>

      <h3>Your rights under the Act</h3>
      <ul>
        <li>
          <strong>To be informed</strong> — this notice.
        </li>
        <li>
          <strong>To access</strong> the personal data we hold about you.
        </li>
        <li>
          <strong>To correction</strong> of inaccurate data.
        </li>
        <li>
          <strong>To erasure</strong> where retention is no longer necessary.
        </li>
        <li>
          <strong>To object</strong> to processing, and to withdraw consent you
          gave.
        </li>
        <li>
          <strong>To complain</strong> to the Office of the Data Protection
          Commissioner.
        </li>
      </ul>
      <p className="kw-helper">
        One honest limit: for a fully anonymous report there is no identity
        stored, so we cannot look up "your" report without the tracking
        reference and access key. That is the point of the design — and it means
        access rights for anonymous reports are exercised through those two
        values, which only you hold.
      </p>

      <h3>Security</h3>
      <p>
        Passwords are hashed, sessions use http-only cookies, evidence files are
        stored with access control, and every agency download of a case file is
        logged. Sensitive actions are rate-limited.
      </p>

      <h3>Contact</h3>
      <p>
        Questions about your data, or a request to exercise a right, go to the
        Kenya Watch administrator. If you are not satisfied with the response
        you may raise it with the Office of the Data Protection Commissioner.
      </p>

      <p>
        <Link to="/">Back to the home page</Link>
      </p>
    </div>
  );
}

export default Privacy;
