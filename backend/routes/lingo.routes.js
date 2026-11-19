const express = require('express');
const mongoose = require('mongoose');
const LingoTerm = require('../lingo-term.model');
const { requireRole } = require('../middleware/auth');
const { SHENG_AND_DIALECT_TERMS, glossaryTermCount, normalizeText } = require('../utils/kenyaLingo');
const { refreshApprovedTerms } = require('../utils/lingoGlossary');

const router = express.Router();

// Words and spaces only: a glossary term is vocabulary, never a name, number,
// email address or link, so nothing identifying can ride in on a suggestion.
const WORDS_ONLY = /^[\p{L}][\p{L}' -]*$/u;
const LANGUAGES = ['Sheng', 'Kiswahili', 'Dialect', 'Other'];

function cleanWords(value, label, min, max) {
  if (typeof value !== 'string') throw new Error(`${label} is required`);
  // Check what was typed, not the normalised text, which turns punctuation (the
  // dots and slashes of a link, say) into spaces and would let it through.
  const typed = value.trim();
  if (typed.length < min || typed.length > max || !WORDS_ONLY.test(typed)) {
    throw new Error(`${label} must be ${min}-${max} characters of plain words (no digits, links or symbols)`);
  }
  return normalizeText(typed);
}

// POST /api/lingo/suggestions - a reviewer proposes a Kenyan term the glossary lacks.
router.post('/suggestions', requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const { language, meaning } = req.body || {};
    const term = cleanWords(req.body?.term, 'The term', 2, 40);
    const canonical = cleanWords(req.body?.canonical, 'What it should be read as', 3, 80);
    if (typeof meaning !== 'string' || meaning.trim().length < 10 || meaning.trim().length > 300) {
      return res.status(400).json({ error: 'Explain what the term means in 10-300 characters, without naming anyone' });
    }
    if (language !== undefined && !LANGUAGES.includes(language)) {
      return res.status(400).json({ error: 'Choose Sheng, Kiswahili, Dialect or Other' });
    }
    if (term in SHENG_AND_DIALECT_TERMS) {
      return res.status(409).json({ error: 'The glossary already knows this term' });
    }
    const created = await LingoTerm.create({
      term, canonical, meaning: meaning.trim(), language: language || 'Sheng', suggestedBy: req.user._id
    });
    return res.status(201).json({ id: created._id, status: created.status, message: 'Thank you. An Admin will review this term before it is used.' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'This term has already been suggested or approved' });
    if (/plain words|is required/.test(err.message)) return res.status(400).json({ error: err.message });
    console.error('[lingo] suggestion failed:', err.message);
    return res.status(500).json({ error: 'Could not save the suggestion' });
  }
});

// GET /api/lingo/suggestions?status=pending - Admin queue.
router.get('/suggestions', requireRole('admin'), async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const items = await LingoTerm.find({ status }).sort({ createdAt: 1 }).limit(100)
    .select('term canonical meaning language status createdAt reviewNote');
  return res.json({ suggestions: items, glossary: glossaryTermCount() });
});

// PATCH /api/lingo/suggestions/:id - Admin approves (optionally correcting the
// canonical reading) or rejects. Approval takes effect immediately.
router.patch('/suggestions/:id', requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Invalid suggestion id' });
    const { decision, note } = req.body || {};
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be approved or rejected' });
    const item = await LingoTerm.findById(req.params.id);
    if (!item || item.status !== 'pending') return res.status(404).json({ error: 'Pending suggestion not found' });
    if (req.body.canonical !== undefined) item.canonical = cleanWords(req.body.canonical, 'What it should be read as', 3, 80);
    item.status = decision;
    item.reviewedBy = req.user._id;
    item.reviewedAt = new Date();
    item.reviewNote = typeof note === 'string' ? note.trim().slice(0, 500) : null;
    await item.save();
    await refreshApprovedTerms();
    return res.json({ message: `Term ${decision}`, glossary: glossaryTermCount() });
  } catch (err) {
    if (/plain words|is required/.test(err.message)) return res.status(400).json({ error: err.message });
    console.error('[lingo] review failed:', err.message);
    return res.status(500).json({ error: 'Could not record the decision' });
  }
});

module.exports = router;
