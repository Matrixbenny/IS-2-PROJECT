# The Full Story of Kenya Watch — From Nothing to What Exists Today

This story is built only from what is actually in the project — both codebases, both model files, the database helper script, the frontend pages, the CSS, the package files, and the official proposal/methodology chapters — not assumption. Where the *proposal* describes something that does **not** exist in the actual code yet, that is said explicitly, because that gap matters enormously for the diagrams that come next.

---

## Part 1 — Who this project belongs to, and why it exists

This is Nyangabi Benvictor Mwangi's (Admission No. 155499, BBIT 4C) final year Information Systems project at Strathmore University, School of Computing and Engineering Sciences, supervised by Ms. Zainabu Muti. The working title is **"A Machine Learning-Based Web Platform for Anonymous Reporting and Tracking of Corruption Cases in Kenya."** The product itself, as coded, is branded **"Kenya Watch"** — its tagline in the actual app header is "A Trusted Platform to Report and Track Corruption," shown next to a shield emoji logo.

The motivating problem, straight from Chapter 1 of the proposal: corruption in Kenya is widespread and under-reported. Citizens who witness or experience corruption are often too afraid to report it because they fear retaliation, fear being re-identified even when a platform claims to be "anonymous," and often get no feedback after they submit a complaint — so they don't trust the process enough to keep participating. Existing platforms compound the problem. The proposal compares four real platforms in a table:

| Platform | Anonymity | Evidence Upload | Real-Time Tracking | Integration with Agencies |
|---|---|---|---|---|
| Kenya Anti-Corruption Portal | Yes | Yes | No | Partial |
| Africa Integrity Hub | Yes | No | Yes | Yes |
| Whistle Africa | No | Yes | Yes | No |
| e-Integrity Kenya | Yes | Yes | Yes | Yes |

None of them combine full anonymity + evidence upload + real-time tracking + agency integration + intelligent prioritization all at once. That's the gap Kenya Watch is meant to fill.

---

## Part 2 — The actors, as actually defined in code

Open `backend/user.model.js` and there is exactly one collection for people: **User**, with fields `name`, `email` (unique), `password`, `role` (an enum restricted to exactly three values: `'user'`, `'admin'`, `'reviewer'`, defaulting to `'user'`), and `createdAt`.

So, by the code's own definition, there are three human role types baked into the data model:
- **user** — an ordinary citizen/reporter (the default role for anyone created)
- **reviewer** — someone who reviews/triages reports
- **admin** — someone with elevated/administrative rights

Important honesty check: **the password field is stored as a plain string with no hashing logic anywhere in the code.** The only place a password is ever set is in `manage-db.js`, where it's literally the string `'hashedpassword'` with a code comment saying *"Use bcrypt in real apps"* — meaning hashing is acknowledged as necessary but is **not actually implemented**. This is flagged because if diagrams or documentation claim "passwords are securely hashed," that would not match the real code.

Beyond humans, the proposal names additional conceptual actors that are **not yet implemented as running code**: an **ML/classification service** (planned, to triage and categorize reports), and implicitly **MongoDB** itself as the persistent data-store actor that the backend talks to. MongoDB is worth noting because in OOAD/system diagrams it's common to show the database as a passive actor/participant in sequence diagrams even though it's not a "user."

---

## Part 3 — The data model, field by field, exactly as coded

**User** (`backend/user.model.js`):
- `name` (String, required)
- `email` (String, required, unique)
- `password` (String, required) — plaintext in practice, no hashing wired up
- `role` (String enum: user/admin/reviewer, default `user`)
- `createdAt` (Date, default now)

**Report** (`backend/report.model.js`):
- `title` (String, required)
- `description` (String, required)
- `location` (String, optional)
- `evidence` (array of sub-documents, each with `url`, `type`, `uploadedAt` default now) — note the field name is **`evidence`**, singular concept, plural array
- `demographic` (embedded object: `ageGroup`, `gender`, `occupation` — all optional strings)
- `status` (String enum: `Received`, `In Review`, `Resolved`, `Rejected`; defaults to `Received`)
- `statusHistory` (array of sub-documents: `status`, `changedAt` default now, `changedBy` — a reference to a User's `_id`)
- `tags` (array of plain strings)
- `comments` (array of sub-documents: `user` reference, `text`, `createdAt` default now)
- `user` (a reference to the User who submitted it)
- `createdAt` (Date, default now)

This is the complete, real schema. There is no separate "Evidence" collection, no "Agency" collection, no "Notification" collection, no "AuditLog" collection in the actual code — everything evidence/status/comment-related lives embedded inside a single `Report` document. This matters a lot for the ERD: right now there are really only **two top-level collections** (`User` and `Report`), with `evidence`, `statusHistory`, and `comments` as embedded sub-documents inside `Report`, not separate tables/collections.

---

## Part 4 — The backend server, exactly as it behaves today

`backend/index.js` is a small Express app. It connects to MongoDB at `mongodb://localhost:27018/kenya_watch` — note the **non-default port 27018** (standard MongoDB is 27017), so this project expects Mongo to be configured or tunneled onto a custom port. The database name is `kenya_watch`.

There are exactly **three routes** wired up, and only three:
1. `GET /` — a plain health-check that just returns the text "Kenya Watch backend is running!"
2. `POST /reports` — takes whatever JSON body is sent, constructs `new Report(req.body)`, and saves it. There is **no authentication check, no input sanitization beyond Mongoose's own schema validation, and no server-side business logic** — it is a direct pass-through from request body to database document.
3. `GET /reports` — returns every report in the collection, sorted by `createdAt` descending (newest first). No pagination, no filtering by status, no filtering by user, no authentication/authorization check — this endpoint is fully public and returns *everyone's* reports to *anyone* who calls it.

That's it. There is **no login endpoint, no registration endpoint, no logout, no session/token handling, no status-update endpoint, no comment endpoint, and no ML endpoint** anywhere in `index.js`. The `User` model exists and is `require`d by `manage-db.js`, but `index.js` never imports or uses `User` at all.

---

## Part 5 — `manage-db.js`: the hidden "back office" that isn't actually connected to the app

This file is a standalone Node script — you run it manually from a terminal (`node manage-db.js`), it is **not** part of the running web server and is **never triggered by the frontend**. It connects to the same MongoDB, and then, in sequence, demonstrates the full intended data lifecycle by hardcoding example data:

1. Creates one admin user (`name: 'Admin User'`, `role: 'admin'`, password literally `'hashedpassword'`).
2. Creates one sample report tied to that admin user's `_id`, with a location, demographic info, tags (`['bribery', 'city hall']`), and status `'Received'`.
3. Fetches all reports with `.populate('user')` (so it resolves the submitter's user document instead of just the ID).
4. Updates the **first** report found to status `'In Review'` using `findByIdAndUpdate`.
5. Pushes a comment onto the **first** report found (tied to the same admin user), then saves it.
6. Has a commented-out (disabled) example of deleting a report.
7. Disconnects from MongoDB.

This script is effectively a demonstration/seeding tool proving the schema *can* support the full lifecycle (status changes, comments, user linkage) — but none of that lifecycle is reachable by an actual citizen, reviewer, or admin through the real running application today. Any use case like "Reviewer updates report status" or "Reviewer adds a comment" is currently only possible by manually editing the database with this script, not through any UI or API route.

---

## Part 6 — The frontend, screen by screen, exactly as coded

It's a Create React App project (`react-scripts`), using React 19 and `react-router-dom` v7, plus `axios` for HTTP calls (used in the code but, worth noting, **not actually listed in `frontend/package.json`'s dependencies** — a mismatch that could cause an install issue on a clean machine).

There are three routes defined in `App.js`, wrapped in a `<Router>`:

- **`/` → Home**
- **`/submit` → SubmitReport**
- **`/about` → About**

Here's the part that's easy to miss: **`Home.js` and `SubmitReport.js` are almost empty placeholder components.** `Home.js` just renders `<h2>All Reports</h2>` with a code comment "Reports list will be rendered here by App.js for now." `SubmitReport.js` just renders `<h2>Submit a Corruption Report</h2>` with a comment "The report form will be rendered here by App.js for now." **All the real, working UI — the actual form and the actual reports list — is written directly inside `App.js`**, and gets rendered as a sibling immediately after the placeholder component on each route. So visiting `/` actually shows the `Home` placeholder heading followed immediately by the real "All Reports" summary and list (both live in `App.js`). Visiting `/submit` shows the `SubmitReport` placeholder heading followed immediately by the real form (also living in `App.js`).

`About.js` is the only page that is fully self-contained and "real" as written: a static paragraph describing Kenya Watch's mission ("empower citizens, promote transparency, and help build a better society").

**The reports list (`/`):**
- On component mount, `App.js` calls `fetchReports()`, which does `axios.get('http://localhost:5000/reports')` and stores the result in a `reports` state array.
- If there are zero reports, it shows an empty-state block with a 📭 emoji and the text "No reports found. Be the first to submit a report!"
- Otherwise, it renders one card per report showing: title, a status badge (`r.status`), the description, the location (or an italicized "(not specified)" if blank), an "Evidence" line, a "Demographic" line (age/gender/occupation joined together, or "(not specified)"), and the submission date formatted with `toLocaleString()`.

**The submission form (`/submit`):**
- Fields: Title (required), Description (required, textarea, with helper text "Please provide as much detail as possible"), Location (optional), "Evidence URLs" (optional, a single text input where you paste comma-separated links, with helper text literally saying **"You can add links to images, videos, or documents. File upload coming soon."** — confirming there is no real file upload today, only pasting existing URLs), and an optional "Demographic" row of three plain text inputs: Age Group, Gender, Occupation.
- On submit, it builds a payload: `{ title, description, location, evidenceUrls: [...split/trimmed array...], demographic: { ageGroup, gender, occupation } }` and POSTs it to `http://localhost:5000/reports`.

**⚠️ A real bug/mismatch found in the code, flagged rather than silently repeated:** the frontend sends the field name **`evidenceUrls`** (a flat array of raw URL strings), but the actual Mongoose `Report` schema field is **`evidence`** (an array of `{url, type, uploadedAt}` objects). Because Mongoose silently drops any field not declared in the schema (by default, non-strict-mode behavior aside), **whatever the user pastes into "Evidence URLs" is currently not being saved into the `evidence` field at all.** And on the reports list, the card tries to read `r.evidenceUrls` — which will always be empty/undefined too, since that's not how the field is actually named in the database. So today, evidence links submitted through the UI are effectively lost, and every report card will show evidence as "None" regardless of what was typed in. This is a genuine existing defect, not something to preserve going forward. The diagrams should reflect the *intended* correct design (`evidence` array with url/type/uploadedAt), treating the field-name mismatch as a bug to fix in code separately.

- After a successful POST, the frontend shows a green success message, clears every form field, and calls `fetchReports()` again so the new report reappears at the top of the list.
- Errors are caught and shown in red, using either the backend's returned error message or a generic "Failed to submit report."

There is **no login page, no registration page, no admin dashboard, no reviewer dashboard, no map, no charts, no search bar, no filter-by-status control anywhere in the frontend.** The single public reports list at `/` is the only "view reports" experience that exists, and it is visible to literally anyone who opens the site — there's no concept of "my reports" versus "all reports," because there's no login at all.

---

## Part 7 — How "anonymity" actually happens today (important, and subtle)

The proposal's whole premise is *anonymous* reporting. Here is the honest truth about how that currently plays out in the real code: there is no login flow at all in the running app, so when a citizen submits the form, the POST body never includes a `user` field. The `Report.user` reference is simply left `undefined` for every publicly submitted report. So "anonymity" today is not the result of any deliberate anonymization technique (like stripping IP metadata, using tokenized identities, or encrypting a citizen's identity) — **it's simply a side effect of there being no authentication system wired up yet.** The only reports that ever get a `user` reference attached are the ones created manually through `manage-db.js` (tied to the hardcoded admin account).

This is an important thing to decide before drawing diagrams: does the **planned/target** system (the one the proposal describes, with role-based access for admin/reviewer, and presumably some form of citizen accounts or session handling) still keep citizen reports anonymous even if citizens eventually get some form of account? Or is the intended long-term design that citizens never log in at all, and only reviewers/admins log in? This has now been resolved — see Part 12 below.

---

## Part 8 — What happens end-to-end today, as one continuous flow

1. A citizen opens the site at `/`. The frontend immediately calls `GET /reports` and shows every existing report in the system (there's no login, no consent screen, nothing — it's open by default).
2. The citizen clicks "Submit Report" in the nav bar and lands on `/submit`.
3. They fill in Title and Description (the only two truly required fields), optionally Location, optionally a comma-separated list of evidence URLs, and optionally Age Group/Gender/Occupation.
4. They click "Submit Report." The frontend disables the button, sends `POST /reports` with the payload described above.
5. The backend creates a new `Report` document straight from the request body (minimal validation: just the schema's own `required: true` on `title`/`description`) and saves it to MongoDB with `status: 'Received'` (the schema default) and no `user` reference.
6. The backend responds `201` with a success message and the saved report object.
7. The frontend shows a success banner, clears the form, and re-fetches the full reports list — so the brand-new report now appears at the very top of `/` (since the list is sorted newest-first).
8. Nothing else happens. No email/SMS confirmation, no case-tracking reference/ID is generated or shown to the citizen, no notification to any reviewer or admin, and the report just sits in the database with status `Received` until — and only until — someone manually opens a terminal and runs `manage-db.js`, which (as a hardcoded demonstration, not a real feature) would set the *first* report in the whole database to `In Review` and attach one comment to it.
9. There is no separate reviewer or admin experience anywhere in the running app. Everyone who visits `/` sees the exact same public list.

That is the complete, accurate, currently-working system — nothing more, nothing less.

---

## Part 9 — The methodology behind how this was designed (from Chapter 3)

The project follows **Object-Oriented Analysis and Design (OOAD)** combined with a **Prototyping** development model, chosen over Structured Systems Analysis and Design (SSAD) because the domain (users, reports, evidence, workflows) maps naturally to interacting objects rather than rigid linear processes, and because the sensitive, evolving nature of anonymous corruption reporting benefits from iterative user feedback rather than a fixed big-design-upfront approach.

The proposal explicitly lists **six OOAD artifacts that Chapter 4 is expected to contain** — this is the definitive list of diagrams the coursework requires:
1. Use Case Diagram
2. Sequence Diagram
3. System Sequence Diagram
4. Entity Relationship Diagram (ERD)
5. Class Diagram
6. Activity Diagram

The prototyping cycle itself is: Requirement Analysis → Quick Design → Build Prototype → User Evaluation of Prototype → Refine Prototype → (loop back to Quick Design, or) → Final Product Implementation.

Research/testing plan: mixed methods, targeting 52 total respondents across four stakeholder groups — 40 citizens/potential whistleblowers (simple random sampling), 5 civil society/governance stakeholders (purposive sampling), 3 anti-corruption/oversight officers (purposive sampling), and 4 technical reviewers (purposive sampling). Planned testing includes unit testing, black-box testing, white-box testing, usability testing (task completion rate, time-on-task, error frequency, satisfaction/trust), and ML performance testing (accuracy, precision, recall, F1-score) — even though, as established above, no ML code exists yet; this is purely planned evaluation criteria for a feature that hasn't been built.

A specific test case from the plan is worth highlighting because it directly acknowledges the current gap: **"TC-06: Authentication Guard (if enabled) — Access restricted endpoints without authorization → Access denied."** The phrase *"(if enabled)"* is the proposal itself hedging on whether authentication will actually be built and enforced — it is explicitly conditional, not guaranteed.

---

## Part 10 — Tech stack and environment, exactly as configured

**Backend** (`backend/package.json`): `express ^5.2.1`, `mongoose ^9.6.1`. Started with `node index.js` / `npm start`. Talks to MongoDB on `localhost:27018` (custom port), database `kenya_watch`.

**Frontend** (`frontend/package.json`): `react ^19.2.5`, `react-dom ^19.2.5`, `react-router-dom ^7.14.2`, `react-scripts 5.0.1`, plus testing-library packages and `web-vitals`. `axios` is used in code but is **missing from this dependency list** — worth fixing separately. Started with `npm start` (default Create React App dev server, typically port 3000). The frontend calls the backend at a hardcoded `http://localhost:5000` — there's no `.env`/config file for this base URL, it's a literal string in `App.js`.

---

## Part 11 — Summary: what's real vs. what's only planned

| Element | Actually implemented in code today? |
|---|---|
| Submit a report (title/description/location/demographic) | ✅ Yes, working end-to-end |
| View a public list of all reports | ✅ Yes, working end-to-end |
| Evidence upload (files) | ❌ No — only a text field for pasting URLs, and it's not even correctly wired to the schema |
| Anonymity as a deliberate mechanism | ⚠️ Only incidentally, because there is no login at all, not because of any real anonymization logic |
| User registration / login | ❌ No routes exist in the running server at all |
| Role-based access (citizen/reviewer/admin) | ⚠️ Only exists as a `role` field on the `User` schema; nothing in the running app checks or uses it |
| Case status tracking visible to the citizen who submitted it | ❌ No tracking ID/reference is generated or shown; status changes only via manual script |
| Reviewer/admin dashboard | ❌ Does not exist |
| Comments on a report | ⚠️ Schema supports it; only reachable via the manual `manage-db.js` script, not via any API route or UI |
| Machine learning classification/triage | ❌ Does not exist anywhere in the codebase — fully aspirational |
| Notifications (email/SMS) | ❌ Does not exist |

---

## Part 12 — Resolved design decisions for the target system

Thirty scope questions have now been decided, and they change what the upcoming diagrams will show compared to Parts 1–11 above (which describe the code exactly as it exists today). From this point on, unresolved design questions are worked through by researching the real legal, institutional, or technical constraints first, then designing a solution grounded in that research — not by guessing.

### 1. The diagrams model the full target system, not the current bare-bones code

Every diagram (Use Case, Sequence, System Sequence, ERD, Class, Activity) will represent the **full proposal vision**: citizen login (optional), ML-assisted triage/classification, a Reviewer dashboard, an Admin dashboard, and real-time case tracking. The current code (Parts 1–11) remains the accurate record of what is actually built today, but it is now treated as the **starting prototype**, not the ceiling — the diagrams describe where the system is designed to go.

### 2. Reviewer and Admin are two separate actors

The `User.role` enum already distinguishes `reviewer` from `admin`, and the diagrams will keep them as two distinct actors with distinct permissions rather than merging them into one "institutional staff" actor:

- **Reviewer** — screens incoming reports, triages/classifies with ML assistance, updates case status, adds comments/notes.
- **Admin** — manages users and reviewer accounts, has oversight visibility across all cases and reviewers, handles system configuration.

### 3. Reporting is hybrid: fully anonymous OR optional citizen account — and the public list never identifies anyone

The target design supports **two submission paths side by side**, and the citizen chooses which one to use each time they report:

- **Path A — Fully anonymous, no account.** The citizen submits a report with no login at all, exactly like the current code. No `user` reference is ever attached to that report. There is no way for the citizen to privately track that specific report later beyond noting its public tracking reference, since no account is tied to it.
- **Path B — Optional citizen account.** A citizen may choose to register/log in before submitting. In this case the report's `user` reference is set to their account, which unlocks a private "My Reports" view where *they* can see their own submission history and status changes tied to their login.

Regardless of which path was used, there is one shared **public case list** visible to anyone (citizens, reviewers, the public at large) that shows every case's general details — title/category, location, status, and a tracking reference — but this public view **never exposes or links to the identity of the reporter**, even for Path B reports that do have a `user` reference internally. The identity field is simply never joined into the public-facing response. In other words, having an account changes *how the citizen can track their own case privately*; it does not change what anyone else can see about who filed it.

### 4. Evidence submission supports any format, and the ML module processes all of them

The target design does not limit evidence to a single format. Citizens can attach **any combination of images, videos, audio recordings, and documents** as supporting evidence for a report, each stored as a real uploaded file (not a pasted external link, unlike the current broken UI behavior). This maps directly onto the existing schema's `evidence` array, where each item already has a `type` field — that field will now be used to record which of these formats (image/video/audio/document) each uploaded file actually is.

The ML module is designed to process and classify across all of these evidence formats, not just the text description — for example, it may need to analyze image content, transcribe/analyze audio, or extract text from documents, in addition to classifying the written report text.

### 5. ML classification produces one combined result per report: category and urgency, based primarily on the report text

The ML module produces **one classification result per report** (not a separate result per evidence item), containing two outputs:

- **Category** — the type of corruption (e.g., Bribery, Embezzlement, Procurement Fraud, Abuse of Office, Nepotism/Favoritism, Other), directly satisfying Specific Objective IV's "classification."
- **Urgency/priority level** — e.g., Low, Medium, High, Critical, directly satisfying Specific Objective IV's "prioritization."

The primary input to this classification is the report's **text** (title + description, with tags/location as auxiliary signals). Individually running deep image-recognition, audio-transcription, or document-OCR models on every evidence file is out of scope for this project — instead, the *presence and count* of attached evidence (how many files, which formats) is used as a simple supporting feature that can influence the urgency score, without the ML needing to deeply interpret the media content itself. This keeps the earlier "any evidence format" decision intact for citizens while keeping the ML scope realistic and testable. This maps onto the `Report` schema gaining one classification result per report (e.g., a `classification: { category, urgency, confidence }` object), not a classification per `evidence` array item.

### 6. Resolution requires a recorded justification, and cases can be reopened

"Resolved" is not just a label a Reviewer/Admin can flip. A case can only move to `Resolved` if a resolution note plus a reference is attached (e.g., "Referred to EACC, Ref #12345 — officer interdicted pending investigation"). The reporter gets the option to confirm whether they believe the issue was genuinely addressed, producing two honest tiers: *"Resolved — action recorded"* vs. *"Resolved — citizen confirmed."* This is no longer limited to Path B: as refined in decision #21, an anonymous Path A reporter can also reach the "citizen confirmed" tier if they choose to check back in using their Tracking Reference and Access Key — it is their choice to check back, not a limitation of the system's ability to reach them.

This also resolves the status-workflow question from Part 13: the workflow is **not strictly one-directional**. A case can be reopened from `Resolved` or `Rejected` back to `In Review` if new evidence surfaces or a citizen disputes the resolution, with the reopening logged in `statusHistory` for auditability.

### 7. Authority collaboration is a semi-manual referral and follow-up record, not a live integration

The system cannot call a real government API — no such access exists for a student project, and claiming one would be an unverifiable claim. Instead, the target design introduces an **Agency/Institution** concept (e.g., EACC, DCI, Office of the Auditor-General, Ombudsman, Public Service Commission), each pre-mapped to the corruption categories they typically handle (e.g., Procurement Fraud → Auditor-General; Bribery/Extortion → EACC/DCI). When a Reviewer/Admin decides a case needs external action, they **refer** it to the mapped agency, generating a referral record and reference number — the report's county/sub-county (decision #13) suggests the nearest relevant office within that agency, without requiring any more precise location. The system does not auto-submit anything externally — it **records** the outcome of that real-world handoff (the agency's own case number, and any status updates the reviewer manually enters after liaising with that agency through whatever real-world channel exists).

This reframes "integration with agencies" honestly: it is a structured referral and tracking record, not a system-to-system integration — still a meaningful improvement over the four platforms compared in Part 1, none of which combine this with anonymity and ML triage.

### 8. Reporter identity can only ever be disclosed by court order, and this is grounded in actual Kenyan law

This decision was researched directly against the live text of the **Anti-Corruption and Economic Crimes Act (Cap. 65), Section 65 — "Protection of informers"** on Kenya Law's official portal (new.kenyalaw.org), not assumed. The verified provisions:

- No action or proceeding (including disciplinary action) may be taken against a person for assistance given, or information disclosed, to the EACC or an investigator (s.65(1)) — unless the person didn't believe their statement was true (s.65(2)).
- In any prosecution or proceeding, no witness shall be required to identify, or provide information that might lead to identifying, a person who assisted or disclosed information (s.65(3)), and the Court must ensure identifying information is removed or concealed from documents produced in the proceeding (s.65(4)).
- **The exception:** subsections (3) and (4) do not apply "to the extent determined by the **court** to be necessary to ensure that justice is fully done" (s.65(5)).

This directly answers "what if authorities want to contact the reporter because they're legally needed": identity protection is the legal default, and it can only be lifted by a **court**, never by an authority's direct request to the Admin. The target design therefore adds a dedicated **Court-Ordered Disclosure** use case, separate from the normal Reviewer/Admin workflow:

- Only a valid court order can trigger revealing a stored identity, and this applies only to Path B (account-holding) reporters, since a `user` reference exists to disclose.
- **Anonymous Path A reports have a hard limit**: there is no identity captured at all, so a court order has nothing to compel disclosure of. If a case escalates to needing testimony, that citizen would have to voluntarily come forward — the system cannot produce them. This is an honest, legally-grounded limitation, not a flaw, and should be stated plainly in the documentation.
- Any disclosure event is logged as a distinct, highly sensitive audit action (who authorized it, under which case/court reference), separate from ordinary status changes.
- Beyond disclosure, physically protecting someone whose identity is revealed for legal purposes is the mandate of the Witness Protection Agency under the Witness Protection Act (Cap. 79) — a separate government body's responsibility that sits outside this system's scope; the system's role ends at the controlled, court-authorized disclosure step. (Note: the Witness Protection Agency reference is from general legal knowledge and has not yet been re-verified against the current statute text the way Section 65 was — worth a quick confirmation with the supervisor before citing it formally.)

### 9. Anti-abuse controls do not require identity, so they don't compromise anonymity

Since Path A must remain fully accountless, abuse prevention has to work without ever tying a submission to an identity. The target design uses: a CAPTCHA/human-verification challenge on the submission endpoint (proves a human is submitting, without proving who); short-lived, hashed rate-limiting (e.g., caps on submissions from the same network origin per hour, with that origin data discarded quickly rather than stored permanently); and basic content checks (minimum description length, empty-field rejection). None of these controls require or retain an identity, so they don't weaken the anonymity guarantee from decision #3.

### 10. False reports are a legal/investigative matter, not something the platform itself punishes

This is grounded in the same verified ACECA text as decision #8: Section 65(2) explicitly withdraws informer protection from "a statement made by a person who did not believe it to be true," and Section 66(1)(d) separately makes it an offence to "make false accusations to the Commission." The law already treats bad-faith reporting as a distinct, unprotected, and punishable category — handled by investigators and courts, not by the reporting platform itself.

The system's role is therefore limited to faithfully capturing the report and giving Reviewers/Agencies a resolution outcome of "Investigated — Unsubstantiated" or "Investigated — False/Malicious" (extending decision #6's resolution-note requirement). For anonymous Path A reports, there is no identity to hold accountable, so no platform-level penalty is possible or attempted — accountability for knowingly false reports is an agency/court matter downstream of the system. For Path B accounts, a pattern of confirmed-false reports can be flagged for Admin review of that account.

### 11. Data retention follows the Data Protection Act's minimization principle, verified directly

Verified against the live text of the **Data Protection Act (Cap. 411C), Section 25 — "Principles of data protection"** on Kenya Law's official portal: personal data must be adequate, relevant, and limited to what is necessary (s.25(d)), and must be "kept in a form which identifies the data subjects for no longer than is necessary for the purposes for which it was collected" (s.25(g)). The Act also formally defines **anonymisation** as "the removal of personal identifiers from personal data so that the data subject is no longer identifiable" (s.2).

Applied to the target design:

- Anonymous Path A reports never captured an identity in the first place, so there is nothing to retain or purge beyond the report content itself — this is anonymisation in the Act's own formal sense, not just an absence of login.
- Path B account data (identity, demographic info) is retained while the account is active; after a defined period of inactivity, the account is reviewed and either reactivated on request or anonymized.
- After a case is fully resolved and any legal/referral processes are closed, the identifying `user` link on that report is severed (anonymized) after a defined retention window, unless the case is still under active legal proceedings — the case content itself can remain visible in the public list indefinitely for transparency, since that content was never personally identifying to begin with (per decision #3).

### 12. Multi-language support is scoped to English and Kiswahili

Rather than the open-ended "multi-language support" claim in the README, the target design commits to Kenya's two official languages — English and Kiswahili — using a standard i18n library with a language toggle in the header. This is a defensible, achievable scope rather than an unbounded promise.

### 13. Location is captured as a cascading County → Sub-county selection — never an exact address, and never a separate "precise location" field

An exact address or GPS pin was considered for routing reports to the nearest relevant authority, but rejected: combined with the narrative description, it would let a case be pinned down closely enough to narrow down who could have witnessed it, undermining the entire anonymity architecture (decisions #3, #9, #11, #17, #21). Kenya's oversight bodies (EACC, DCI, county government offices) are already organized by county and sub-county, not by GPS proximity, so that level of precision is unnecessary for the stated goal.

The `location` field is therefore a **cascading selector**: the citizen first picks one of Kenya's 47 counties, which then filters the second dropdown to only that county's real sub-counties (a fixed reference list per county, not free text). This is the precision ceiling for location — there is no separate, more precise field anywhere in the design. County + sub-county is shown in the general tier (decision #21) and drives the public map/dashboard (decision #27); it also informs the Reviewer's agency-referral choice in decision #7, suggesting the nearest relevant office within the mapped agency, without ever requiring or exposing anything more precise.

### 14. Tags are system-generated by the ML module, not typed by citizens

Requiring anonymous citizens to know and type a consistent tagging taxonomy is unreliable. Instead, `tags` are derived automatically from the ML classification (decision #5) — e.g., the predicted category and any secondary keywords — and a Reviewer can edit or add tags afterward during review. Citizens are never asked to fill in a tags field themselves.

### 15. Reviewer/Admin accounts are provisioned internally, never through public self-registration

Only the optional citizen account (Path B) is open to public self-registration, and it always defaults to the `user` role. A single bootstrap Admin account is created outside the public app during initial deployment (a secured setup step, replacing today's insecure `manage-db.js` pattern). That Admin can then create further Admin and Reviewer accounts through an internal "Manage Users" screen — there is no public sign-up path to either of those roles.

### 16. Related reports can be linked, but are never automatically merged

Automatically merging reports risks wrongly conflating distinct incidents. Instead, the ML module or a Reviewer can flag a new report as "possibly related" to existing cases (based on similar category, location, and time window) as a soft suggestion, and a Reviewer can manually link related case IDs together for investigative visibility. Each report always keeps its own independent identity and tracking reference — linking is additive, never destructive.

### 17. Evidence files are stored in MongoDB GridFS, served only through an authenticated route, with identifying metadata stripped before storage

The target design stores uploaded evidence (images, video, audio, documents) using **MongoDB GridFS**, rather than a third-party cloud storage provider. This choice reuses the database connection the system already has, avoids introducing new external accounts/credentials, and — importantly — avoids the cross-border data transfer restriction verified earlier in the Data Protection Act (s.25(h): personal data must not be "transferred outside Kenya, unless there is proof of adequate data protection safeguards or consent"). Keeping files self-hosted inside the project's own MongoDB instance sidesteps that concern entirely.

Raw evidence files are never served through a public/direct URL. They are only retrievable through an authenticated backend route accepting one of three valid credentials: a Reviewer/Admin login, a Path B account holder viewing their own report, or the Tracking Reference + Access Key pair from decision #21 for that specific report only — the public case list only ever shows evidence metadata (file type, count, upload date), never the file content itself.

Critically for anonymity: photos and videos captured on phones commonly embed EXIF/metadata (GPS coordinates, device model, timestamps) that could re-identify a reporter's location or device even though the platform never captures their name. The upload pipeline strips all such embedded metadata from every file **before** it is persisted to GridFS, so this cannot silently undermine the anonymity guarantee from decisions #3 and #9.

### 18. File uploads are restricted by type and size, and scanned before being persisted

Each evidence file is validated against an explicit allow-list per format — images (JPG/PNG/WEBP), video (MP4/MOV), audio (MP3/WAV/M4A), documents (PDF/DOCX) — with anything outside that list rejected outright. A per-file size limit and a per-report file-count limit are enforced to prevent storage exhaustion, tying into the anti-abuse controls from decision #9. Before a file is written to GridFS, it passes through a malware/virus scan (e.g., an open-source scanner such as ClamAV); files flagged as malicious are rejected rather than stored.

### 19. Passwords are hashed with bcrypt before storage — never stored in plain text

This directly fixes the defect flagged in Part 2: the current code's own comment already says "Use bcrypt in real apps" but never implements it. The target design hashes every password with bcrypt (a sufficiently high cost factor, e.g. 10–12 rounds) before it is ever written to the `User` collection, for all three real login roles — Path B citizen accounts, Reviewers, and Admins. A minimum password-strength policy is enforced at registration. Anonymous Path A submissions never touch this at all, since no account or password is involved.

### 20. Authentication uses a JWT delivered via an httpOnly, secure cookie — not client-side storage

Given the decoupled React SPA + separate Express API architecture already in place, the target design uses **JWT-based authentication**: on successful login, the backend issues a signed JWT (embedding the user's ID and `role`) and delivers it via an **httpOnly, Secure, SameSite=Strict cookie** — never via `localStorage` or a token the frontend JavaScript can read directly, which mitigates theft via cross-site scripting. This keeps the backend stateless (no server-side session store to build or maintain, appropriate for the project's scope) while still allowing role-based access-control middleware to gate Reviewer-only and Admin-only routes by checking the JWT's `role` claim on every protected request.

### 21. Anonymous tracking uses a Tracking Reference + secret Access Key (capability-based access), not an account, with a defined general/deep visibility split

An anonymous (Path A) citizen has no account to log back into, so simply "remembering a tracking ID" isn't enough — it also needs to prove, without any identity, that the person checking back in is really the original reporter. The target design generates **two separate values** at submission time:

- A **Tracking Reference** (e.g., `KW-7F3Q2A`) — short, safe to share publicly, used to look up the case.
- A **secret Access Key**, shown only once at submission — generated as a short, memorable multi-word passphrase (Diceware-style, e.g., `purple-tiger-lemon-forest`) rather than random hex, so it's easier for a person to save or recall correctly. Only a hash of the Access Key is ever stored (same principle as password hashing in decision #19), never the plain value.

This is a **capability-based access** pattern (the same principle behind SecureDrop's whistleblower "codename" system): proof of ownership is possession of a secret, not identity. Looking up a case produces one of two views:

**Note on Path B:** every report gets a Tracking Reference regardless of submission path, since the shared public list (decision #3) covers both — but a Path B report never generates an Access Key. It doesn't need one: the citizen's login is already a stronger proof of ownership than a secret key, so Path B always reaches deep tier through "My Reports," never through the Reference+Key pair.

- **General tier** (Tracking Reference alone, or public browsing of the case list): Tracking Reference, title, the citizen's self-selected `reportedCategory` (decision #29) — never the ML's independently-inferred `classification.category`, which stays an internal Reviewer-triage signal — county/sub-county (decision #13), **coarse status only** (no resolution note text), submission date, incident date/time (decision #30), and an evidence indicator ("3 files attached") without file access. This matches decision #3's original public-list scope exactly.
- **Deep tier** (Tracking Reference + correct Access Key, or an authenticated Reviewer/Admin working the case): everything in General, plus the full narrative description, the category-specific structured details from decision #29 (tender references, amounts, relationships, document names, etc. — treated with the same sensitivity as the narrative description), demographic info if supplied, the full status-history timeline, the ML's `classification.category`/urgency/tags, the full resolution note and reference detail, agency referral detail, Reviewer comments directed at the reporter, access to the actual evidence files, and the ability to add a follow-up note/evidence or confirm/dispute a resolution. Related-case links (decision #16) remain Reviewer/Admin-only even in deep tier, since a linkage could indirectly expose details of someone else's anonymous report.

The deliberate effect: the narrative description and the full resolution note — the two fields most likely to cause accidental self-identification or premature exposure of an ongoing investigation — are excluded from the general tier. This is a **privacy hardening over the current actual code**, which today shows the full description to anyone browsing the public list. Deep tier is, in effect, the same view a Reviewer/Admin already sees day-to-day minus the sealed identity from decision #8 — the Reference+Key mechanism just grants the anonymous reporter that same depth of visibility into their own case, without the system's human staff ever learning who they are.

To reduce the real risk of losing these values, the submission-confirmation screen: displays both as a scannable **QR code** (encoding both values together, so a photo/screenshot preserves them without transcription errors); offers a one-click downloadable/printable receipt; and offers an **optional, non-stored** one-time "send me a copy" via email or phone, which is never saved to the database or linked to the report (fire-and-forget, consistent with decision #11's data-minimization principle). The UI states plainly, upfront: if both values are lost and no one-time copy was sent, recovery is genuinely impossible — an honest limitation, not a flaw, and the real cost of true anonymity.

### 22. Path B follow-up reuses the same mechanism as Path A, and password reset follows two standard security rules

Follow-up (adding a note or more evidence to an already-submitted report) does not need a separate design for Path B — decision #21 already gives any reporter this capability once they've proven ownership, whether that proof is a login session (Path B) or a Tracking Reference + Access Key (Path A). Path B additionally needs account password reset, which follows two standard security rules often skipped in student projects: the reset link is single-use and time-limited (e.g., one hour), and the system's response is always "if this email is registered, a reset link has been sent" regardless of whether the account actually exists — otherwise the reset form itself becomes a way to check who has an account, a real privacy leak for a platform whose whole premise is protecting reporters.

### 23. Path A receives no proactive notifications, by design — not by oversight

Path B citizens can opt in to email notifications on top of the default in-app notification shown in "My Reports" (web push is explicitly out of scope for this project, left as a documented future enhancement). Path A citizens receive **no proactive notification of any kind**, and this is a deliberate trade-off, not a gap: the only contact channel ever collected from an anonymous reporter is the optional, non-stored one-time "send me a copy" from decision #21. Reusing that same address later for a status-change alert would require retaining it linked to the report, which would quietly reintroduce an identity link and undermine the anonymity guarantee from decision #3. A Path A reporter must choose to check back in themselves using their Tracking Reference and Access Key.

### 24. Reviewers claim cases to avoid duplicate work, and unclaimed high-urgency cases escalate to Admin

Any Reviewer can view the shared queue, but working a case requires "claiming" it first, preventing two Reviewers from duplicating effort on the same report; Admin can reassign a claimed case if needed. To make sure the ML urgency score from decision #5 is actually acted on rather than just displayed, a case classified as High or Critical urgency that remains unclaimed past a defined time threshold triggers an escalation alert to Admin — that threshold clock starts counting from when classification completes and urgency becomes known (decision #28), not from the original submission time, since urgency cannot be acted on before it exists.

### 25. Reviewers never see a Path B reporter's actual identity during normal review

This makes explicit what decisions #3 and #8 already implied but never stated directly: during ordinary case review, a Reviewer sees the report content, evidence, and ML classification, plus only a coarse badge ("Anonymous" vs. "Registered reporter") — never the underlying name or email of a Path B account holder. That identity stays sealed at the data layer and is only unsealed through the Court-Ordered Disclosure process from decision #8, which only an Admin can execute.

### 26. Disclosure execution is Admin-only for this project's scope; dual-control is noted as a future enhancement, not claimed as current practice

Only an Admin can execute a Court-Ordered Disclosure (decision #8), never a Reviewer. For a real production deployment, requiring two Admins to jointly approve a disclosure (dual-control/maker-checker) would be the stronger safeguard — that is documented here explicitly as a future enhancement rather than claimed as something this project implements, since a single-admin bootstrap model (decision #15) is the realistic scope for a student project.

### 27. A separate public aggregate statistics page exists alongside the internal Reviewer/Admin analytics

Beyond the internal Reviewer/Admin analytics dashboard (category/urgency breakdown, resolution rates, reviewer workload), the target design adds a **public-facing aggregate statistics page** — total reports, overall resolution rate, category breakdown, and the county heatmap from decision #13 — visible to anyone, with no per-case data. The category breakdown on this public page is aggregated by the citizen's `reportedCategory` (decision #29), never by the internal ML `classification.category` (decision #5) which stays a Reviewer-only triage signal per the general/deep tier split in decision #21. This is a transparency feature the README implies, kept strictly to aggregates so it cannot be used to re-identify any individual case or reporter.

### 28. ML classification is asynchronous, and its unavailability never blocks the core reporting workflow

A citizen's submission is saved and a success message plus Tracking Reference/Access Key are returned immediately, without waiting on ML classification. The classification (category, urgency, tags) attaches in the background once ready, and the report appears in the Reviewer queue with a "Classifying…" indicator in the meantime. If the ML service is slow, fails, or is unavailable, the report still appears in the queue and remains fully triageable by a Reviewer through manual judgment — ML is an assistive layer, never a hard dependency the core reporting and review workflow can be blocked by.

### 29. Reporting form fields are tailored by category, self-selected upfront and grounded directly in ACECA's statutory offence elements

Decision #5 has the ML system determine category only *after* submission, but category-specific fields are needed *on the form itself*. This is resolved by having the citizen **self-select a category upfront** (required, from the same fixed list as decision #5), which unlocks category-specific optional fields; ML still classifies the full text independently afterward, and if it disagrees with the citizen's self-selection, that discrepancy is flagged for the Reviewer during triage — it never blocks submission.

The category-specific fields are grounded directly in ACECA's actual statutory elements, verified earlier in this conversation (§2 definitions, §39–47 offences):

- **Bribery**: role/position of the person involved, what was demanded/offered, what action it was for, whether payment was made or only demanded.
- **Embezzlement / Misappropriation of Public Funds** (§45): public body/department, description of the funds/property, approximate amount if known, the project/budget line it was meant for, how the diversion allegedly happened.
- **Procurement Fraud** (§44, bid rigging): procuring entity, tender/contract reference if known, nature of the manipulation, supplier/company involved, approximate contract value.
- **Abuse of Office** (§46): office/position held, the decision or action taken, who benefited, how it was improper.
- **Nepotism / Favoritism**: relationship between the officer and beneficiary, the appointment/tender/benefit in question.
- **Extortion**: what was demanded, under what threat, whether payment was made.
- **Fraud / Forgery of Documents**: which document(s), what was falsified.
- **Conflict of Interest**: nature of the personal/financial interest, the decision it affected, whether it was disclosed beforehand.
- **Other**: no additional fields, generic form only.

Every category-specific field is presented as an optional "if known" prompt, never a mandatory requirement — forcing detailed legal-grade information risks discouraging reporting altogether, which would undermine the project's core goal.

### 30. A shared "date/time of incident" field is captured separately from the submission timestamp

Every report now captures when the incident actually happened, as its own field, distinct from `createdAt` (when it was submitted to the platform). This distinction matters significantly for investigation and was missing from the original schema design until this pass.

---

## Actor summary (consolidated, for diagramming)

- **Citizen** — Path A (anonymous, no account, uses Tracking Reference + Access Key) or Path B (optional registered account, JWT login). Submits reports; checks back for status, follow-up, and resolution confirmation.
- **Reviewer** — claims cases from the shared queue, triages with ML assistance, updates status (with required resolution notes), adds comments, refers cases to Agencies, links related cases. Never sees a Path B reporter's real identity.
- **Admin** — provisions Reviewer/Admin accounts, executes Court-Ordered Disclosures, views analytics, handles system configuration and Reviewer reassignment/escalations.
- **ML Classification Module** — internal, automated, asynchronous actor. Produces `classification.category`/urgency/tags per report; never blocks the core workflow if unavailable.
- **Agency/Institution** (EACC, DCI, Office of the Auditor-General, Ombudsman, Public Service Commission) — external secondary actor. Receives referrals and provides real-world updates manually relayed back by a Reviewer/Admin; no live system integration.
- **Court** — external actor. Issues disclosure orders that are manually actioned by an Admin; holds no system account.

## Consolidated target `Report` schema (for the Class Diagram/ERD)

**User**: `name`, `email` (unique), `password` (bcrypt-hashed), `role` (user/admin/reviewer), `emailNotificationsOptIn` (Boolean, default false, per decision #23), `resetPasswordTokenHash`, `resetPasswordExpiry` (both per decision #22's password-reset flow, hashed the same way as the Access Key in decision #21), `createdAt`.

**Report** — general tier (public) fields: `trackingReference` (public, unique), `title`, `reportedCategory` (citizen-selected), `county`, `subCounty`, `incidentDateTime`, `status` (coarse), `createdAt`, evidence count/type indicator.

**Report** — deep tier (Reference+Key, Path B owner, or Reviewer/Admin) fields: `description`, `categorySpecificDetails` (object, shape varies by `reportedCategory`, per decision #29), `demographic {ageGroup, gender, occupation}`, `evidence[] {gridFsId, type, uploadedAt}` (file content), `statusHistory[] {status, changedAt, changedBy}`, `resolutionNote`, `resolutionReference`, `citizenConfirmation` (none/confirmed/disputed), `comments[] {author, text, createdAt}`.

**Report** — internal-only fields (never shown to the reporter, even in deep tier): `classification {category, urgency, confidence}` (ML-inferred, distinct from `reportedCategory`), `tags[]` (ML-generated), `agencyReferral {agency, referenceNumber, notes}`, `relatedCaseLinks[]`, `claimedBy` (Reviewer reference), `accessKeyHash` (Path A reports only — Path B reports never generate one, since login already proves ownership), `user` (Path B reference, sealed per decision #8/#25).

---

## Part 13 — Still open, to resolve before drawing the diagrams

None remaining. All thirty scope questions across every pass are now resolved — ready to move on to drawing the Use Case, Sequence, System Sequence, ERD, Class, and Activity diagrams.
</content>
