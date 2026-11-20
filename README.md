# Kenya Watch

A web platform prototype for anonymous reporting and tracking of corruption cases in Kenya, with keyword-based triage, reviewer-facing TF-IDF related-report suggestions, and a synthetic-trained ML category suggestion shown to reviewers only after their independent assessment. Final year Information Systems project (BBT4300), Strathmore University, School of Computing and Engineering Sciences.

Citizens can report corruption without an account (Path A, tracked via a **Tracking Reference + secret Access Key**) or through an optional account (Path B, with a private "My Reports" view). Reviewers triage reports, which can be referred through the prototype's agency workflow, and track outcomes. Path A is not linked to a reporter account, but narrative details and original evidence may still reveal a person's identity.

See [Docs/my IS story.md](Docs/my%20IS%20story.md) for the full set of 30 researched, legally-grounded design decisions behind this system.

## Features
- Anonymous (Path A) or optional-account (Path B) corruption reporting, with category-specific fields grounded in the Anti-Corruption and Economic Crimes Act
- Evidence upload (images/video/audio/documents) via MongoDB GridFS; original bytes are retained and malware-signature scanned
- Optional live audio/video recording during report submission, with recording segments saved to GridFS while recording
- Installable Progressive Web App (PWA) for supported browsers; the offline shell does not cache API or report data
- Tracking Reference + Access Key capability-based case tracking for anonymous reporters, with a general/deep visibility split
- Asynchronous keyword-based category and urgency triage suggestions; after a reviewer submits an independent label, the queue can show an explicitly experimental synthetic-trained ML category suggestion and TF-IDF text similarity ranks possible same-county related reports, with human judgement required
- Reviewer Queue: claim cases, update status (resolution requires a note + reference), refer to an Agency/Institution, link related cases; Admins can archive reports without destroying the audit record or evidence
- Admin overview with live report, workflow, account, and escalation counts plus an urgency-ranked list of unclaimed cases; account management, archived-report controls, and data-retention/anonymization tooling
- One configured Admin identity: Admin access is limited to `ADMIN_EMAIL`, and its salted password hash is kept only in the ignored local `.env` (never in MongoDB); public registration and account-management APIs cannot create, promote, reassign, or delete that Admin account
- Reviewer access is approval-gated: applicants submit a statement, CV/resume, and proof of relevant qualification/training as PDFs; they cannot sign in or access reports while pending. Admins open the documents, attest to their manual authenticity/relevance check, and approve or reject applications in Manage Users. Submitted PDFs are deleted from storage after either decision; national ID and police-clearance documents are not requested. Admins can also directly provision reviewers
- Routing aid: suggests which institution(s) should receive a case from the reporter's category, any extra wrongdoing types they flag, the narrative keywords and (only after the reviewer records their own independent category) the experimental model. A mixed case (for example bribery plus forgery) is recommended to more than one agency; prosecutors are suggested only as a later step. The reviewer always decides, and the suggestion versus the decision is recorded so the aid can be measured
- Multi-agency referrals: a case can be referred to several institutions at once, each with its own case file, status and outcome. The report resolves only when every active referral has closed
- Agency case portal with named, agency-scoped accounts; reviewer-prepared referral briefs plus an optional, item-by-item released case file (narrative, details, reviewed evidence); an auditable acknowledgement, information-request and follow-up lifecycle; Admin-reviewed reporter messages; and recorded outcomes that reach the citizen
- Admin oversight of the justice loop: stalled referrals (unacknowledged for 72 hours or idle for 14 days), unanswered agency questions, reporter-message moderation, and reopening a referral closed in error
- Citizen dashboard with a case-journey tracker, charts and a masked, faceless profile picture (every account on the platform uses the same symbol of anonymity; no photos are ever shown or stored)
- Password reset by emailed single-use link, and password change for signed-in users; either one signs out every other session. Agency officers reset and change passwords inside their own portal
- Kenyan-language handling: Sheng/Kiswahili/dialect glossary that reviewers extend and an Admin approves, plus licence-verified corpora and a robustness benchmark (see [ml/LINGO.md](ml/LINGO.md))
- Public statistics page (aggregate-only) and a role-restricted Agency Case Portal
- English/Kiswahili language toggle
- Security: helmet security headers, rate limiting, a self-hosted CAPTCHA for anonymous submissions, bcrypt password hashing, httpOnly JWT cookie auth

## Tech Stack
- **Backend**: Node.js, Express, MongoDB + Mongoose (with GridFS for evidence), JWT auth, Nodemailer
- **Frontend**: React 19 (Vite), React Router
- **Testing**: Node's built-in test runner (`node:test`) + Supertest for the backend; Vitest + React Testing Library for the frontend
- **ML experiments**: Isolated workflow in [`ml/`](ml/README.md), with [data-source guidance](ml/DATA_SOURCES.md); private datasets and trained artifacts are excluded from Git

## Prerequisites
- Node.js 20.19+ and npm
- MongoDB Community Server (tested with a standalone `mongod`, not a replica set)

## Getting Started

### 1. Start MongoDB
This project connects to MongoDB on port **27017**, using the `kenya_watch` database. Make sure your MongoDB service is running on that port. Do not start a second `mongod` process on port 27017 if another MongoDB instance is already using it.

### 2. Backend
```powershell
cd backend
npm install
```
Create a local `.env` from the example and adjust it as needed:
```powershell
Copy-Item .env.example .env
```
`ADMIN_EMAIL` is the one allowed Admin identity; it is reserved from public registration. Admin password hashes are kept in the ignored local `.env`, not in MongoDB. Do not commit credentials or expose the demo server to a shared or internet-accessible network.
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/kenya_watch
JWT_SECRET=<replace-with-a-long-random-string-before-any-real-deployment>
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=<the single Admin account email>
ADMIN_PASSWORD_HASH=<generated by scripts/set-admin-password.js>
FRONTEND_ORIGIN=http://localhost:3000
NODE_ENV=development
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your sender Gmail address>
SMTP_PASS=<Google App Password>
MAIL_FROM="Kenya Watch <your sender Gmail address>"
```
To send mail from Gmail, enable 2-Step Verification on the account and create a Google App Password. Put that App Password in `SMTP_PASS` in the ignored local `.env` or a deployment secret store; never share or commit it. The Gmail account's App Password is not the same as its normal sign-in password. Email delivery must be tested after configuring this. For local-only Ethereal email testing, set `MAIL_LOG_PREVIEW_URL=true` only in a private development environment; preview URLs grant access to messages. See [`backend/.env.example`](backend/.env.example) for configuration keys.
Run the server:
```powershell
npm start
```
The API is now available at `http://localhost:5000`. The Agency Case Portal is served at `http://localhost:5000/agency-portal/`.

Configure the Admin password without storing it in MongoDB. In an interactive terminal, run the hidden-input setup script; it stores only a salted bcrypt hash in the ignored `backend/.env` file and removes the password field from the existing Admin record:
```powershell
node scripts/set-admin-password.js
```
Choose a new, unique Admin password when prompted; input is hidden. The Admin login password is compared against `ADMIN_PASSWORD_HASH` and is not stored in MongoDB. For a fresh database with no Admin record, first run this script, then create the record using the email in `ADMIN_EMAIL`:
```powershell
node scripts/bootstrap-admin.js "Full Name" "<the ADMIN_EMAIL address>"
```
Restart the backend after changing the local `.env`. Sign in with the configured Admin email and the password entered at the hidden prompt. Do not put that password in a command, source file, or message.

### 3. Frontend
```powershell
cd frontend
npm install
npm start
```
The app opens at `http://localhost:3000` (Vite dev server).

### Try the Agency workflow locally
Use synthetic test data only. Sign in as Admin, open **Manage users**, and create a test agency officer using a test email and a verification reference clearly marked as test data. Copy the one-time setup link, set that account's password, and sign in at `http://localhost:5000/agency-portal/`. The agency will appear as an available referral destination only after the officer has activated their account. From the Reviewer Queue, prepare and send a minimum-data referral brief; the portal can then acknowledge and update it. Use the Admin overview and the report's private tracking view to follow the response and approve a proposed reporter message.

### Local demo accounts
For manual testing convenience, these non-Admin accounts may be seeded locally (synthetic data, dev only):

| Role | Email | Password |
|---|---|---|
| Reviewer | `amina@example.com` | `ReviewerPass123!` |
| Agency officer (EACC) | `agencyofficer@kenyawatch.local` | `AgencyPass123!` |

The Admin password is configured locally and is not a shared demo credential. The agency officer signs in at the **Agency Case Portal** (`http://localhost:5000/agency-portal/`); the others sign in through the React app at `http://localhost:3000`. `backend/scripts/set-password.js <email> <newPassword>` can reset non-Admin account passwords, and `backend/scripts/peek-report.js <trackingReference>` prints a quick database-side view of a case for debugging.

### Reviewer applications
Applicants select **Apply to become a Reviewer** from the public registration page and submit their name, email, chosen password, a short statement, a CV/resume, and proof of relevant qualification or training. Supporting documents must be valid PDFs no larger than 10 MB each; national ID and police-clearance documents are not requested. The application is not a signed-in account: its credentials remain inaccessible while pending, and the applicant cannot open the Reviewer Queue. An Admin opens both documents in **Manage Users**, confirms they personally checked authenticity and relevance, then approves the applicant to activate Reviewer access or rejects with a recorded reason. The API prevents approval until the same Admin has opened both files and attested to checking them. Uploaded PDFs are deleted from storage after either decision; the Admin identity and time of the review are retained for approved accounts. Rejected applicants may submit a new application with replacement PDFs. Applications are visible in the Admin-only panel, which refreshes periodically; no email notification is configured. Applicants should not upload national ID or police-clearance documents. This local demonstration is not an approved production document-retention or secure hosting service.

### Install the app
In a supported browser, open the website and use the browser's **Install app** option (or the in-app install prompt when available). The PWA requires HTTPS outside localhost. Its service worker caches only the public application shell and static assets; API responses, submitted reports, and evidence are not cached. Recording requires camera/microphone permission and HTTPS or localhost. Recordings are limited to 10 minutes or 100 MB and must be attached to a report within two hours.

### Accessibility
The interface includes keyboard skip navigation, visible focus styles, semantic landmarks, reduced-motion support, and screen-reader announcements for recording/upload status. Accessibility improvements target WCAG 2.2 AA practices; the project has not undergone a formal conformance audit.

### Why accessibility matters to this project
Kenya Watch exists to serve every citizen affected by corruption, so the platform is built to be usable regardless of ability: it is fully keyboard-operable with a visible focus indicator, screen-reader compatible (semantic landmarks, labeled controls, live-region announcements for errors and confirmations, text alternatives behind visual charts), zoom-safe for low-vision users, and honors the operating-system reduced-motion preference. The Accessibility section above lists the implemented features.

## Deployment

In production one Docker container serves the API, the built app and the Agency Case Portal from a single HTTPS address, with MongoDB hosted separately. [`DEPLOYMENT.md`](DEPLOYMENT.md) gives the step-by-step setup for Render and MongoDB Atlas; `render.yaml` and the `Dockerfile` are ready to use.

## Running Tests

### Backend
Uses Node's built-in test runner against a dedicated `kenya_watch_test` database on the same local MongoDB instance (make sure `mongod` is running first):
```powershell
cd backend
npm test
```

### Frontend
```powershell
cd frontend
npm test
```

## Maintenance Scripts (backend/scripts/)
Reports stored with the older single-referral shape are converted to multi-agency referrals automatically when the server starts (idempotent; earlier transfers are kept as ended referrals).

- `set-admin-password.js` — hidden prompt to store the Admin bcrypt hash in the ignored backend `.env` and unset any Admin password in MongoDB
- `bootstrap-admin.js "Name" "email"` — one-time Admin account creation without a database password; requires `ADMIN_PASSWORD_HASH`
- `anonymize-expired.js [retentionDays=90]` — severs the identity link on long-resolved Path B reports past the retention window (skips cases flagged under legal hold); the server also runs this itself once a day (window set by `RETENTION_DAYS`), so the privacy promise does not depend on someone remembering
- `set-password.js <email> <newPassword>` — reset any local account's password (dev convenience)
- `peek-report.js <trackingReference>` — quick database-side view of a case for debugging
- `set-admin-password-noninteractive.js <password>` — non-interactive variant of the Admin password setup, for scripted local setup only (the password is visible in shell history)
- `generate-vapid-keys.js` — generates the VAPID key pair for Web Push phone alerts
- `evaluate-classifier.js` — reports the keyword classifier's agreement with human-reviewed category labels on live cases
- `scripts/lingo-tools.js classify` — prints the live keyword classifier's category for each report passed on stdin, so the ML workspace measures the shipped rule rather than a copy of it

## What happens to a report

Kenya Watch does not deliver justice itself; the institutions with the legal mandate do. The platform's job is to get each case to them with a lawful, well-prepared file, and to make sure the case cannot quietly disappear.

1. **Received.** The citizen gets a Tracking Reference and Access Key (or finds it in My Reports). The narrative is triaged for category and urgency; a human decides everything that matters.
2. **Reviewed.** A trained reviewer claims the case, records an independent category, and sees routing suggestions. Reviewers decide which institution(s) get it and exactly what each may see.
3. **Referred.** One or several institutions receive an individually verified, audited referral. Evidence goes only after the reviewer confirms they reviewed it.
4. **Worked by the authorities.** The officer's decisions are theirs: a reviewer cannot resolve the case over them, withdraw it, or take material back once they have acted (only an Admin can, with a record). An officer who finds a case outside their mandate returns it with a reason and it is re-routed.
5. **Outcome recorded.** Closing requires a recorded decision, the institution's file reference and a plain-language summary. If charges are filed the case is placed under legal hold automatically so court evidence survives.
6. **Citizen informed.** The citizen sees each institution's progress and outcome. When every institution has closed, the report resolves. A closure made in error can be reopened by an Admin.
7. **Accountability.** Officers are emailed (reference only, never case details) when a case is referred to them. Referrals not acknowledged in 72 hours or idle for 14 days surface to the Admin, and the agency's officers are reminded by email every 7 days until they act (thresholds in `backend/.env.example`). Unanswered agency questions and returned cases also surface to the Admin. The public Statistics page publishes each institution's response rate, time to respond and outcomes once it has handled at least five referrals.

What the platform cannot do: compel an institution to act. Without a formal partnership with EACC, DCI, ODPP and others, that depends on their goodwill and the transparency above. A real deployment needs that agreement and an independent security review first (see the deployment boundary below).

## Agency Case Workflow

The workflow connects the three actors without granting an agency general access to the reporting database:

1. **Reporter:** A person submits anonymously or through an account and keeps a tracking reference/access key (or uses My Reports). Their name/account link, original narrative, and uploaded evidence are not sent to an agency by the referral workflow.
2. **Kenya Watch reviewer:** A Reviewer assesses and claims a case, records an independent category, and then sees the routing aid's suggestions. For each institution they choose, they prepare a purpose-limited referral brief and explicitly confirm the recipient and sharing authority. They also choose what that institution may investigate: the complaint narrative, structured details and individual evidence files. Evidence is released only after the reviewer confirms they reviewed it. The reporter's identity is never releasable. Reviewer liaison notes stay internal. A case with several kinds of wrongdoing can be referred to several institutions; each gets its own case file. A wrong referral can be ended (kept as history), and what an agency may see can be widened or narrowed later, for example when it asks for another file.
3. **Agency officer:** An individually named account sees only active referrals for its assigned institution, with the brief, location and whatever case file was released to it. Opening a released case file and every evidence download is logged against the officer. The officer acknowledges a case, moves it through constrained states (under review, information requested, action taken, closed), records an agency file number and internal note, asks Kenya Watch for more information, and can propose a reporter-facing update. Closing requires a recorded decision, the institution's file reference and a plain-language summary (plus legal basis where charges were filed). Officers see the names of other institutions holding the same case so they can coordinate, but nothing from those files.
4. **Kenya Watch Admin:** The Admin provisions the named officer only after verifying identity and affiliation through an official channel, recording a verification reference. The Admin shares a one-time setup link (expires in 24 hours) over the institution's approved channel and can deactivate the account. Pending reporter messages appear on the Admin overview and must be approved before publication.
5. **Reporter follow-up:** The report's owner or anonymous reporter sees each institution's referral status, only Admin-approved messages, and the outcome each institution recorded. When every active referral has closed, the report moves to Resolved with those outcomes. If an Admin reopens a referral closed in error or on new facts, the report returns to In Review and the earlier outcome stays in the audit history.

### Important deployment boundary

This is an operational, role-scoped workflow **inside Kenya Watch**, not a live connection or partnership with EACC, DCI, or another public institution. Agency names and category mappings are routing suggestions, not official endorsements or jurisdiction decisions. No government identity provider, agency API, email/SMS delivery, formal data-sharing agreement, or secure external transfer protocol is configured. The Admin must not invite real agency staff or send real case data until the institution has formally approved the relationship, legal basis, receiving process, data fields, retention, incident response, and named liaison.

Agency officers, reviewers and the Admin sign in with a password plus a 6-digit code emailed to them (on by default in production, `MFA_REQUIRED`), accounts lock for 15 minutes after five wrong passwords, and the server refuses to start in production with a weak `JWT_SECRET`, no SMTP, no Admin hash or a non-https frontend. These are built and tested, but the system has not had an independent security, privacy, or legal compliance audit and is not ready for operational government casework. Before a real deployment, add institutional identity proofing (for example government single sign-on or hardware keys, which are stronger than email codes) and account lifecycle controls, appropriate encryption/key management, security monitoring, notification and incident processes, retention agreements, and an approved secure hosting/transfer environment. Reviewers must keep referral briefs free of identifying or unnecessary sensitive detail; the UI cannot reliably redact information entered by a human.

## Project Structure
```
backend/      Express API, MongoDB models, GridFS evidence storage, tests
frontend/     React single-page app
agency-portal/  Role-restricted agency case portal (no external government integration)
ml/           Isolated ML experiments (synthetic data, training and export scripts)
Docs/         Proposal, literature review, methodology, and the full design-decision narrative
```

## Known, Honest Limitations
- The routing aid is a rule-based mapping from categories and keywords to institutions (plus the experimental model's ranking where permitted); the institution list and mandates in `backend/utils/agencies.js` are a simplified model of Kenya's anti-corruption architecture, not an official or legal jurisdiction decision. Its recommendation-follow rate on the Admin overview measures agreement with reviewers, not correctness. The model's per-category scores rank categories for one report and are not calibrated probabilities.
- The malware scan on evidence uploads checks for the EICAR test signature only (a real deployment would run a dedicated engine such as ClamAV)
- Photos (JPEG, PNG) have their GPS, device and comment metadata removed before storage, and uploaded file names are replaced with neutral ones; pixels are untouched. Video, audio and PDF files are stored as uploaded and may still carry identifying metadata, so reporters who need anonymity should strip it first. Removing metadata also removes it as evidence of when or where a photo was taken; the report's own county and date fields carry that instead.
- Email delivery uses the configured Gmail SMTP account. Set its Google App Password in the ignored `backend/.env` as `SMTP_PASS`; do not commit or share it. A reporter may optionally request an email receipt: the app first emails a six-digit OTP, then sends the Tracking Reference and Access Key only after the code is confirmed. OTPs expire after 10 minutes and allow at most five guesses. Email is optional; the on-screen/downloadable receipt remains available. Actual delivery is not ready until valid Gmail SMTP credentials are configured and tested.
- The Agency Case Portal is a role-scoped internal workflow; no external government identity provider, agency API, or formal institutional partnership is connected
- The live category/urgency triage remains a keyword-based aid; its confidence score is not a calibrated probability. A separate supervised model can show an experimental category suggestion to a reviewer only after that reviewer submits an independent assessment. It was trained on synthetic examples, is not validated on real reports, does not change category or urgency, and is not ready for real-world casework or automated decisions.
- Reviewer related-report suggestions use local TF-IDF/cosine similarity over at most the 500 newest active reports in the same county. The current 12% display threshold is an uncalibrated starting point. The score is lexical similarity, not a probability that reports describe the same incident; wording differences, short reports, shared boilerplate, and language differences can cause misses or false positives. Suggestions are never automatically linked or merged. Larger deployments should benchmark the threshold on reviewer-confirmed pairs and move to an indexed retrieval service if report volume makes the bounded scan slow.
- Whether the category model is over- or underfitting is measured (`ml/src/diagnose_fit.py`: mild overfitting from too little independent data, no leakage), and `ml/src/readiness.py` blocks any claim of real-world accuracy until adjudicated real reports meet stated numeric limits. It currently fails that gate by design, because only synthetic data exist.
- ML training and retraining instructions live in [`ml/`](ml/README.md), separately from the keyword-based triage. No dataset has been imported from a third party or exported from the local MongoDB. A future training CSV must contain only approved, adjudicated labels and be stored locally in the ignored `ml/data/approved/` directory.
- ML label collection is a separate, blinded workflow: two different staff accounts independently label the alleged conduct or mark it insufficient to classify; matching category labels become an agreed candidate, two insufficient assessments produce no category target, and disagreements require an Admin's documented adjudication. Reporter-selected categories and the existing classifier output are hidden from a staff member until they submit their own assessment. The pilot guide is in [`ml/LABELING_GUIDE.md`](ml/LABELING_GUIDE.md). The model suggestion is advisory only; its synthetic benchmark does not establish real-world accuracy, fairness, or operational readiness.
- Report intake normalizes whitespace and Unicode for structured fields, validates dates and category-specific values, and leaves optional facts blank when they are not provided. It does not impute allegations, dates, identities, or demographics. Training-data cleaning and imputation must be designed against the actual, approved dataset; missing target labels must not be invented, and any feature imputation must be fitted on training data only.
- Report deletion is an Admin-only soft archive. It hides the report from active views and public statistics while retaining the record and evidence for audit; reports under legal hold cannot be archived.
- Admins can restore archived reports or permanently delete an archived report and its GridFS file/chunks (permanent deletion is blocked by legal hold). User deletion removes the account and clears that account's identity references from retained reports and audit entries.
- The dashboard lists refresh from MongoDB-backed API endpoints every 10 seconds so changes made by another administrator or process become visible without reloading the whole site.

---

This project is developed for academic purposes by Benvictor Mwangi (155499), Strathmore University.
