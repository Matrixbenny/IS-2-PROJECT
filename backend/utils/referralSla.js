const Report = require('../report.model');
const User = require('../user.model');
const mailer = require('./mailer');
const { AGENCIES, slugify } = require('./agencies');

// Reviewers have an escalation clock; agencies need one too, otherwise a referral
// can sit unread and the reporter hears nothing. These are reminders and a visible
// list for the Admin, not penalties: Kenya Watch cannot compel an agency, but it can
// make silence visible and keep asking.
const ACK_DAYS = () => Number(process.env.REFERRAL_ACK_DAYS) || 3;
const STALE_DAYS = () => Number(process.env.REFERRAL_STALE_DAYS) || 14;
const REMIND_EVERY_DAYS = () => Number(process.env.REFERRAL_REMIND_DAYS) || 7;
const DAY = 24 * 60 * 60 * 1000;

function lastActivity(referral) {
  const dates = [referral.referredAt, ...(referral.agencyUpdates || []).map((u) => u.createdAt)]
    .filter(Boolean).map((d) => new Date(d).getTime());
  return dates.length ? Math.max(...dates) : null;
}

// Pure: returns null when the referral is on track, otherwise why it is overdue.
function referralHealth(referral, now = new Date()) {
  if (!referral || referral.endedAt || ['closed', 'returned'].includes(referral.status)) return null;
  const last = lastActivity(referral);
  if (!last) return null;
  const idleDays = Math.floor((now.getTime() - last) / DAY);
  if (referral.status === 'sent' && idleDays >= ACK_DAYS()) {
    return { kind: 'unacknowledged', idleDays, thresholdDays: ACK_DAYS() };
  }
  if (idleDays >= STALE_DAYS()) return { kind: 'stalled', idleDays, thresholdDays: STALE_DAYS() };
  return null;
}

async function findOverdueReferrals(now = new Date()) {
  const reports = await Report.find({ archivedAt: null, 'agencyReferrals.endedAt': null })
    .select('trackingReference title agencyReferrals');
  const overdue = [];
  for (const report of reports) {
    for (const referral of report.agencyReferrals) {
      const health = referralHealth(referral, now);
      if (health) {
        overdue.push({
          reportId: report._id,
          referralId: referral._id,
          trackingReference: report.trackingReference,
          title: report.title,
          agency: referral.agency,
          status: referral.status,
          lastReminderAt: referral.lastReminderAt || null,
          ...health
        });
      }
    }
  }
  return overdue.sort((a, b) => b.idleDays - a.idleDays);
}

async function officersFor(agencyName) {
  const agency = AGENCIES.find((item) => item.name === agencyName);
  const slug = agency ? slugify(agency.name) : slugify(agencyName || '');
  return User.find({ role: 'agency', agencySlug: slug, isActive: true }).select('email name');
}

function portalUrl() {
  return `${process.env.AGENCY_PORTAL_ORIGIN || 'http://localhost:5000'}/agency-portal/`;
}

// The email names the reference only: no narrative, no category, nothing sensitive
// travels by email. The details are in the portal behind the officer's sign-in.
async function notifyNewReferral(agencyName, trackingReference) {
  try {
    const officers = await officersFor(agencyName);
    await Promise.all(officers.map((officer) => mailer.sendMail({
      to: officer.email,
      subject: `Kenya Watch: new case ${trackingReference} referred to ${agencyName}`,
      text: `A case (${trackingReference}) has been referred to your institution and is waiting in the Agency Case Portal.\n\nSign in: ${portalUrl()}\n\nNo case details are sent by email.`
    })));
    return officers.length;
  } catch (err) {
    console.error('[referrals] could not notify agency officers:', err.message);
    return 0;
  }
}

async function sendOverdueReminders(now = new Date()) {
  const overdue = await findOverdueReferrals(now);
  let sent = 0;
  for (const item of overdue) {
    if (item.lastReminderAt && now.getTime() - new Date(item.lastReminderAt).getTime() < REMIND_EVERY_DAYS() * DAY) continue;
    try {
      const officers = await officersFor(item.agency);
      const what = item.kind === 'unacknowledged'
        ? `has not been acknowledged for ${item.idleDays} days`
        : `has had no update for ${item.idleDays} days`;
      await Promise.all(officers.map((officer) => mailer.sendMail({
        to: officer.email,
        subject: `Kenya Watch reminder: case ${item.trackingReference} ${item.kind === 'unacknowledged' ? 'awaits acknowledgement' : 'needs an update'}`,
        text: `Case ${item.trackingReference} ${what}. The reporter is waiting to hear that it is being handled.\n\nPlease acknowledge it or post an update in the Agency Case Portal: ${portalUrl()}`
      })));
      await Report.updateOne(
        { _id: item.reportId, 'agencyReferrals._id': item.referralId },
        { $set: { 'agencyReferrals.$.lastReminderAt': now } }
      );
      sent += 1;
    } catch (err) {
      console.error('[referrals] reminder failed:', err.message);
    }
  }
  return { overdue: overdue.length, reminded: sent };
}

module.exports = { ACK_DAYS, STALE_DAYS, referralHealth, findOverdueReferrals, notifyNewReferral, sendOverdueReminders };
