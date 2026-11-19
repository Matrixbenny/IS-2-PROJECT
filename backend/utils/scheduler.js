const { anonymizeExpired } = require('./retention');
const { sendOverdueReminders } = require('./referralSla');

// The privacy promise (identity unlinked after the retention window) and the
// accountability promise (agencies are reminded) must not depend on someone
// remembering to run a script. Runs once shortly after start, then every 24 hours.
const DAY = 24 * 60 * 60 * 1000;

async function runDailyJobs() {
  try {
    const retention = await anonymizeExpired();
    if (retention.anonymized) console.log(`[retention] unlinked ${retention.anonymized} closed report(s) from reporter accounts.`);
    const reminders = await sendOverdueReminders();
    if (reminders.reminded) console.log(`[referrals] reminded agencies about ${reminders.reminded} overdue referral(s).`);
  } catch (err) {
    console.error('[scheduler] daily jobs failed:', err.message);
  }
}

function startScheduler() {
  if (process.env.NODE_ENV === 'test') return null;
  setTimeout(runDailyJobs, 30 * 1000).unref();
  return setInterval(runDailyJobs, DAY).unref();
}

module.exports = { startScheduler, runDailyJobs };
