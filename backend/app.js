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

// Builds and returns a configured Express app WITHOUT connecting to MongoDB or
// calling .listen() - kept separate from index.js so tests can import this directly
// (supertest talks to the app in-memory, no real network port needed).
function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000', credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachUser);

  // General anti-abuse ceiling across the whole API (decision #9) - generous, just
  // prevents runaway scripting; it never requires or retains any identity to apply.
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

  // Tighter caps on the two endpoints most relevant to abuse: anonymous submission
  // flooding and credential-stuffing / brute-force login attempts (decision #9).
  const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many reports submitted from this network recently. Please try again later.' }
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
  });
  app.use('/api/reports', (req, res, next) => (req.method === 'POST' && req.path === '/' ? submitLimiter(req, res, next) : next()));
  app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password'], authLimiter);

  app.get('/', (req, res) => {
    res.send('Kenya Watch backend is running!');
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/evidence', evidenceRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/agency-portal', agencyPortalRoutes);
  app.use('/api/stats', statsRoutes);

  // Concept/demo-only static site simulating an agency partner view (decision #7 - no real integration exists).
  app.use('/agency-portal', express.static(path.join(__dirname, '..', 'agency-portal')));

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
