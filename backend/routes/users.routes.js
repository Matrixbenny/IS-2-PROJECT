const express = require('express');
const crypto = require('crypto');
const User = require('../user.model');
const Report = require('../report.model');
const { deleteUserAccount } = require('../utils/deleteCitizenAccount');
const { requireRole } = require('../middleware/auth');
const { normalizeEmail, getConfiguredAdminEmail, isConfiguredAdminEmail } = require('../utils/adminIdentity');
const { AGENCIES, slugify } = require('../utils/agencies');
const { hashSecret } = require('../utils/tracking');
const { getBucket } = require('../utils/reviewerApplicationDocuments');
const { RESERVED_EMAIL_ERROR, isBlockedAccountEmail } = require('../utils/developerIdentity');
const mailer = require('../utils/mailer');
const { UncompressedZipWriter } = require('../utils/zipArchive');

const router = express.Router();

const PUBLIC_USER_FIELDS = 'name email role agencySlug agencyVerificationReference agencyInvitationAcceptedAt isActive emailNotificationsOptIn smsNotificationsOptIn phoneNumber reviewerApplicationStatus reviewerApplicationNote reviewerApplicationReviewedAt reviewerApplicationReviewedBy reviewerApplicationRejectionReason reviewerApplicationDocuments reviewerApplicationDocumentsRetained createdAt';

// The exact next steps a newly approved Reviewer receives (decision #35).
// Kept in one place so the email and the Admin screen never disagree.
function buildReviewerWayForward(application) {
  const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
  const signInUrl = new URL('/login', frontendOrigin).toString();
  return {
    signInUrl,
    steps: [
      'Sign in at the Kenya Watch website with the email address and password you used when you applied.',
      'Open the Reviewer Queue from the navigation. Your account already has Reviewer access.',
      'Read the Reviewer category-labeling guide (ml/LABELING_GUIDE.md) before your first independent category review.',
      'Claim a case before working on it so two reviewers never duplicate work on the same report.',
      'Record your own category assessment first. The reporter category, the keyword triage and the experimental model suggestion stay hidden until you submit it.',
      'Keep identities safe: never copy a reporter\'s narrative, evidence or identity into an email, chat or agency brief.',
      'If you also hold a citizen account on this platform, you will never be shown your own reports in the review workflow.'
    ]
  };
}

// Sent automatically when the Admin hits Approve. The decision itself is already
// saved, so a mail failure is reported to the Admin instead of failing the call.
async function sendReviewerDecisionEmail(application, { approved }) {
  const { signInUrl, steps } = buildReviewerWayForward(application);
  const subject = approved
    ? 'Kenya Watch: your Reviewer application is approved - next steps'
    : 'Kenya Watch: your Reviewer application was not approved';
  const text = approved ? [
    `Hello ${application.name.split(/\s+/)[0]},`,
    '',
    'Your Kenya Watch Reviewer application has been approved.',
    '',
    'What happens next:',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `Sign in here: ${signInUrl}`,
    '',
    'Your application documents (CV and proof of qualification) are kept on file for this project\'s verification record.',
    'If you did not apply to be a Kenya Watch Reviewer, contact the project Admin immediately.',
    '',
    '- Kenya Watch'
  ].join('\n') : [
    `Hello ${application.name.split(/\s+/)[0]},`,
    '',
    'Thank you for applying to become a Kenya Watch Reviewer. Your application was not approved at this time.',
    application.reviewerApplicationRejectionReason ? `Reason: ${application.reviewerApplicationRejectionReason}` : '',
    '',
    'You are welcome to submit a new application with updated documents.',
    '',
    '- Kenya Watch'
  ].filter(Boolean).join('\n');

  try {
    const info = await mailer.sendMail({ to: application.email, subject, text });
    return { status: 'sent', messageId: info.messageId };
  } catch (error) {
    console.error('[reviewer application] decision email failed:', error.message);
    return { status: 'failed', error: error.message };
  }
}

function buildAgencySetupUrl(email, token) {
  const frontendOrigin = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
  const setupUrl = new URL('/reset-password', frontendOrigin);
  setupUrl.searchParams.set('email', email);
  setupUrl.searchParams.set('token', token);
  return setupUrl.toString();
}

// GET /api/users - Admin-only directory of all accounts (decision #15).
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'reviewer_pending' } }).select(PUBLIC_USER_FIELDS).sort({ createdAt: -1 });
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reviewer-applications', requireRole('admin'), async (req, res) => {
  try {
    // Approved reviewers stay listed (decision #34) so their retained documents
    // remain reachable after the decision, not only while pending.
    const applications = await User.find({
      $or: [
        { role: 'reviewer_pending' },
        { role: 'reviewer', reviewerApplicationDocuments: { $exists: true, $ne: [] } }
      ]
    })
      .select('name email reviewerApplicationStatus reviewerApplicationNote reviewerApplicationDocuments reviewerApplicationReviewedAt reviewerApplicationReviewedBy reviewerApplicationRejectionReason createdAt')
      .populate('reviewerApplicationReviewedBy', 'name email')
      .sort({ createdAt: -1 });
    return res.json(applications);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load reviewer applications.' });
  }
});

router.get('/:id/reviewer-application/documents/:documentId', requireRole('admin'), async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.documentId)) {
      return res.status(404).json({ error: 'Application document not found' });
    }
    // Reachable after the decision too, so the Admin can re-open the exact file
    // a Reviewer submitted at any point in the future (decision #34).
    const application = await User.findOne({
      _id: req.params.id,
      role: { $in: ['reviewer_pending', 'reviewer'] }
    });
    if (!application) return res.status(404).json({ error: 'Reviewer application not found' });
    const document = application.reviewerApplicationDocuments.find(
      (item) => item.gridFsId.toString() === req.params.documentId
    );
    if (!document) return res.status(404).json({ error: 'Application document not found' });

    const storedFile = await getBucket().find({ _id: document.gridFsId }).next();
    if (!storedFile) return res.status(404).json({ error: 'Application document is missing from storage' });
    document.viewedAt = new Date();
    document.viewedBy = req.user._id;
    await application.save();
    // Serve the stored bytes with the exact original filename and type, so the
    // Admin receives a byte-identical copy of the submitted PDF.
    res.type(storedFile.contentType || 'application/pdf');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Length', String(storedFile.length));
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`);
    getBucket().openDownloadStream(document.gridFsId)
      .on('error', (error) => {
        console.error('[reviewer application] document download failed:', error.message);
        if (!res.headersSent) res.status(500).json({ error: 'Could not download the application document.' });
        else res.destroy(error);
      })
      .pipe(res);
  } catch (err) {
    console.error('[reviewer application] document lookup failed:', err.message);
    return res.status(500).json({ error: 'Could not retrieve the application document.' });
  }
});

// GET /api/users/agency-applications - self-submitted agency officer applications.
// Pending first, then decided ones, so the Admin works through the newest queue.
router.get('/agency-applications', requireRole('admin'), async (req, res) => {
  try {
    const applications = await User.find({ role: 'agency', agencyApplicationStatus: { $ne: null } })
      .select('name email agencySlug agencyApplicationStatus agencyApplicationStaffNumber agencyApplicationJobTitle agencyApplicationDutyStation agencyApplicationOfficialEmail agencyApplicationJustification agencyApplicationDeclaredAt agencyApplicationDocuments agencyApplicationScreening agencyApplicationVerificationSteps agencyApplicationRejectionReason agencyApplicationReviewedAt createdAt')
      .populate('agencyApplicationReviewedBy', 'name email')
      .sort({ createdAt: -1 });
    const rank = { pending: 0, rejected: 1, approved: 2 };
    applications.sort((a, b) => (rank[a.agencyApplicationStatus] ?? 3) - (rank[b.agencyApplicationStatus] ?? 3));
    return res.json(applications);
  } catch (err) {
    console.error('[agency application] listing failed:', err.message);
    return res.status(500).json({ error: 'Could not load agency applications.' });
  }
});

// GET /api/users/:id/agency-application/documents/:documentId - the submitted
// authorisation letter or staff ID, so the Admin verifies the real document.
router.get('/:id/agency-application/documents/:documentId', requireRole('admin'), async (req, res) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.documentId)) {
      return res.status(404).json({ error: 'Application document not found' });
    }
    const application = await User.findOne({ _id: req.params.id, role: 'agency' });
    if (!application) return res.status(404).json({ error: 'Agency application not found' });
    const document = (application.agencyApplicationDocuments || [])
      .find((item) => item.gridFsId.toString() === req.params.documentId);
    if (!document) return res.status(404).json({ error: 'Application document not found' });

    const storedFile = await getBucket().find({ _id: document.gridFsId }).next();
    if (!storedFile) return res.status(404).json({ error: 'Application document is missing from storage' });
    document.viewedAt = new Date();
    document.viewedBy = req.user._id;
    await application.save();

    res.type(storedFile.contentType || 'application/pdf');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Length', String(storedFile.length));
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`);
    getBucket().openDownloadStream(document.gridFsId)
      .on('error', (error) => {
        console.error('[agency application] document download failed:', error.message);
        if (!res.headersSent) res.status(500).json({ error: 'Could not download the application document.' });
        else res.destroy(error);
      })
      .pipe(res);
  } catch (err) {
    console.error('[agency application] document lookup failed:', err.message);
    return res.status(500).json({ error: 'Could not retrieve the application document.' });
  }
});

// PATCH /api/users/:id/agency-application - the Admin's decision. Approval is
// the grant of access, so it requires an explicit verification reference and a
// personal attestation that identity, employment and legal authority were
// checked through an official channel.
router.patch('/:id/agency-application', requireRole('admin'), async (req, res) => {
  try {
    const { decision, rejectionReason, verificationReference, identityVerified, verificationSteps } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }
    const application = await User.findOne({
      _id: req.params.id,
      role: 'agency',
      agencyApplicationStatus: 'pending'
    });
    if (!application) return res.status(404).json({ error: 'Pending agency application not found' });

    if (decision === 'approved') {
      if (identityVerified !== true) {
        return res.status(400).json({
          error: 'Confirm that you verified this officer\'s identity, employment and legal authority through an official channel.'
        });
      }
      if (typeof verificationReference !== 'string' || !verificationReference.trim()) {
        return res.status(400).json({ error: 'Record how the officer was verified (for example the officer verification form reference).' });
      }
      if (verificationReference.trim().length > 200) {
        return res.status(400).json({ error: 'The verification reference must be 200 characters or fewer.' });
      }
      // The Kenya public-service verification checklist. Every step must be
      // completed and recorded — approval is rejected otherwise. These are the
      // checks a real Kenyan institution performs before authorising an officer
      // to receive third-party case information.
      const REQUIRED_STEPS = [
        { key: 'institution_contact', label: 'Contacted the institution through its official switchboard or published liaison contacts (not numbers/addresses provided only by the applicant).' },
        { key: 'employment_confirmed', label: 'Confirmed with HR/registry that the named officer is employed, in the stated job title, at the stated duty station.' },
        { key: 'staff_number_checked', label: 'Confirmed the staff/service number against the institution\'s records.' },
        { key: 'authorisation_letter_confirmed', label: 'Confirmed with the signatory or registry that the authorisation letter is genuine and currently valid.' },
        { key: 'identity_document_checked', label: 'Compared the staff ID against institutional records (photo, name, number).' },
        { key: 'official_email_confirmed', label: 'Confirmed the work email address exists on the institution\'s domain by contacting the officer through it.' },
        { key: 'authority_scope_confirmed', label: 'Confirmed the officer\'s role legally permits receiving third-party corruption case information (e.g. an investigator or authorised liaison).' }
      ];
      const provided = Array.isArray(verificationSteps) ? verificationSteps : [];
      const missing = REQUIRED_STEPS.filter((step) => {
        const match = provided.find((p) => p.key === step.key);
        return !match || match.done !== true;
      }).map((step) => step.key);
      if (missing.length) {
        return res.status(400).json({
          error: 'Complete every verification step before approving.',
          missingSteps: missing
        });
      }
      application.agencyApplicationStatus = 'approved';
      application.agencyVerificationReference = verificationReference.trim();
      application.agencyVerifiedBy = req.user._id;
      application.agencyVerifiedAt = new Date();
      application.agencyApplicationRejectionReason = null;
      // Keep an immutable record of exactly what was checked, by whom, and when.
      application.agencyApplicationVerificationSteps = REQUIRED_STEPS.map((step) => {
        const match = provided.find((p) => p.key === step.key);
        return { key: step.key, done: true, note: (match?.note || '').trim().slice(0, 300) };
      });
      // The officer already chose their own password at application time, so
      // activation is immediate and no setup link has to be delivered.
      application.isActive = true;
      application.agencyInvitationAcceptedAt = application.agencyInvitationAcceptedAt || new Date();
    } else {
      const reason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';
      if (reason.length < 10) {
        return res.status(400).json({ error: 'Give a plain-language reason (at least 10 characters) for rejecting this application.' });
      }
      application.agencyApplicationStatus = 'rejected';
      application.agencyApplicationRejectionReason = reason;
      application.isActive = false;
    }
    application.agencyApplicationReviewedBy = req.user._id;
    application.agencyApplicationReviewedAt = new Date();
    await application.save();

    try {
      mailer.sendMail({
        to: application.email,
        subject: decision === 'approved'
          ? 'Your Kenya Watch agency officer account is approved'
          : 'Your Kenya Watch agency officer application was not approved',
        text: decision === 'approved'
          ? 'Your agency officer account has been verified and activated. You can now sign in to the Kenya Watch Agency Case Portal.'
          : `Your agency officer application was not approved. Reason: ${application.agencyApplicationRejectionReason}`
      }).catch(() => {});
    } catch (mailError) {
      // The decision is already saved; a failed email must not undo it.
    }

    return res.json({
      message: decision === 'approved' ? 'Agency officer approved and activated.' : 'Agency application rejected.',
      application: {
        _id: application._id,
        name: application.name,
        email: application.email,
        agencyApplicationStatus: application.agencyApplicationStatus,
        isActive: application.isActive
      }
    });
  } catch (err) {
    console.error('[agency application] decision failed:', err.message);
    return res.status(500).json({ error: 'Could not save the agency application decision.' });
  }
});

// GET /api/users/:id/reviewer-application - the retained application record for
// an approved or pending reviewer (documents included, exact filenames/sizes).
router.get('/:id/reviewer-application', requireRole('admin'), async (req, res) => {
  try {
    const reviewer = await User.findOne({
      _id: req.params.id,
      role: { $in: ['reviewer_pending', 'reviewer'] }
    })
      .select('name email role reviewerApplicationStatus reviewerApplicationNote reviewerApplicationDocuments reviewerApplicationDocumentsRetained reviewerApplicationReviewedAt reviewerApplicationReviewedBy reviewerApplicationRejectionReason')
      .populate('reviewerApplicationReviewedBy', 'name email');
    if (!reviewer) return res.status(404).json({ error: 'Reviewer record not found' });
    return res.json(reviewer);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load the reviewer application record.' });
  }
});

// GET /api/users/:id/reviewer-file-pack - all retained application documents for
// one reviewer as an uncompressed ZIP, each file stored as submitted (decision #34).
router.get('/:id/reviewer-file-pack', requireRole('admin'), async (req, res) => {
  try {
    const reviewer = await User.findOne({
      _id: req.params.id,
      role: { $in: ['reviewer_pending', 'reviewer'] }
    }).select('name email reviewerApplicationDocuments');
    if (!reviewer) return res.status(404).json({ error: 'Reviewer not found' });
    const documents = reviewer.reviewerApplicationDocuments || [];
    if (!documents.length) return res.status(404).json({ error: 'No application documents are retained for this reviewer.' });

    const bucket = getBucket();
    const archive = new UncompressedZipWriter();
    const safeName = reviewer.name.normalize('NFC').replace(/[^\w.-]+/g, '-').slice(0, 60) || 'reviewer';
    for (const document of documents) {
      const storedFile = await bucket.find({ _id: document.gridFsId }).next();
      if (!storedFile) continue;
      const buffer = await new Promise((resolve, reject) => {
        const chunks = [];
        bucket.openDownloadStream(document.gridFsId)
          .on('data', (chunk) => chunks.push(chunk))
          .on('error', reject)
          .on('end', () => resolve(Buffer.concat(chunks)));
      });
      archive.addFile(`${document.kind}-${document.filename}`, buffer);
    }
    const zip = archive.finish();
    res.type('application/zip');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', `attachment; filename="${safeName}-reviewer-documents.zip"`);
    return res.send(zip);
  } catch (err) {
    console.error('[reviewer application] file pack failed:', err.message);
    return res.status(500).json({ error: 'Could not build the reviewer document pack.' });
  }
});

router.get('/agency-options', requireRole('admin'), (req, res) => {
  return res.json({
    agencies: AGENCIES.map((agency) => ({ name: agency.name, slug: slugify(agency.name) }))
  });
});

router.patch('/:id/reviewer-application', requireRole('admin'), async (req, res) => {
  try {
    const { decision, reason, documentsVerified } = req.body || {};
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'Choose approve or reject' });
    }
    const cleanReason = typeof reason === 'string' ? reason.normalize('NFC').trim() : '';
    if (decision === 'reject' && (cleanReason.length < 10 || cleanReason.length > 1000)) {
      return res.status(400).json({ error: 'Provide a rejection reason between 10 and 1000 characters' });
    }

    const application = await User.findOne({
      _id: req.params.id,
      role: 'reviewer_pending',
      reviewerApplicationStatus: 'pending'
    });
    if (!application) return res.status(404).json({ error: 'Pending reviewer application not found' });
    const hasRequiredDocuments = ['cv', 'qualification'].every((kind) => (
      application.reviewerApplicationDocuments.some((document) => (
        document.kind === kind &&
        document.viewedAt &&
        document.viewedBy?.toString() === req.user._id.toString()
      ))
    ));
    if (decision === 'approve' && (documentsVerified !== true || !hasRequiredDocuments)) {
      return res.status(400).json({
        error: 'Open and verify both required application documents before approving this Reviewer.'
      });
    }

    // Decision #34: the original CV/qualification PDFs are kept, byte-for-byte,
    // in the reviewerApplications GridFS bucket. Admins can re-open them at any
    // time from the reviewer record, and the file a reviewer submitted is the
    // exact file the Admin later inspects - no re-encoding, no renames.
    application.reviewerApplicationStatus = decision === 'approve' ? 'approved' : 'rejected';
    application.reviewerApplicationReviewedBy = req.user._id;
    application.reviewerApplicationReviewedAt = new Date();
    application.reviewerApplicationRejectionReason = decision === 'reject' ? cleanReason : null;
    application.isActive = decision === 'approve';
    application.reviewerApplicationDocumentsRetained = true;
    if (decision === 'approve') {
      application.role = 'reviewer';
      application.reviewerApplicationDocumentsVerifiedAt = new Date();
      application.reviewerApplicationDocumentsVerifiedBy = req.user._id;
    }
    await application.save();

    // Decision #35: the "way forward" email is sent the moment the Admin
    // approves, not by a later manual step. A send failure is reported to the
    // Admin (so they can retry) but never rolls back the approval.
    let decisionEmail;
    if (decision === 'approve') {
      decisionEmail = await sendReviewerDecisionEmail(application, { approved: true });
    }

    return res.json({
      _id: application._id,
      id: application._id,
      name: application.name,
      email: application.email,
      role: application.role,
      isActive: application.isActive,
      reviewerApplicationStatus: application.reviewerApplicationStatus,
      reviewerApplicationReviewedAt: application.reviewerApplicationReviewedAt,
      reviewerApplicationRejectionReason: application.reviewerApplicationRejectionReason,
      decisionEmail: decisionEmail || null
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not update the reviewer application.' });
  }
});

// POST /api/users/agency-invitations - create a named, agency-scoped account after external identity verification.
router.post('/agency-invitations', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, agencySlug, verificationReference, identityVerified } = req.body || {};
    if (identityVerified !== true) {
      return res.status(400).json({ error: 'Confirm that the person and agency affiliation were verified through an official channel' });
    }
    const agency = AGENCIES.find((item) => slugify(item.name) === agencySlug);
    if (!agency) return res.status(400).json({ error: 'Select an agency from the approved list' });
    if (typeof name !== 'string' || typeof email !== 'string' || typeof verificationReference !== 'string') {
      return res.status(400).json({ error: 'Name, email and verification reference are required' });
    }
    const cleanName = name.normalize('NFC').trim();
    const cleanEmail = normalizeEmail(email);
    const cleanVerificationReference = verificationReference.normalize('NFC').trim();
    if (!cleanName || cleanName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid name and email address' });
    }
    if (!cleanVerificationReference || cleanVerificationReference.length > 200) {
      return res.status(400).json({ error: 'Provide a verification reference (200 characters or fewer)' });
    }
    if (isBlockedAccountEmail(cleanEmail)) {
      return res.status(409).json({ error: RESERVED_EMAIL_ERROR });
    }
    if (cleanEmail === getConfiguredAdminEmail()) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    if (await User.exists({ email: cleanEmail })) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const user = new User({
      name: cleanName,
      email: cleanEmail,
      password: crypto.randomBytes(48).toString('base64url'),
      role: 'agency',
      agencySlug,
      agencyVerificationReference: cleanVerificationReference,
      agencyVerifiedBy: req.user._id,
      agencyVerifiedAt: new Date(),
      resetPasswordTokenHash: await hashSecret(token),
      resetPasswordExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isActive: false
    });
    await user.save();

    return res.status(201).json({
      _id: user._id,
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      agencySlug: user.agencySlug,
      agencyVerificationReference: user.agencyVerificationReference,
      agencyInvitationAcceptedAt: user.agencyInvitationAcceptedAt,
      isActive: user.isActive,
      setupUrl: buildAgencySetupUrl(user.email, token)
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

router.post('/:id/agency-invitation', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      role: 'agency',
      isActive: false,
      agencyInvitationAcceptedAt: null
    });
    if (!user) return res.status(404).json({ error: 'Pending agency invitation not found' });

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordTokenHash = await hashSecret(token);
    user.resetPasswordExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    return res.json({ setupUrl: buildAgencySetupUrl(user.email, token) });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/users - Admin provisions Reviewer accounts; the configured Admin is bootstrapped out of band.
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, password, role = 'reviewer' } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password and role are required' });
    }
    if (role !== 'reviewer') {
      return res.status(403).json({ error: 'Admin accounts can only be created through the configured bootstrap process' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const cleanName = String(name).normalize('NFC').trim();
    const cleanEmail = normalizeEmail(email);
    if (!cleanName || cleanName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid name and email address' });
    }
    if (isBlockedAccountEmail(cleanEmail)) {
      return res.status(409).json({ error: RESERVED_EMAIL_ERROR });
    }
    if (cleanEmail === getConfiguredAdminEmail()) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({ name: cleanName, email: cleanEmail, password, role });
    await user.save();
    return res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/users/:id - Admin edits account details without changing credentials.
router.patch('/:id', requireRole('admin'), async (req, res) => {
  try {
    const { name, email, emailNotificationsOptIn } = req.body || {};
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) return res.status(404).json({ error: 'User not found' });
    if (existingUser.role === 'agency' && (name !== undefined || email !== undefined)) {
      return res.status(409).json({ error: 'Agency identity changes require a new verification and onboarding process' });
    }
    const updates = {};
    if (name !== undefined) {
      if (typeof name !== 'string') return res.status(400).json({ error: 'Name must be text' });
      const cleanName = name.normalize('NFC').trim();
      if (!cleanName || cleanName.length > 120) return res.status(400).json({ error: 'Name must be between 1 and 120 characters' });
      updates.name = cleanName;
    }
    if (email !== undefined) {
      if (typeof email !== 'string') return res.status(400).json({ error: 'Email must be text' });
      const cleanEmail = normalizeEmail(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter a valid email address' });
      if ((existingUser.role === 'admin' && !isConfiguredAdminEmail(cleanEmail)) ||
        (existingUser.role !== 'admin' && cleanEmail === getConfiguredAdminEmail())) {
        return res.status(409).json({ error: 'The configured Admin email cannot be reassigned' });
      }
      if (existingUser.role !== 'admin' && isBlockedAccountEmail(cleanEmail)) {
        return res.status(409).json({ error: RESERVED_EMAIL_ERROR });
      }
      updates.email = cleanEmail;
    }
    if (emailNotificationsOptIn !== undefined) {
      if (typeof emailNotificationsOptIn !== 'boolean') {
        return res.status(400).json({ error: 'Email notification preference must be true or false' });
      }
      updates.emailNotificationsOptIn = emailNotificationsOptIn;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Provide at least one account field to update' });

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, {
      returnDocument: 'after',
      runValidators: true,
      select: PUBLIC_USER_FIELDS
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    return res.status(400).json({ error: err.message });
  }
});

// PATCH /api/users/:id/role - Admin can move accounts between user and reviewer, never grant Admin access.
router.patch('/:id/role', requireRole('admin'), async (req, res) => {
  try {
    const { role } = req.body || {};
    if (!['user', 'reviewer'].includes(role)) {
      return res.status(403).json({ error: 'Admin and agency roles can only be granted through their authorized onboarding process' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') {
      return res.status(409).json({ error: 'The configured Admin account cannot be demoted' });
    }
    if (user.role === 'agency') {
      return res.status(409).json({ error: 'Agency accounts must be deactivated, not converted to another role' });
    }
    user.role = role;
    await user.save();
    return res.json({ id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/active', requireRole('admin'), async (req, res) => {
  try {
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'isActive must be true or false' });
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'agency', agencyInvitationAcceptedAt: { $ne: null } },
      { $set: { isActive } },
      { returnDocument: 'after', select: PUBLIC_USER_FIELDS }
    );
    if (!user) return res.status(404).json({ error: 'Agency account not found' });
    return res.json(user);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// DELETE /api/users/:id - removes non-admin accounts and anonymizes their retained report references.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(409).json({ error: 'You cannot delete the Admin account you are currently using' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') {
      return res.status(409).json({ error: 'The configured Admin account cannot be deleted here' });
    }
    if (user.role === 'agency') {
      if (!user.agencyInvitationAcceptedAt) {
        await User.deleteOne({ _id: user._id });
        return res.status(204).end();
      }
      return res.status(409).json({ error: 'Agency audit history must be preserved; deactivate the account instead' });
    }

    const userId = user._id;
    await deleteUserAccount(userId);
    return res.status(204).end();
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete the user and anonymize its report references.' });
  }
});

module.exports = router;
