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
    const reports = await Report.find({
      archivedAt: null,
      'agencyReferral.agency': agency.name,
      'agencyReferral.referralSummary': { $type: 'string', $ne: '' }
    }).sort({ 'agencyReferral.referredAt': -1, createdAt: -1 });

    // Opening a released case file is itself an auditable act. Record the first
    // time each officer sees a case that carries released material; the portal's
    // periodic refresh must not flood the log with repeats.
    const viewedAt = new Date();
    for (const r of reports) {
      const file = r.agencyReferral.caseFile;
      const hasMaterial = file && (file.narrative || file.categoryDetails || (file.evidence || []).length);
      const alreadyLogged = (r.agencyReferral.accessLog || [])
        .some((entry) => entry.action === 'view_case_file' && entry.userId && entry.userId.toString() === req.user._id.toString());
      if (hasMaterial && !alreadyLogged) {
        r.agencyReferral.accessLog.push({
          userId: req.user._id,
          userEmail: req.user.email,
          action: 'view_case_file',
          ipAddress: req.ip,
          at: viewedAt
        });
        await r.save();
      }
    }

    return res.json(reports.map((r) => ({
      id: r._id,
      trackingReference: r.trackingReference,
      reportedCategory: r.reportedCategory,
      county: r.county,
      subCounty: r.subCounty,
      referralSummary: r.agencyReferral.referralSummary,
      referralStatus: r.agencyReferral.status || 'sent',
      referredAt: r.agencyReferral.referredAt || null,
      referenceNumber: r.agencyReferral.referenceNumber,
      // Released case file: what this agency is authorised to investigate.
      caseFile: {
        narrative: r.agencyReferral.caseFile?.narrative || null,
        categoryDetails: r.agencyReferral.caseFile?.categoryDetails || null,
        reporterContact: Boolean(r.agencyReferral.caseFile?.reporterContact),
        evidence: (r.agencyReferral.caseFile?.evidence || []).map((item) => ({
          id: item.evidenceId,
          filename: item.filename,
          type: item.type,
          releasedAt: item.releasedAt
        })),
        releasedAt: r.agencyReferral.caseFile?.releasedAt || null,
        releasedByName: r.agencyReferral.caseFile?.releasedByName || null
      },
      resolution: r.agencyReferral.status === 'closed' && r.agencyReferral.resolution?.outcome ? {
        outcome: r.agencyReferral.resolution.outcome,
        outcomeReference: r.agencyReferral.resolution.outcomeReference,
        outcomeSummary: r.agencyReferral.resolution.outcomeSummary,
        legalBasis: r.agencyReferral.resolution.legalBasis,
        courtsInvolved: r.agencyReferral.resolution.courtsInvolved,
        closedAt: r.agencyReferral.resolution.closedAt
      } : null,
      informationRequests: (r.agencyReferral.informationRequests || []).map((item) => ({
        question: item.question,
        status: item.status,
        requestedAt: item.requestedAt,
        answer: item.status === 'answered' ? item.answer : null,
        answeredAt: item.answeredAt
      })),
      agencyUpdates: r.agencyReferral.agencyUpdates.map((update) => ({
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
      'agencyReferral.agency': agency.name
    });
    if (!report) {
      return res.status(404).json({ error: 'Case not found for this agency' });
    }
    const transitions = {
      sent: ['acknowledged'],
      acknowledged: ['under_review', 'information_requested', 'action_taken', 'closed'],
      under_review: ['information_requested', 'action_taken', 'closed'],
      information_requested: ['under_review', 'action_taken', 'closed'],
      action_taken: ['under_review', 'closed'],
      closed: []
    };
    if (!transitions[report.agencyReferral.status || 'sent']?.includes(status)) {
      return res.status(409).json({ error: 'That referral status change is not allowed from the current status' });
    }
    const cleanPublicMessage = typeof publicMessage === 'string' ? publicMessage.normalize('NFC').trim() : '';
    report.agencyReferral.status = status;
    if (referenceNumber !== undefined) report.agencyReferral.referenceNumber = referenceNumber.trim() || null;
    report.agencyReferral.agencyUpdates.push({
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
    // Until now the citizen's case stayed "In Review" forever, even after the
    // institution had finished. Closing the referral now resolves the report the
    // reporter is tracking, records the outcome, and notifies them (if they opted
    // in). This is the whole point of the platform: the reporter learns the
    // result.
    if (status === 'closed') {
      const outcomeLabel = {
        investigated_charged: 'Investigated and charges filed',
        investigated_no_action: 'Investigated, no charges filed',
        referred_elsewhere: 'Referred to another authority',
        administrative_action: 'Administrative action taken',
        not_pursued: 'Not pursued by this institution'
      }[outcome];

      report.agencyReferral.resolution = {
        outcome,
        outcomeReference: outcomeReference.trim(),
        outcomeSummary: outcomeSummary.trim(),
        legalBasis: typeof legalBasis === 'string' && legalBasis.trim() ? legalBasis.trim() : null,
        courtsInvolved: typeof courtsInvolved === 'string' && courtsInvolved.trim() ? courtsInvolved.trim() : null,
        closedAt: new Date(),
        closedBy: req.user._id,
        closedByEmail: req.user.email
      };

      // The institution's finding is the citizen's result. The report moves to
      // Resolved so the public list and the reporter's own view both reflect it.
      report.status = 'Resolved';
      report.resolutionNote = outcomeSummary.trim();
      report.resolutionReference = outcomeReference.trim();
      report.statusHistory.push({
        status: 'Resolved',
        changedAt: new Date(),
        changedBy: req.user._id,
        note: `${report.agencyReferral.agency}: ${outcomeLabel}. ${outcomeSummary.trim()}`
      });
      await report.save();

      notifyReporterOfStatusChange(report, {
        status: 'Resolved',
        resolutionNote: `${outcomeLabel} - ${outcomeSummary.trim()}`,
        resolutionReference: outcomeReference.trim(),
        rejectionReason: null
      });

      return res.status(201).json({
        message: 'Case closed. The reporter\'s record now shows the outcome.',
        resolved: true
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
      'agencyReferral.agency': agency.name
    });
    if (!report) return res.status(404).json({ error: 'Case not found for this agency' });

    const released = (report.agencyReferral.caseFile?.evidence || [])
      .find((item) => item.evidenceId.toString() === req.params.evidenceId);
    if (!released) {
      return res.status(403).json({ error: 'That file was not released with this referral' });
    }
    const evidenceItem = report.evidence.find((e) => e._id.toString() === req.params.evidenceId);
    if (!evidenceItem) return res.status(404).json({ error: 'File not found on this report' });

    // Log before streaming so the record exists even if the transfer is cut off.
    report.agencyReferral.accessLog.push({
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
      'agencyReferral.agency': agency.name
    });
    if (!report) return res.status(404).json({ error: 'Case not found for this agency' });
    if (report.agencyReferral.status === 'closed') {
      return res.status(409).json({ error: 'This referral is closed. Contact the Kenya Watch liaison to reopen it.' });
    }
    report.agencyReferral.informationRequests.push({
      question: question.trim(),
      requestedBy: req.user._id,
      requestedByEmail: req.user.email,
      requestedAt: new Date(),
      status: 'open'
    });
    // The case status reflects that the investigating agency is blocked on us.
    if (['sent', 'acknowledged', 'under_review'].includes(report.agencyReferral.status || 'sent')) {
      report.agencyReferral.status = 'information_requested';
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
    const update = report.agencyReferral.agencyUpdates.id(req.params.updateId);
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
        resolutionNote: `Update from ${report.agencyReferral.agency}: ${update.publicMessage}`,
        resolutionReference: report.agencyReferral.referenceNumber,
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
