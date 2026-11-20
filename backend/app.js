const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth.routes');
const reportRoutes = require('./routes/report.routes');
const evidenceRoutes = require('./routes/evidence.routes');
const userRoutes = require('./routes/users.routes');
const agencyPortalRoutes = require('./routes/agencyPortal.routes');
const statsRoutes = require('./routes/stats.routes');
const lingoRoutes = require('./routes/lingo.routes');
const recordingRoutes = require('./routes/recording.routes');

// Builds and returns a configured Express app WITHOUT connecting to MongoDB or
// calling .listen() - kept separate from index.js so tests can import this directly
// (supertest talks to the app in-memory, no real network port needed).
function createApp() {
  const app = express();

  // Behind a reverse proxy every visitor shares the proxy's address unless Express
  // is told to trust it, which would make the per-network rate limits meaningless.
  if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachUser);

  // General anti-abuse ceiling across the whole API (decision #9) - generous, just
  // prevents runaway scripting; it never requires or retains any identity to apply.
  // In non-production a higher ceiling so hot-reload dev loops and browser-test
  // sessions are not throttled by normal page polling (page polls every ~15s per tab).
  const generalMax = process.env.NODE_ENV === 'production' ? 300 : 2000;
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: generalMax, standardHeaders: true, legacyHeaders: false }));

  // Tighter caps on the two endpoints most relevant to abuse: anonymous submission
  // flooding and credential-stuffing / brute-force login attempts (decision #9).
  // In development the caps are relaxed: a developer testing the app signs in and
  // out many times from one machine, and a 15-minute lockout looks like "login is
  // broken". Production keeps the strict limits.
  const isProduction = process.env.NODE_ENV === 'production';
  const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isProduction ? 5 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many reports submitted from this network recently. Please try again later.' }
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 10 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
  });
  const recordingStartLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isProduction ? 20 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many recording sessions started from this network recently. Please try again later.' }
  });
  const receiptEmailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: isProduction ? 5 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many receipt verification attempts. Please try again later.' }
  });
  app.use('/api/reports', (req, res, next) => (req.method === 'POST' && req.path === '/' && process.env.NODE_ENV !== 'test' ? submitLimiter(req, res, next) : next()));
  app.use('/api/reports/email-receipt', receiptEmailLimiter);
  app.use('/api/recordings', (req, res, next) => (req.method === 'POST' && req.path === '/' ? recordingStartLimiter(req, res, next) : next()));
  app.use([
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/reviewer-application',
    '/api/auth/agency-application',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/auth/change-password'
  ], authLimiter);
  app.use(['/api/reports/captcha-image', '/api/reports/captcha-challenge'], rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProduction ? 30 : 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many security challenges requested. Please wait and try again.' }
  }));

  // Used by the hosting platform's health check; reveals nothing about the data.
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // In production one service serves the API, the agency portal and the built
  // citizen/staff app, so the session cookie stays same-origin. In development
  // Vite serves the app on port 3000 instead.
  const frontendBuild = process.env.FRONTEND_BUILD_DIR || path.join(__dirname, '..', 'frontend', 'build');
  const serveFrontend = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(frontendBuild, 'index.html'));

  if (!serveFrontend) {
    app.get('/', (req, res) => {
      res.send('Kenya Watch backend is running!');
    });
  }

  app.use('/api/auth', authRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/recordings', recordingRoutes);
  app.use('/api/evidence', evidenceRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/agency-portal', agencyPortalRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/lingo', lingoRoutes);

  // Serves the local partner-portal UI; this is not connected to any government system.
  app.use('/agency-portal', express.static(path.join(__dirname, '..', 'agency-portal')));

  if (serveFrontend) {
    app.use(express.static(frontendBuild, { index: false }));
    // Client-side routes (/track, /login, ...) all load the same page.
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/') || req.path.startsWith('/agency-portal')) return next();
      res.sendFile(path.join(frontendBuild, 'index.html'));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server' });
  });

  return app;
}

module.exports = createApp;
