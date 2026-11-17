const AuditEvent = require('../audit-event.model');
const Notification = require('../notification.model');
const Report = require('../report.model');
const Session = require('../session.model');
const User = require('../user.model');

async function deleteUserAccount(userId) {
  // A staff account (e.g. a reviewer who was also a citizen) keeps its
  // reviewer-side audit fields; only the citizen identity links are severed.
  await Report.updateMany({ user: userId }, { $set: { user: null } });
  await Report.updateMany({ claimedBy: userId }, { $set: { claimedBy: null } });
  await Report.updateMany({ archivedBy: userId }, { $set: { archivedBy: null } });
  await Report.updateMany(
    { 'statusHistory.changedBy': userId },
    { $set: { 'statusHistory.$[history].changedBy': null } },
    { arrayFilters: [{ 'history.changedBy': userId }] }
  );
  await Report.updateMany(
    { 'comments.author': userId },
    { $set: { 'comments.$[comment].author': null } },
    { arrayFilters: [{ 'comment.author': userId }] }
  );
  await AuditEvent.updateMany({ actor: userId }, { $set: { actor: null } });
  await Session.deleteMany({ user: userId });
  await Notification.deleteMany({ recipient: userId });
  await User.deleteOne({ _id: userId });
}

module.exports = { deleteUserAccount };
