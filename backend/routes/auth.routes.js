const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const User = require('../user.model');
const { signToken } = require('../utils/jwt');
const { hashSecret, verifySecret } = require('../utils/tracking');
const { normalizeEmail, getConfiguredAdminEmail, isConfiguredAdminEmail } = require('../utils/adminIdentity');
const { verifyAdminPassword } = require('../utils/adminPassword');
const mailer = require('../utils/mailer');
const { attachUser, requireAuth } = require('../middleware/auth');
const { validatePdf, storeDocument, deleteDocuments } = require('../utils/reviewerApplicationDocuments');
const { deleteUserAccount } = require('../utils/deleteCitizenAccount');
const { RESERVED_EMAIL_ERROR, isBlockedAccountEmail } = require('../utils/developerIdentity');
const { isStrongPassword, PASSWORD_ERROR } = require('../utils/passwordPolicy');
const { AGENCIES, slugify } = require('../utils/agencies');

const router = express.Router();
const reviewerApplicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 2, fileSize: 10 * 1024 * 1024, fields: 4, fieldSize: 2000 }
}).fields([
  { name: 'cv', maxCount: 1 },
  { name: 'qualification', maxCount: 1 }
]);

const COOKIE_NAME = 'kw_token';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
});

// Public self-registration always creates a 'user' role account (decision #15).
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, emailNotificationsOptIn } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (typeof email !== 'string' || typeof password !== 'string' || !isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_ERROR });
    }
    const cleanEmail = normalizeEmail(email);
    if (isBlockedAccountEmail(cleanEmail)) {
      return res.status(409).json({ error: RESERVED_EMAIL_ERROR });
    }
    if (cleanEmail === getConfiguredAdminEmail()) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({
      name,
      email: cleanEmail,
      password,
      emailNotificationsOptIn: !!emailNotificationsOptIn
    });
    await user.save();

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('[authentication] registration failed:', err.message);
    return res.status(500).json({ error: 'Unable to create the account. Please try again later.' });
  }
});

router.post('/reviewer-application', (req, res, next) => {
  reviewerApplicationUpload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Each reviewer application PDF must be 10 MB or smaller.' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Upload one CV/resume PDF and one qualification/training PDF.' });
    }
    return res.status(400).json({ error: 'Could not read the reviewer application files.' });
  });
}, async (req, res) => {
  const storedDocuments = [];
  try {
    const { name, email, password, applicationNote } = req.body || {};
    const cv = req.files?.cv?.[0];
    const qualification = req.files?.qualification?.[0];
    if (
      typeof name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof applicationNote !== 'string'
    ) {
      return res.status(400).json({ error: 'Name, email, password, and application statement are required' });
    }
    if (!cv || !qualification) {
      return res.status(400).json({ error: 'Upload both a CV/resume and proof of relevant qualification or training.' });
    }
    if (!validatePdf(cv) || !validatePdf(qualification)) {
      return res.status(400).json({ error: 'Both documents must be valid PDF files.' });
    }

    const cleanName = name.normalize('NFC').trim();
    const cleanEmail = normalizeEmail(email);
    const cleanNote = applicationNote.normalize('NFC').trim();
    if (!cleanName || cleanName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid name and email address' });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: PASSWORD_ERROR });
    }
    if (cleanNote.length < 30 || cleanNote.length > 1000) {
      return res.status(400).json({ error: 'Application statement must be between 30 and 1000 characters' });
    }
    if (isBlockedAccountEmail(cleanEmail)) {
      return res.status(409).json({ error: RESERVED_EMAIL_ERROR });
    }
    if (cleanEmail === getConfiguredAdminEmail()) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const existing = await User.findOne({ email: cleanEmail });
    if (existing && !(existing.role === 'reviewer_pending' && existing.reviewerApplicationStatus === 'rejected')) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    storedDocuments.push(await storeDocument(cv, 'cv'));
    storedDocuments.push(await storeDocument(qualification, 'qualification'));

    // Same authenticity screening as agency applications - a reviewer position
    // is at least as sensitive, and document recycling is equally possible.
    const DocumentFingerprint = require('../documentFingerprint.model');
    const { screenApplicationDocument } = require('../utils/documentScreening');
    const reviewerScreening = [];
    for (const [file, kind] of [[cv, 'cv'], [qualification, 'qualification']]) {
      const record = await screenApplicationDocument(file, { DocumentFingerprint });
      reviewerScreening.push({ kind, ...record });
      await DocumentFingerprint.updateOne(
        { fingerprint: record.fingerprint },
        { $setOnInsert: { fingerprint: record.fingerprint, kind, applicantEmail: cleanEmail, applicationRole: 'reviewer' } },
        { upsert: true }
      );
    }
    if (existing) {
      existing.name = cleanName;
      existing.password = password;
      existing.reviewerApplicationNote = cleanNote;
      existing.reviewerApplicationStatus = 'pending';
      existing.reviewerApplicationReviewedBy = null;
      existing.reviewerApplicationReviewedAt = null;
      existing.reviewerApplicationRejectionReason = null;
      existing.reviewerApplicationDocuments = storedDocuments;
      existing.reviewerApplicationScreening = reviewerScreening;
      existing.reviewerApplicationDocumentsVerifiedAt = null;
      existing.reviewerApplicationDocumentsVerifiedBy = null;
      existing.isActive = false;
      await existing.save();
    } else {
      await User.create({
        name: cleanName,
        email: cleanEmail,
        password,
        role: 'reviewer_pending',
        isActive: false,
        reviewerApplicationStatus: 'pending',
        reviewerApplicationNote: cleanNote,
        reviewerApplicationDocuments: storedDocuments,
        reviewerApplicationScreening: reviewerScreening
      });
    }

    storedDocuments.length = 0;
    return res.status(202).json({
      message: 'Your reviewer application is awaiting Admin approval. You cannot sign in as a reviewer until it is approved.'
    });
  } catch (err) {
    try {
      await deleteDocuments(storedDocuments);
    } catch (cleanupError) {
      console.error('[authentication] reviewer application upload cleanup failed:', cleanupError.message);
    }
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error('[authentication] reviewer application failed:', err.message);
    return res.status(500).json({ error: 'Unable to submit the reviewer application. Please try again later.' });
  }
});

// POST /api/auth/agency-application - an agency officer applies for their own
// account. Nothing is granted here: the account is created inactive and an
// Admin must verify identity, employment and legal authority before approval.
// Kenyan public bodies confirm authority through an official channel (a signed
// authorisation letter on institutional letterhead plus a staff/service number),
// so those are required rather than a self-declared claim.
const agencyApplicationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 2, fileSize: 10 * 1024 * 1024, fields: 12, fieldSize: 4000 }
}).fields([
  { name: 'authorisationLetter', maxCount: 1 },
  { name: 'staffId', maxCount: 1 }
]);

router.post('/agency-application', (req, res, next) => {
  agencyApplicationUpload(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Each agency application document must be 10 MB or smaller.' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Attach the authorisation letter and the staff identity document.' });
    }
    return res.status(400).json({ error: 'Could not read the agency application files.' });
  });
}, async (req, res) => {
  const storedDocuments = [];
  try {
    const {
      name, email, password, agencySlug, staffNumber, jobTitle, dutyStation,
      officialEmail, justification, declaration
    } = req.body || {};
    const authorisationLetter = req.files?.authorisationLetter?.[0];
    const staffId = req.files?.staffId?.[0];

    if (!['name', 'email', 'password', 'agencySlug', 'staffNumber', 'jobTitle', 'dutyStation', 'officialEmail', 'justification', 'declaration']
      .every((field) => typeof req.body?.[field] === 'string')) {
      return res.status(400).json({ error: 'Complete every field in the agency officer application.' });
    }
    // Explicit, recorded acknowledgement - the officer attests that their work is
    // lawfully authorised and that they will handle referred information only for
    // official purposes. Kept plain so it is genuinely understood, not just clicked.
    if (declaration !== 'true') {
      return res.status(400).json({
        error: 'You must confirm that you are authorised by your institution to handle referred cases for official purposes.'
      });
    }
    const agency = AGENCIES.find((item) => slugify(item.name) === agencySlug);
    if (!agency) return res.status(400).json({ error: 'Select your institution from the approved partner list.' });
    if (!isStrongPassword(password)) return res.status(400).json({ error: PASSWORD_ERROR });
    if (!authorisationLetter || !staffId) {
      return res.status(400).json({ error: 'Attach both an institutional authorisation letter and a staff identity document.' });
    }
    if (!validatePdf(authorisationLetter) || !validatePdf(staffId)) {
      return res.status(400).json({ error: 'Both documents must be valid PDF files.' });
    }

    const cleanName = name.normalize('NFC').trim();
    const cleanEmail = normalizeEmail(email);
    const cleanOfficialEmail = normalizeEmail(officialEmail);
    if (!cleanName || cleanName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Enter a valid full name and email address.' });
    }
    // A government/institutional mailbox is an independent corroboration of
    // affiliation, so a non-institutional address is refused outright.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanOfficialEmail)) {
      return res.status(400).json({ error: 'Enter the official work email issued by your institution.' });
    }

    const cleanStaffNumber = staffNumber.normalize('NFC').trim();
    if (cleanStaffNumber.length < 3 || cleanStaffNumber.length > 40) {
      return res.status(400).json({ error: 'Provide your staff or service number (3-40 characters).' });
    }
    const cleanJobTitle = jobTitle.normalize('NFC').trim();
    if (cleanJobTitle.length < 3 || cleanJobTitle.length > 120) {
      return res.status(400).json({ error: 'Provide your official job title (3-120 characters).' });
    }
    const cleanDutyStation = dutyStation.normalize('NFC').trim();
    if (cleanDutyStation.length < 3 || cleanDutyStation.length > 160) {
      return res.status(400).json({ error: 'Provide your duty station or office (3-160 characters).' });
    }
    const cleanJustification = justification.normalize('NFC').trim();
    if (cleanJustification.length < 30 || cleanJustification.length > 1200) {
      return res.status(400).json({ error: 'Explain your role in handling these cases in 30-1200 characters.' });
    }
    if (isBlockedAccountEmail(cleanEmail) || isBlockedAccountEmail(cleanOfficialEmail)) {
      return res.status(409).json({ error: RESERVED_EMAIL_ERROR });
    }
    if (cleanEmail === getConfiguredAdminEmail()) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const existing = await User.findOne({ email: cleanEmail });
    const reapply = existing && existing.role === 'agency'
      && existing.agencyApplicationStatus === 'rejected';
    const existingAgencyOfficer = existing && existing.role === 'agency'
      && (existing.agencyInvitationAcceptedAt || existing.agencyApplicationStatus === 'approved');
    if (existingAgencyOfficer) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    if (existing && !reapply) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    // One person, one active application per institution.
    const duplicateStaff = await User.findOne({
      role: 'agency',
      agencySlug,
      agencyApplicationStaffNumber: cleanStaffNumber,
      agencyApplicationStatus: { $in: ['pending', 'approved'] },
      ...(existing ? { _id: { $ne: existing._id } } : {})
    });
    if (duplicateStaff) {
      return res.status(409).json({
        error: 'An application for this staff number at this institution already exists. Contact the Kenya Watch liaison if this is unexpected.'
      });
    }

    storedDocuments.push(await storeDocument(authorisationLetter, 'authorisation_letter'));
    storedDocuments.push(await storeDocument(staffId, 'staff_id'));

    // Authenticity screening: fingerprint + provenance indicators, shown to the
    // Admin at approval time. Screened files are also registered so a recycled
    // document submitted under a different applicant is flagged automatically.
    const DocumentFingerprint = require('../documentFingerprint.model');
    const { screenApplicationDocument } = require('../utils/documentScreening');
    const screening = [];
    for (const [file, kind] of [[authorisationLetter, 'authorisation_letter'], [staffId, 'staff_id']]) {
      const record = await screenApplicationDocument(file, { DocumentFingerprint });
      screening.push({ kind, ...record });
      await DocumentFingerprint.updateOne(
        { fingerprint: record.fingerprint },
        { $setOnInsert: { fingerprint: record.fingerprint, kind, applicantEmail: cleanEmail, applicationRole: 'agency' } },
        { upsert: true }
      );
    }

    const applicationFields = {
      name: cleanName,
      password,
      role: 'agency',
      agencySlug,
      agencyApplicationStatus: 'pending',
      agencyApplicationStaffNumber: cleanStaffNumber,
      agencyApplicationJobTitle: cleanJobTitle,
      agencyApplicationDutyStation: cleanDutyStation,
      agencyApplicationOfficialEmail: cleanOfficialEmail,
      agencyApplicationJustification: cleanJustification,
      agencyApplicationDeclaredAt: new Date(),
      agencyApplicationDocuments: storedDocuments,
      agencyApplicationScreening: screening,
      agencyApplicationReviewedBy: null,
      agencyApplicationReviewedAt: null,
      agencyApplicationRejectionReason: null,
      agencyVerifiedBy: null,
      agencyVerifiedAt: null,
      agencyVerificationReference: null,
      agencyInvitationAcceptedAt: null,
      isActive: false
    };

    if (reapply) {
      Object.assign(existing, applicationFields);
      await existing.save();
    } else {
      await User.create({ email: cleanEmail, ...applicationFields });
    }

    storedDocuments.length = 0;
    return res.status(202).json({
      message: 'Your agency officer application has been submitted. A Kenya Watch Admin will verify your identity, employment and authority with your institution. You cannot sign in until it is approved.'
    });
  } catch (err) {
    try {
      await deleteDocuments(storedDocuments);
    } catch (cleanupError) {
      console.error('[authentication] agency application upload cleanup failed:', cleanupError.message);
    }
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    console.error('[authentication] agency application failed:', err.message);
    return res.status(500).json({ error: 'Unable to submit the agency application. Please try again later.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = normalizeEmail(email);
    const user = await User.findOne({ email: cleanEmail });
    let valid = false;
    if (user?.role === 'admin' && isConfiguredAdminEmail(user.email)) {
      const adminPassword = await verifyAdminPassword(password);
      if (adminPassword.configured) {
        valid = adminPassword.valid;
      } else if (process.env.NODE_ENV !== 'production') {
        // Local development and tests seed Admins with a database password; the
        // environment hash remains the authoritative credential in production.
        valid = await user.comparePassword(password);
      } else {
        return res.status(503).json({ error: 'Admin sign-in is not configured. Set ADMIN_PASSWORD_HASH.' });
      }
    } else {
      valid = user ? await user.comparePassword(password) : false;
    }
    if (valid && user.role === 'reviewer_pending') {
      const message = user.reviewerApplicationStatus === 'rejected'
        ? 'This reviewer application was not approved. Contact the Kenya Watch Admin for more information.'
        : 'Your reviewer application is awaiting Admin approval.';
      return res.status(403).json({ error: message });
    }
    // An agency officer who applied themselves gets a specific answer instead of
    // a generic "invalid password" - otherwise a correct password looks broken.
    if (valid && user.role === 'agency' && !user.isActive && user.agencyApplicationStatus === 'pending') {
      return res.status(403).json({
        error: 'Your agency officer application is awaiting Admin verification. You will be emailed once it is approved.'
      });
    }
    if (valid && user.role === 'agency' && user.agencyApplicationStatus === 'rejected') {
      return res.status(403).json({
        error: `Your agency officer application was not approved. Reason: ${user.agencyApplicationRejectionReason || 'Contact the Kenya Watch Admin for details.'}`
      });
    }
    const validAgencyAccount = user?.role !== 'agency' || (
      user.agencySlug && user.agencyVerificationReference && user.agencyVerifiedAt
    );
    if (!valid || !user.isActive || !validAgencyAccount ||
      (user.role === 'admin' && !isConfiguredAdminEmail(user.email))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions());
    return res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, agencySlug: user.agencySlug }
    });
  } catch (err) {
    console.error('[authentication] sign-in failed:', err.message);
    return res.status(500).json({ error: 'Unable to sign in. Please try again later.' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions());
  return res.json({ message: 'Logged out' });
});

router.get('/me', attachUser, requireAuth, (req, res) => {
  const {
    _id,
    name,
    email,
    role,
    emailNotificationsOptIn,
    smsNotificationsOptIn,
    phoneNumber,
    pushNotificationsOptIn,
    agencySlug
  } = req.user;
  const sms = require('../utils/sms');
  return res.json({
    user: {
      id: _id,
      name,
      email,
      role,
      emailNotificationsOptIn: !!emailNotificationsOptIn,
      smsNotificationsOptIn: !!smsNotificationsOptIn,
      phoneNumber: phoneNumber || null,
      smsAvailable: sms.isSmsConfigured(),
      smsProviders: sms.configuredProviders(),
      smsSandboxOnly: sms.isSandboxOnly(),
      pushAvailable: require('../utils/webPush').isPushConfigured(),
      pushNotificationsOptIn: !!req.user.pushNotificationsOptIn,
      pushDeviceCount: (req.user.pushSubscriptions || []).length,
      agencySlug
    }
  });
});

// PATCH /api/auth/notification-preferences
// "Email me about status changes on my reports" (and the optional SMS twin)
// is a real setting citizens can inspect and change after registering - not a
// one-time checkbox that is lost after sign-up.
router.patch('/notification-preferences', requireAuth, async (req, res) => {
  try {
    const { emailNotificationsOptIn, smsNotificationsOptIn, phoneNumber } = req.body || {};
    const updates = {};
    if (emailNotificationsOptIn !== undefined) {
      if (typeof emailNotificationsOptIn !== 'boolean') {
        return res.status(400).json({ error: 'Email notification preference must be true or false' });
      }
      updates.emailNotificationsOptIn = emailNotificationsOptIn;
    }
    const sms = require('../utils/sms');
    if (smsNotificationsOptIn !== undefined) {
      if (typeof smsNotificationsOptIn !== 'boolean') {
        return res.status(400).json({ error: 'SMS notification preference must be true or false' });
      }
      if (smsNotificationsOptIn && !sms.isSmsConfigured()) {
        return res.status(503).json({
          error: 'SMS notifications are not switched on for this deployment yet. Please keep email notifications on for now.'
        });
      }
      updates.smsNotificationsOptIn = smsNotificationsOptIn;
    }
    if (phoneNumber !== undefined) {
      if (typeof phoneNumber !== 'string') return res.status(400).json({ error: 'Enter a valid phone number' });
      if (!phoneNumber.trim()) {
        updates.phoneNumber = null;
      } else {
        const normalised = sms.normaliseKenyanPhoneNumber(phoneNumber);
        if (!normalised) {
          return res.status(400).json({ error: 'Enter a valid Kenyan mobile number, e.g. 0712 345 678 or +254712345678' });
        }
        updates.phoneNumber = normalised;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Provide at least one notification preference to update' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, {
      returnDocument: 'after',
      runValidators: true
    });
    if (!user) return res.status(404).json({ error: 'Account not found' });

    let testEmail = null;
    if (updates.emailNotificationsOptIn === true && req.body.sendTestEmail === true) {
      try {
        await require('../utils/reportStatusNotifications').sendNotificationOptInConfirmation(user);
        testEmail = 'sent';
      } catch (error) {
        console.error('[notification preferences] test email failed:', error.message);
        testEmail = 'failed';
      }
    }

    // "Send a practice SMS" so a citizen can confirm their handset receives the
    // status texts before relying on them. The result is reported honestly: a
    // provider rejection is never presented as a delivered message.
    let testSms = null;
    let testSmsError = null;
    if (req.body.sendTestSms === true) {
      if (!sms.isSmsConfigured()) {
        testSms = 'unavailable';
        testSmsError = 'SMS notifications are not switched on for this deployment yet.';
      } else if (!user.phoneNumber) {
        testSms = 'failed';
        testSmsError = 'Save a mobile number before requesting a test SMS.';
      } else {
        try {
          const sent = await sms.sendPracticeSms(user.phoneNumber);
          testSms = 'sent';
          testSmsError = sent.provider === 'africastalking' && sms.isSandboxOnly()
            ? 'Africa\'s Talking sandbox accepted the message, but it only appears in their simulator - not on a real handset.'
            : null;
        } catch (error) {
          console.error('[notification preferences] test SMS failed:', error.message);
          testSms = 'failed';
          testSmsError = error.message;
        }
      }
    }

    return res.json({
      emailNotificationsOptIn: !!user.emailNotificationsOptIn,
      smsNotificationsOptIn: !!user.smsNotificationsOptIn,
      phoneNumber: user.phoneNumber || null,
      smsAvailable: sms.isSmsConfigured(),
      smsProviders: sms.configuredProviders(),
      smsSandboxOnly: sms.isSandboxOnly(),
      testEmail,
      testSms,
      testSmsError
    });
  } catch (err) {
    console.error('[notification preferences] update failed:', err.message);
    return res.status(400).json({ error: 'Could not save your notification preferences.' });
  }
});

// GET /api/auth/push-config - the public VAPID key the browser needs to
// subscribe. Exposes only the public half; the private key never leaves here.
router.get('/push-config', attachUser, requireAuth, (req, res) => {
  const webPush = require('../utils/webPush');
  return res.json({
    available: webPush.isPushConfigured(),
    publicKey: webPush.isPushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
    subscribed: (req.user.pushSubscriptions || []).length > 0
  });
});

// POST /api/auth/push-subscriptions - store this device's Web Push subscription.
router.post('/push-subscriptions', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const authKey = subscription?.keys?.auth;
    if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) ||
      typeof p256dh !== 'string' || typeof authKey !== 'string') {
      return res.status(400).json({ error: 'A valid push subscription is required' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'Account not found' });
    user.pushSubscriptions = (user.pushSubscriptions || [])
      .filter((item) => item.endpoint !== endpoint)
      .concat({
        endpoint,
        expirationTime: typeof subscription.expirationTime === 'number' ? subscription.expirationTime : null,
        keys: { p256dh, auth: authKey },
        createdAt: new Date()
      });
    user.pushNotificationsOptIn = true;
    await user.save();
    return res.status(201).json({ subscribed: true, devices: user.pushSubscriptions.length });
  } catch (err) {
    console.error('[push subscription] save failed:', err.message);
    return res.status(400).json({ error: 'Could not save this device for phone alerts.' });
  }
});

// DELETE /api/auth/push-subscriptions - remove one device (or all with no body).
router.delete('/push-subscriptions', requireAuth, async (req, res) => {
  try {
    const endpoint = req.body?.endpoint;
    const update = endpoint
      ? { $pull: { pushSubscriptions: { endpoint } } }
      : { $set: { pushSubscriptions: [] } };
    const user = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after' });
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (!user.pushSubscriptions.length) {
      user.pushNotificationsOptIn = false;
      await user.save();
    }
    return res.json({ subscribed: user.pushSubscriptions.length > 0, devices: user.pushSubscriptions.length });
  } catch (err) {
    return res.status(400).json({ error: 'Could not update phone alerts.' });
  }
});

// POST /api/auth/push-test - deliver a clearly-labelled test alert to this
// account's devices, so a citizen can confirm alerts arrive before relying on
// them. Costs nothing and works on a SIM with zero airtime.
router.post('/push-test', requireAuth, async (req, res) => {
  const webPush = require('../utils/webPush');
  if (!webPush.isPushConfigured()) {
    return res.status(503).json({ error: 'Phone alerts are not switched on for this deployment yet.' });
  }
  try {
    const user = await User.findById(req.user._id);
    const result = await webPush.sendPushToUser(user, {
      title: 'Kenya Watch: alerts are on',
      body: 'This is a test alert. You will be notified here when one of your reports changes status.',
      link: '/my-reports'
    });
    if (result.removeEndpoints.length) {
      user.pushSubscriptions = user.pushSubscriptions.filter((item) => !result.removeEndpoints.includes(item.endpoint));
      await user.save();
    }
    if (!result.sent) {
      return res.status(409).json({
        error: result.reason === 'no_subscriptions'
          ? 'Enable phone alerts on this device first.'
          : 'The push service did not accept the test alert. Try re-enabling alerts on this device.'
      });
    }
    return res.json({ sent: result.sent, failed: result.failed, devices: user.pushSubscriptions.length });
  } catch (err) {
    console.error('[push test] failed:', err.message);
    return res.status(500).json({ error: 'Could not send the test alert.' });
  }
});

router.delete('/me', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'user') {
      return res.status(403).json({ error: 'Only citizen accounts can be deleted here. Contact an Admin about staff accounts.' });
    }
    const { password, confirmation } = req.body || {};
    if (typeof password !== 'string' || !password || confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Enter your password and type DELETE to confirm account deletion.' });
    }

    const user = await User.findOne({ _id: req.user._id, role: 'user' });
    if (!user || !await user.comparePassword(password)) {
      return res.status(401).json({ error: 'The password is incorrect. Your account was not deleted.' });
    }

    await deleteUserAccount(user._id);
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.json({
      message: 'Your account was permanently deleted. Your submitted reports remain for case integrity, with your account identity removed.'
    });
  } catch (error) {
    console.error('[account deletion] could not delete citizen account:', error.message);
    return res.status(500).json({ error: 'Could not delete the account. No success was reported; please try again or contact support.' });
  }
});

// POST /api/auth/change-password - a signed-in user changes their own password.
// Requires the current password, so someone who finds an unlocked browser cannot
// take over the account. Every other session is signed out; this one continues.
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Your current password and a new password are required' });
    }
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'The Admin password is managed locally. Use scripts/set-admin-password.js.' });
    }
    if (!isStrongPassword(newPassword)) return res.status(400).json({ error: PASSWORD_ERROR });
    // req.user is loaded without the password hash, so fetch it for the check.
    const user = await User.findById(req.user._id);
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ error: 'Your current password is incorrect' });
    }
    if (await user.comparePassword(newPassword)) {
      return res.status(400).json({ error: 'Choose a new password that is different from your current one' });
    }
    user.password = newPassword;
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiry = null;
    await user.save();
    // Keep this device signed in with a fresh session; older ones are now rejected.
    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    return res.json({ message: 'Password changed. Any other devices have been signed out.' });
  } catch (err) {
    console.error('[password change] failed:', err.message);
    return res.status(500).json({ error: 'Unable to change the password. Please try again later.' });
  }
});

// POST /api/auth/forgot-password - decision #22: single-use, time-limited reset link.
// Always responds the same way regardless of whether the email exists, so this endpoint
// can never be used to check who has an account.
router.post('/forgot-password', async (req, res) => {
  const genericResponse = { message: 'If this email is registered, a password reset link will be sent.' };
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.json(genericResponse);

    const user = await User.findOne({ email });
    if (user && user.role !== 'admin') {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetPasswordTokenHash = await hashSecret(token);
      user.resetPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      // Agency officers work in the Agency Case Portal, so their reset link opens
      // the portal's own reset form rather than the citizen site.
      const resetUrl = user.role === 'agency'
        ? new URL(`/agency-portal/#reset?email=${encodeURIComponent(user.email)}&token=${token}`,
          (process.env.AGENCY_PORTAL_ORIGIN || `http://localhost:${process.env.PORT || 5000}`))
        : new URL('/reset-password', process.env.FRONTEND_ORIGIN || 'http://localhost:3000');
      if (user.role !== 'agency') {
        resetUrl.searchParams.set('email', user.email);
        resetUrl.searchParams.set('token', token);
      }
      try {
        await mailer.sendMail({
          to: user.email,
          subject: 'Reset your Kenya Watch password',
          text: `We received a request to reset your password. This link expires in 1 hour: ${resetUrl.toString()}`
        });
      } catch (mailError) {
        user.resetPasswordTokenHash = null;
        user.resetPasswordExpiry = null;
        await user.save();
        console.error('[password reset] email delivery failed:', mailError.message);
      }
    }
    return res.json(genericResponse);
  } catch (err) {
    console.error('[password reset] request failed:', err.message);
    return res.status(500).json({ error: 'Unable to process the reset request. Please try again later.' });
  }
});

// POST /api/auth/reset-password - consumes the single-use token, then invalidates it.
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body || {};
    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Email, token and new password are required' });
    }
    if (typeof email !== 'string' || typeof token !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Email, token and new password are required' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ error: PASSWORD_ERROR });
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (user?.role === 'admin') {
      return res.status(400).json({ error: 'Admin passwords are managed locally. Use scripts/set-admin-password.js.' });
    }
    const tokenValid = user && user.resetPasswordExpiry && user.resetPasswordExpiry > new Date()
      ? await verifySecret(token, user.resetPasswordTokenHash)
      : false;
    if (!tokenValid) return res.status(400).json({ error: 'This reset link is invalid or has expired' });

    user.password = newPassword;
    if (user.role === 'agency' && !user.agencyInvitationAcceptedAt) {
      user.agencyInvitationAcceptedAt = new Date();
      user.isActive = true;
    }
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiry = null;
    await user.save();
    return res.json({ message: 'Password updated. You can now sign in with your new password.' });
  } catch (err) {
    console.error('[password reset] completion failed:', err.message);
    return res.status(500).json({ error: 'Unable to update the password. Please try again later.' });
  }
});

module.exports = router;
