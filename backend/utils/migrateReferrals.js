const mongoose = require('mongoose');

// One-time, idempotent conversion of the old single `agencyReferral` document into
// the `agencyReferrals` list. Earlier transfers (`previousReferrals`) become ended
// entries so no history is lost. Safe to run on every start: it only touches
// documents that still carry the old field.
async function migrateLegacyReferrals() {
  const collection = mongoose.connection.db.collection('reports');
  const legacy = await collection.find({ agencyReferral: { $exists: true } }).toArray();
  let migrated = 0;
  for (const doc of legacy) {
    const old = doc.agencyReferral || {};
    const { previousReferrals = [], ...current } = old;
    const referrals = [];
    for (const previous of previousReferrals) {
      if (!previous || !previous.agency) continue;
      referrals.push({
        _id: new mongoose.Types.ObjectId(),
        agency: previous.agency,
        referralSummary: previous.referralSummary || null,
        referenceNumber: previous.referenceNumber || null,
        notes: previous.notes || null,
        status: previous.status || 'sent',
        referredAt: previous.referredAt || null,
        sentBy: previous.sentBy || null,
        sentByName: previous.sentByName || null,
        agencyUpdates: previous.agencyUpdates || [],
        accessLog: [],
        informationRequests: [],
        endedAt: previous.endedAt || new Date(),
        endReason: 'transferred'
      });
    }
    if (current.agency) referrals.push({ _id: new mongoose.Types.ObjectId(), ...current, endedAt: null });
    const existing = Array.isArray(doc.agencyReferrals) ? doc.agencyReferrals : [];
    await collection.updateOne(
      { _id: doc._id },
      { $set: { agencyReferrals: [...existing, ...referrals] }, $unset: { agencyReferral: '' } }
    );
    migrated += 1;
  }
  if (migrated) console.log(`[migration] Converted ${migrated} report(s) to multi-agency referrals.`);
  return migrated;
}

module.exports = { migrateLegacyReferrals };
