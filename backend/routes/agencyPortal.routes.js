const express = require('express');
const Report = require('../report.model');
const { AGENCIES, slugify } = require('../utils/agencies');
const { requireRole } = require('../middleware/auth');
const { notifyReporterOfStatusChange } = require('../utils/reportStatusNotifications');
const { getBucket } = require('../utils/gridfs');

const router = express.Router();

router.get('/me', requireRole('agency'), (req, res) => {
  const agency = AGENCIES.find((item) => slugify(item.name) === req.user.agencySlug);
  if (!agency) return res.status(403).json({ error: 'Your account has no valid agency assignment' });
  return res.json({ name: req.user.name, email: req.user.email, agency: agency.name });
});

router.get('/cases', requireRole('agency'), async (req, res) => {
  const agency = AGENCIES.find((item) => slugify(item.name) === req.user.agencySlug);
  if (!agency) return res.status(403).json({ error: 'Your account has no valid agency assignment' });
  try {
    const found = await Report.find({
      archivedAt: null,
      agencyReferrals: {
        $elemMatch: { agency: agency.name, endedAt: null, referralSummary: { $type: 'string', $ne: '' } }
      }
    });
    // Newest referral to this agency first.
    const reports = found
      .map((report) => ({ report, referral: report.activeReferralFor(agency.name) }))
      .sort((a, b) => new Date(b.referral.referredAt || 0) - new Date(a.referral.referredAt || 0));

    // Opening a released case file is itself an auditable act. Record the first
    // time each officer sees a case that carries released material; the portal's
    // periodic refresh must not flood the log with repeats.
    const viewedAt = new Date();
    for (const { report, referral } of reports) {
      const file = referral.caseFile;
      const hasMaterial = file && (file.narrative || file.categoryDetails || (file.evidence || []).length);
      const alreadyLogged = (referral.accessLog || [])
        .some((entry) => entry.action === 'view_case_file' && entry.userId && entry.userId.toString() === req.user._id.toString());
      if (hasMaterial && !alreadyLogged) {
        referral.accessLog.push({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'view_case_file',
          ipAddress: req.ip,
          at: viewedAt
        });
        await report.save();
      }
    }

    return res.json(reports.map(({ report: r, referral }) => ({
      id: r._id,
      referralId: referral._id,
      // Names only: lets investigators who hold the same case coordinate instead
      // of duplicating work. Nothing about the other agency's file is shared.
      alsoReferredTo: r.activeReferrals().filter((item) => item.agency !== referral.agency).map((item) => item.agency),
      trackingReference: r.trackingReference,
      reportedCategory: r.reportedCategory,
      county: r.county,
      subCounty: r.subCounty,
      referralSummary: referral.referralSummary,
      referralStatus: referral.status || 'sent',
      referredAt: referral.referredAt || null,
      referenceNumber: referral.referenceNumber,
      // Released case file: what this agency is authorised to investigate.
      caseFile: {
        narrative: referral.caseFile?.narrative || null,
        categoryDetails: referral.caseFile?.categoryDetails || null,
        reporterContact: Boolean(referral.caseFile?.reporterContact),
        evidence: (referral.caseFile?.evidence || []).map((item) => ({
          id: item.evidenceId,
          filename: item.filename,
          type: item.type,
          releasedAt: item.releasedAt
        })),
        releasedAt: referral.caseFile?.releasedAt || null,
        releasedByName: referral.caseFile?.releasedByName || null
      },
      resolution: referral.status === 'closed' && referral.resolution?.outcome ? {
        outcome: referral.resolution.outcome,
        outcomeReference: referral.resolution.outcomeReference,
        outcomeSummary: referral.resolution.outcomeSummary,
        legalBasis: referral.resolution.legalBasis,
        courtsInvolved: referral.resolution.courtsInvolved,
        closedAt: referral.resolution.closedAt
      } : null,
      informationRequests: (referral.informationRequests || []).map((item) => ({
        question: item.question,
        status: item.status,
        requestedAt: item.requestedAt,
        answer: item.status === 'answered' ? item.answer : null,
        answeredAt: item.answeredAt
      })),
      agencyUpdates: referral.agencyUpdates.map((update) => ({
        id: update._id,
        note: update.note,
        status: update.status,
        publicMessage: update.publicMessage,
        publicMessageStatus: update.publicMessageStatus,
        createdByName: update.createdByName,
        createdAt: update.createdAt
      }))
    })));
  } catch (err) {
    console.error('[agency portal] could not load referred cases:', err.message);
    return res.status(500).json({ error: 'Could not load referred cases' });
  }
});

router.post('/cases/:id/updates', requireRole('agency'), async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid case ID' });
  }

  try {
    const agency = AGENCIES.find((item) => slugify(item.name) === req.user.agencySlug);
    if (!agency) return res.status(403).json({ error: 'Your account has no valid agency assignment' });
    const { note, status, publicMessage, referenceNumber, outcome, outcomeReference, outcomeSummary, legalBasis, courtsInvolved } = req.body || {};
    if (typeof note !== 'string' || !note.trim()) return res.status(400).json({ error: 'A note is required' });
    const cleanNote = note.trim();
    if (cleanNote.length > 2000) return res.status(400).json({ error: 'An update must be 2000 characters or fewer' });
    const allowedStatuses = ['acknowledged', 'under_review', 'information_requested', 'action_taken', 'closed'];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Select a valid referral status' });
    if (publicMessage !== undefined && (typeof publicMessage !== 'string' || publicMessage.trim().length > 500)) {
      return res.status(400).json({ error: 'A reporter update must be text of 500 characters or fewer' });
    }
    if (referenceNumber !== undefined && (typeof referenceNumber !== 'string' || referenceNumber.trim().length > 120)) {
      return res.status(400).json({ error: 'Agency reference must be text of 120 characters or fewer' });
    }
    // Closing is the moment the reporter has been waiting for. A case cannot be
    // closed with only an internal note - the officer must record what the
    // institution actually decided, in language the reporter can understand.
    const VALID_OUTCOMES = [
      'investigated_charged',
      'investigated_no_action',
      'referred_elsewhere',
      'administrative_action',
      'not_pursued'
    ];
    if (status === 'closed') {
      if (!VALID_OUTCOMES.includes(outcome)) {
        return res.status(400).json({ error: 'Record what the institution decided before closing the case' });
      }
      if (typeof outcomeSummary !== 'string' || outcomeSummary.trim().length < 30) {
        return res.status(400).json({
          error: 'Write a plain-language outcome for the reporter (at least 30 characters) explaining what happened and what it means'
        });
      }
      if (outcomeSummary.trim().length > 2000) {
        return res.status(400).json({ error: 'Keep the outcome summary to 2000 characters or fewer' });
      }
      if (typeof outcomeReference !== 'string' || !outcomeReference.trim()) {
        return res.status(400).json({ error: 'Record the institution\'s case or file reference for this outcome' });
      }
      if (outcome === 'investigated_charged' && (typeof legalBasis !== 'string' || legalBasis.trim().length < 10)) {
        return res.status(400).json({
          error: 'When charges are filed, record the legal basis (for example the Act and sections relied on)'
        });
      }
    }

    const report = await Report.findOne({
      _id: req.params.id,
      archivedAt: null,
      agencyReferrals: { $elemMatch: { agency: agency.name, endedAt: null } }
    });
    if (!report) {
      return res.status(404).json({ error: 'Case not found for this agency' });
    }
    const referral = report.activeReferralFor(agency.name);
    const transitions = {
      sent: ['acknowledged'],
      acknowledged: ['under_review', 'information_requested', 'action_taken', 'closed'],
      under_review: ['information_requested', 'action_taken', 'closed'],
      information_requested: ['under_review', 'action_taken', 'closed'],
      action_taken: ['under_review', 'closed'],
      closed: []
    };
    if (!transitions[referral.status || 'sent']?.includes(status)) {
      return res.status(409).json({ error: 'That referral status change is not allowed from the current status' });
    }
    const cleanPublicMessage = typeof publicMessage === 'string' ? publicMessage.normalize('NFC').trim() : '';
    referral.status = status;
    if (referenceNumber !== undefined) referral.referenceNumber = referenceNumber.trim() || null;
    referral.agencyUpdates.push({
      note: cleanNote,
      status,
      publicMessage: cleanPublicMessage || null,
      publicMessageStatus: cleanPublicMessage ? 'pending' : 'none',
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByEmail: req.user.email,
      createdAt: new Date()
    });
    await report.save();

    // --- Close the justice loop -------------------------------------------------
    // Closing a referral records what this institution decided. The report the
    // reporter is tracking becomes Resolved only when EVERY agency working on it
    // has closed its referral; until then the reporter sees each agency's own
    // outcome while the case stays open for the others.
    if (status === 'closed') {
      const outcomeLabel = {
        investigated_charged: 'Investigated and charges filed',
        investigated_no_action: 'Investigated, no charges filed',
        referred_elsewhere: 'Referred to another authority',
        administrative_action: 'Administrative action taken',
        not_pursued: 'Not pursued by this institution'
      }[outcome];

      referral.resolution = {
        outcome,
        outcomeReference: outcomeReference.trim(),
        outcomeSummary: outcomeSummary.trim(),
        legalBasis: typeof legalBasis === 'string' && legalBasis.trim() ? legalBasis.trim() : null,
        courtsInvolved: typeof courtsInvolved === 'string' && courtsInvolved.trim() ? courtsInvolved.trim() : null,
        closedAt: new Date(),
        closedBy: req.user._id,
        closedByEmail: req.user.email
      };

      const stillOpen = report.activeReferrals().filter((item) => item.status !== 'closed');
      const allClosed = stillOpen.length === 0;
      report.statusHistory.push({
        status: allClosed ? 'Resolved' : report.status,
        changedAt: new Date(),
        changedBy: req.user._id,
        note: `${referral.agency}: ${outcomeLabel}. ${outcomeSummary.trim()}`
      });
      if (allClosed) {
        report.status = 'Resolved';
        report.resolutionNote = outcomeSummary.trim();
        report.resolutionReference = outcomeReference.trim();
      }
      await report.save();

      if (allClosed) {
        notifyReporterOfStatusChange(report, {
          status: 'Resolved',
          resolutionNote: `${outcomeLabel} - ${outcomeSummary.trim()}`,
          resolutionReference: outcomeReference.trim(),
          rejectionReason: null
        });
      }

      return res.status(201).json({
        message: allClosed
          ? 'Case closed. The reporter\'s record now shows the outcome.'
          : `Your agency's part is closed. ${stillOpen.length} other ${stillOpen.length === 1 ? 'agency is' : 'agencies are'} still working on this case, so it stays open for the reporter.`,
        resolved: allClosed
      });
    }

    return res.status(201).json({ message: 'Update recorded and any reporter message queued for Admin review' });
  } catch (err) {
    console.error('[agency portal] could not record case update:', err.message);
    return res.status(500).json({ error: 'Could not record the agency case update' });
  }
});

// GET /api/agency-portal/cases/:id/evidence/:evidenceId
// Streams one evidence file that was explicitly released with this referral.
// Three guards: the case must be referred to this officer's agency, the file
// must be in the released list (not merely present on the report), and the
// access is written to the referral's access log.
router.get('/cases/:id/evidence/:evidenceId', requireRole('agency'), async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id) || !/^[a-f\d]{24}$/i.test(req.params.evidenceId)) {
    return res.status(400).json({ error: 'Invalid case or file ID' });
  }
  try {
    const agency = AGENCIES.find((item) => slugify(item.name) === req.user.agencySlug);
    if (!agency) return res.status(403).json({ error: 'Your account has no valid agency assignment' });

    const report = await Report.findOne({
      _id: req.params.id,
      archivedAt: null,
      agencyReferrals: { $elemMatch: { agency: agency.name, endedAt: null } }
    });
    if (!report) return res.status(404).json({ error: 'Case not found for this agency' });
    const referral = report.activeReferralFor(agency.name);

    const released = (referral.caseFile?.evidence || [])
      .find((item) => item.evidenceId.toString() === req.params.evidenceId);
    if (!released) {
      return res.status(403).json({ error: 'That file was not released with this referral' });
    }
    const evidenceItem = report.evidence.find((e) => e._id.toString() === req.params.evidenceId);
    if (!evidenceItem) return res.status(404).json({ error: 'File not found on this report' });

    // Log before streaming so the record exists even if the transfer is cut off.
    referral.accessLog.push({
      userId: req.user._id,
      userEmail: req.user.email,
      action: 'download_evidence',
      evidenceId: evidenceItem._id,
      filename: evidenceItem.filename,
      ipAddress: req.ip,
      at: new Date()
    });
    await report.save();

    const bucket = getBucket();
    const storedFile = await bucket.find({ _id: evidenceItem.gridFsId }).next();
    if (!storedFile) return res.status(404).json({ error: 'File not found in storage' });
    const filename = String(evidenceItem.filename || 'evidence').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '_');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.set('X-Content-Type-Options', 'nosniff');
    if (storedFile.metadata && storedFile.metadata.contentType) res.type(storedFile.metadata.contentType);
    bucket.openDownloadStream(evidenceItem.gridFsId)
      .on('error', () => { if (!res.headersSent) res.status(404).json({ error: 'File not found in storage' }); })
      .pipe(res);
  } catch (err) {
    console.error('[agency portal] evidence download failed:', err.message);
    return res.status(500).json({ error: 'Could not retrieve the file' });
  }
});

// POST /api/agency-portal/cases/:id/information-requests
// An officer investigating the case asks Kenya Watch for more detail. The
// request is visible to reviewers/Admin, who answer it; the answer comes back
// to this agency's portal only.
router.post('/cases/:id/information-requests', requireRole('agency'), async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid case ID' });
  try {
    const agency = AGENCIES.find((item) => slugify(item.name) === req.user.agencySlug);
    if (!agency) return res.status(403).json({ error: 'Your account has no valid agency assignment' });
    const { question } = req.body || {};
    if (typeof question !== 'string' || question.trim().length < 10) {
      return res.status(400).json({ error: 'Describe what you need to know (at least 10 characters)' });
    }
    if (question.trim().length > 2000) {
      return res.status(400).json({ error: 'Keep the request to 2000 characters or fewer' });
    }
    const report = await Report.findOne({
      _id: req.params.id,
      archivedAt: null,
      agencyReferrals: { $elemMatch: { agency: agency.name, endedAt: null } }
    });
    if (!report) return res.status(404).json({ error: 'Case not found for this agency' });
    const referral = report.activeReferralFor(agency.name);
    if (referral.status === 'closed') {
      return res.status(409).json({ error: 'This referral is closed. Contact the Kenya Watch liaison to reopen it.' });
    }
    referral.informationRequests.push({
      question: question.trim(),
      requestedBy: req.user._id,
      requestedByEmail: req.user.email,
      requestedAt: new Date(),
      status: 'open'
    });
    // The case status reflects that the investigating agency is blocked on us.
    if (['sent', 'acknowledged', 'under_review'].includes(referral.status || 'sent')) {
      referral.status = 'information_requested';
    }
    await report.save();
    return res.status(201).json({ message: 'Request sent to Kenya Watch for an answer' });
  } catch (err) {
    console.error('[agency portal] information request failed:', err.message);
    return res.status(500).json({ error: 'Could not send the information request' });
  }
});

router.patch('/cases/:reportId/updates/:updateId/review', requireRole('admin'), async (req, res) => {
  if (
    !/^[a-f\d]{24}$/i.test(req.params.reportId)
    || !/^[a-f\d]{24}$/i.test(req.params.updateId)
  ) {
    return res.status(400).json({ error: 'Invalid case or update ID' });
  }

  try {
    const { decision } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }
    const report = await Report.findOne({ _id: req.params.reportId, archivedAt: null });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    let update = null;
    let owner = null;
    for (const referral of report.activeReferrals()) {
      const match = referral.agencyUpdates.id(req.params.updateId);
      if (match) { update = match; owner = referral; break; }
    }
    if (!update || update.publicMessageStatus !== 'pending') {
      return res.status(404).json({ error: 'Pending reporter message not found' });
    }
    update.publicMessageStatus = decision;
    update.reviewedBy = req.user._id;
    update.reviewedAt = new Date();
    await report.save();

    // An approved agency update is a status change the reporter asked to hear
    // about. The report status itself does not move - the agency referral did.
    if (decision === 'approved') {
      notifyReporterOfStatusChange(report, {
        status: report.status,
        resolutionNote: `Update from ${owner.agency}: ${update.publicMessage}`,
        resolutionReference: owner.referenceNumber,
        rejectionReason: null
      });
    }
    return res.json({ message: `Reporter message ${decision}` });
  } catch (err) {
    console.error('[agency portal] could not review reporter message:', err.message);
    return res.status(500).json({ error: 'Could not review the reporter message' });
  }
});

module.exports = router;
