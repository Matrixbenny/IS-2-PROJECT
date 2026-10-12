# Kenya Watch

A machine learning-assisted web platform for anonymous reporting and tracking of corruption cases in Kenya. Final year Information Systems project (BBT4300), Strathmore University, School of Computing and Engineering Sciences.

Citizens can report corruption either fully anonymously (no account, tracked later via a **Tracking Reference + secret Access Key**) or through an optional account (**Path B**, unlocking a private "My Reports" view). Reports are triaged by Reviewers with ML-assisted classification, can be referred to the relevant oversight agency, and resolution outcomes are tracked back to the reporter — all without ever requiring or exposing a reporter's identity.

See [Docs/my IS story.md](Docs/my%20IS%20story.md) for the full set of 30 researched, legally-grounded design decisions behind this system.

## Features
- Anonymous (Path A) or optional-account (Path B) corruption reporting, with category-specific fields grounded in the Anti-Corruption and Economic Crimes Act
- Evidence upload (images/video/audio/documents) via MongoDB GridFS, with automatic EXIF/metadata stripping and malware-signature scanning
- Tracking Reference + Access Key capability-based case tracking for anonymous reporters, with a general/deep visibility split
- Lightweight keyword-based ML classification (category + urgency), running asynchronously so it never blocks submission
- Reviewer Queue: claim cases, update status (resolution requires a note + reference), refer to an Agency/Institution, link related cases
- Admin: provision Reviewer/Admin accounts, escalation alerts for unclaimed high-urgency cases, data-retention/anonymization tooling
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
This project expects MongoDB on port **27018** (not the default 27017), with data stored locally:
```powershell
& "C:\Program Files\MongoDB\Server\<version>\bin\mongod.exe" --dbpath "<repo>\backend\data" --port 27018
```

### 2. Backend
```powershell
cd backend
npm install
```
Copy `.env` (already present for local dev) and adjust as needed:
```
PORT=5000
MONGO_URI=mongodb://localhost:27018/kenya_watch
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
- Password-reset and status-change emails send over real SMTP to a disposable Ethereal sandbox inbox, not a real mail provider (no production email credentials are available to this project)
- The Agency Partner Portal is a labelled concept/demo prototype — there is no live integration with any real government institution

---

This project is developed for academic purposes by Benvictor Mwangi (155499), Strathmore University.
