# Kenya Watch

A machine learning-assisted web platform for anonymous reporting and tracking of corruption cases in Kenya. Final year Information Systems project (BBT4300), Strathmore University, School of Computing and Engineering Sciences.

Citizens can report corruption either fully anonymously (no account, tracked later via a **Tracking Reference + secret Access Key**) or through an optional account (**Path B**, unlocking a private "My Reports" view). Reports are triaged by Reviewers with ML-assisted classification, can be referred to the relevant oversight agency, and resolution outcomes are tracked back to the reporter — all without ever requiring or exposing a reporter's identity.

See [Docs/my IS story.md](Docs/my%20IS%20story.md) for the full set of 30 researched, legally-grounded design decisions behind this system.

## Features
- Anonymous (Path A) or optional-account (Path B) corruption reporting, with category-specific fields grounded in the Anti-Corruption and Economic Crimes Act
- Evidence upload (images/video/audio/documents) via MongoDB GridFS; original bytes are retained and malware-signature scanned
- Optional live audio/video recording during report submission, with recording segments saved to GridFS while recording
- Installable Progressive Web App (PWA) for supported browsers; the offline shell does not cache API or report data
- Tracking Reference + Access Key capability-based case tracking for anonymous reporters, with a general/deep visibility split
- Lightweight keyword-based ML classification (category + urgency), running asynchronously so it never blocks submission
- Reviewer Queue: claim cases, update status (resolution requires a note + reference), refer to an Agency/Institution, link related cases; Admins can archive reports without destroying the audit record or evidence
- Admin overview with live report, workflow, account, and escalation counts plus an urgency-ranked list of unclaimed cases; account management, archived-report controls, and data-retention/anonymization tooling
- Public statistics page (aggregate-only) and a demo "Agency Partner Portal" concept prototype
- English/Kiswahili language toggle
- Security: helmet security headers, rate limiting, a self-hosted CAPTCHA for anonymous submissions, bcrypt password hashing, httpOnly JWT cookie auth

## Tech Stack
- **Backend**: Node.js, Express, MongoDB + Mongoose (with GridFS for evidence), JWT auth, Nodemailer
- **Frontend**: React (Create React App), React Router
- **Testing**: Node's built-in test runner (`node:test`) + Supertest for the backend; React Testing Library for the frontend

## Prerequisites
- Node.js 18+ and npm
- MongoDB Community Server (tested with a standalone `mongod`, not a replica set)

## Getting Started

### 1. Start MongoDB
This project connects to MongoDB on port **27017**, using the `kenya_watch` database. Make sure your MongoDB service is running on that port. Do not start a second `mongod` process on port 27017 if another MongoDB instance is already using it.

### 2. Backend
```powershell
cd backend
npm install
```
Copy `.env` (already present for local dev) and adjust as needed:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/kenya_watch
JWT_SECRET=<replace-with-a-long-random-string-before-any-real-deployment>
JWT_EXPIRES_IN=7d
NODE_ENV=development
```
Run the server:
```powershell
npm start
```
The API is now available at `http://localhost:5000`. The demo Agency Partner Portal is served at `http://localhost:5000/agency-portal/`.

Create the first Admin account (one-time, command-line only - refuses to run if an admin already exists):
```powershell
node scripts/bootstrap-admin.js "Full Name" "admin@example.com" "StrongPassw0rd!"
```

### 3. Frontend
```powershell
cd frontend
npm install
npm start
```
The app opens at `http://localhost:3000`.

### Install the app
In a supported browser, open the website and use the browser's **Install app** option (or the in-app install prompt when available). The PWA requires HTTPS outside localhost. Its service worker caches only the public application shell and static assets; API responses, submitted reports, and evidence are not cached. Recording requires camera/microphone permission and HTTPS or localhost. Recordings are limited to 10 minutes or 100 MB and must be attached to a report within two hours.

### Accessibility
The interface includes keyboard skip navigation, visible focus styles, semantic landmarks, reduced-motion support, and screen-reader announcements for recording/upload status. Accessibility improvements target WCAG 2.2 AA practices; the project has not undergone a formal conformance audit.

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
npm test -- --watchAll=false
```

## Maintenance Scripts (backend/scripts/)
- `bootstrap-admin.js "Name" "email" "password"` — one-time Admin account creation
- `anonymize-expired.js [retentionDays=90]` — severs the identity link on long-resolved Path B reports past the retention window (skips cases flagged under legal hold); intended to be run periodically (e.g. via a scheduled task), not automatically

## Project Structure
```
backend/      Express API, MongoDB models, GridFS evidence storage, tests
frontend/     React single-page app
agency-portal/  Standalone demo site simulating an external agency's case view (concept prototype only)
Docs/         Proposal, literature review, methodology, and the full design-decision narrative
```

## Known, Honest Limitations
- The malware scan on evidence uploads checks for the EICAR test signature only (a real deployment would run a dedicated engine such as ClamAV)
- Evidence is stored and downloaded byte-for-byte as uploaded. Original photos/documents may contain GPS, device, author, or other identifying metadata; reporters who need anonymity should remove that metadata before upload.
- Password-reset and status-change emails send over real SMTP to a disposable Ethereal sandbox inbox, not a real mail provider (no production email credentials are available to this project)
- The Agency Partner Portal is a labelled concept/demo prototype — there is no live integration with any real government institution
- The current classifier is a keyword-based triage aid, not a trained or validated machine-learning model. The repository contains no approved labeled training dataset, so no model-performance claims should be made or the suggestions used as automated enforcement decisions.
- Report intake normalizes whitespace and Unicode for structured fields, validates dates and category-specific values, and leaves optional facts blank when they are not provided. It does not impute allegations, dates, identities, or demographics. Training-data cleaning and imputation must be designed against the actual, approved dataset; missing target labels must not be invented, and any feature imputation must be fitted on training data only.
- Report deletion is an Admin-only soft archive. It hides the report from active views and public statistics while retaining the record and evidence for audit; reports under legal hold cannot be archived.
- Admins can restore archived reports or permanently delete an archived report and its GridFS file/chunks (permanent deletion is blocked by legal hold). User deletion removes the account and clears that account's identity references from retained reports and audit entries.
- The dashboard lists refresh from MongoDB-backed API endpoints every 10 seconds so changes made by another administrator or process become visible without reloading the whole site.

---

This project is developed for academic purposes by Benvictor Mwangi (155499), Strathmore University.
