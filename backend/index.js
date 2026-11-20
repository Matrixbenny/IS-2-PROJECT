require('dotenv').config();
const connectDB = require('./config/db');
const createApp = require('./app');
const { warnIfAdminIdentityMisconfigured } = require('./utils/developerIdentity');
const mailer = require('./utils/mailer');
const sms = require('./utils/sms');
const { migrateLegacyReferrals } = require('./utils/migrateReferrals');
const { refreshApprovedTerms } = require('./utils/lingoGlossary');

const { productionProblems } = require('./utils/productionChecks');
const { startScheduler } = require('./utils/scheduler');

const problems = productionProblems();
if (problems.length) {
  console.error(`Refusing to start in production:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}

const app = createApp();
const PORT = process.env.PORT || 5000;

// Startup self-checks: the two things that silently break notifications.
warnIfAdminIdentityMisconfigured();
if (!mailer.isEmailConfigured()) {
  console.warn('[mailer] No SMTP credentials configured. In development, mail is captured by a disposable Ethereal inbox and never reaches real recipients.');
}
if (sms.isSmsConfigured()) {
  console.log(`[sms] SMS notifications enabled via ${sms.configuredProviders().join(' -> ')}${sms.isSandboxOnly() ? ' (sandbox - messages appear only in the provider simulator)' : ''}.`);
} else {
  console.warn('[sms] No SMS provider configured. Native SMS notifications are unavailable. See .env.example for the free Android-gateway setup.');
}

connectDB()
  .then(() => migrateLegacyReferrals())
  .then(() => refreshApprovedTerms())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      startScheduler();
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });
