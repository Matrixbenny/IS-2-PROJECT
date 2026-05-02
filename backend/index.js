const express = require('express');
const mongoose = require('mongoose');
const Report = require('./report.model');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = 'mongodb://localhost:27018/kenya_watch';

app.use(express.json());

// Basic API endpoint for testing
app.get('/', (req, res) => {
  res.send('Kenya Watch backend is running!');
});

// POST /reports - Submit a new corruption report
app.post('/reports', async (req, res) => {
  try {
    const report = new Report(req.body);
    await report.save();
    res.status(201).json({ message: 'Report submitted successfully', report });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });
