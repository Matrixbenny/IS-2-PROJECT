require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth.routes');
const reportRoutes = require('./routes/report.routes');
const evidenceRoutes = require('./routes/evidence.routes');
const userRoutes = require('./routes/users.routes');
const agencyPortalRoutes = require('./routes/agencyPortal.routes');
const statsRoutes = require('./routes/stats.routes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

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

// Keep the old unauthenticated routes working briefly isn't needed - the frontend is being updated alongside this.

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });
