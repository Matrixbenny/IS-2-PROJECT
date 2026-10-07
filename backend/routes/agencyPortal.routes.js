const express = require('express');
const Report = require('../report.model');
const { AGENCIES } = require('../utils/agencies');
const { slugify, findAgencyBySlug, isValidDemoCode } = require('../utils/agencyDemoAuth');

const router = express.Router();

// GET /api/agency-portal/agencies - public list for the demo login dropdown, no secrets exposed.
router.get('/agencies', (req, res) => {
  res.json({ agencies: AGENCIES.map((a) => ({ slug: slugify(a.name), name: a.name })) });
});

// POST /api/agency-portal/login - demo-only access code check (not a real account system).
router.post('/login', (req, res) => {
  const { slug, code } = req.body;
  const agency = findAgencyBySlug(slug);
  if (!agency) return res.status(404).json({ error: 'Unknown agency' });
  if (!isValidDemoCode(slug, code)) return res.status(401).json({ error: 'Incorrect access code' });
  return res.json({ ok: true, agencyName: agency.name });
});

function authorize(req, res) {
  const { slug, code } = req.query.slug ? req.query : req.body;
  const agency = findAgencyBySlug(slug);
  if (!agency || !isValidDemoCode(slug, code)) {
    res.status(401).json({ error: 'Invalid agency access code' });
    return null;
  }
  return agency;
}

// GET /api/agency-portal/cases?slug=&code= - cases referred to this agency (never the reporter's identity).
router.get('/cases', async (req, res) => {
  const agency = authorize(req, res);
  if (!agency) return;
  try {
    const reports = await Report.find({ 'agencyReferral.agency': agency.name }).sort({ createdAt: -1 });
    return res.json(reports.map((r) => ({
      id: r._id,
      trackingReference: r.trackingReference,
      title: r.title,
      reportedCategory: r.reportedCategory,
      description: r.description,
      categorySpecificDetails: r.categorySpecificDetails,
      county: r.county,
      subCounty: r.subCounty,
      status: r.status,
      referenceNumber: r.agencyReferral.referenceNumber,
      notes: r.agencyReferral.notes,
      agencyUpdates: r.agencyReferral.agencyUpdates,
      createdAt: r.createdAt
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/agency-portal/cases/:id/updates - the agency's own real-world update on a referred case.
router.post('/cases/:id/updates', async (req, res) => {
  const agency = authorize(req, res);
  if (!agency) return;
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'A note is required' });

    const report = await Report.findById(req.params.id);
    if (!report || report.agencyReferral.agency !== agency.name) {
      return res.status(404).json({ error: 'Case not found for this agency' });
    }
    report.agencyReferral.agencyUpdates.push({ note, createdAt: new Date() });
    await report.save();
    return res.status(201).json({ message: 'Update recorded' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
