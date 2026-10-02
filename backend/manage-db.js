// manage-db.js
// Node.js script to manage kenya_watch MongoDB database using Mongoose

const mongoose = require('mongoose');
const Report = require('./report.model');
const User = require('./user.model');

const MONGO_URI = 'mongodb://localhost:27018/kenya_watch';

async function main() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // --- EXAMPLES ---

  // 1. Create a new user
  const user = await User.create({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'hashedpassword', // Use bcrypt in real apps
    role: 'admin'
  });
  console.log('Created user:', user);

  // 2. Create a new report
  const report = await Report.create({
    title: 'Sample Report',
    description: 'This is a sample corruption report.',
    location: 'Nairobi',
    demographic: { ageGroup: '25-34', gender: 'Female', occupation: 'Engineer' },
    user: user._id,
    tags: ['bribery', 'city hall'],
    status: 'Received'
  });
  console.log('Created report:', report);

  // 3. Find all reports
  const reports = await Report.find().populate('user');
  console.log('All reports:', reports);

  // 4. Update a report's status
  if (reports.length > 0) {
    const updated = await Report.findByIdAndUpdate(
      reports[0]._id,
      { status: 'In Review' },
      { new: true }
    );
    console.log('Updated report status:', updated);
  }

  // 5. Add a comment to a report
  if (reports.length > 0) {
    reports[0].comments.push({
      user: user._id,
      text: 'This needs urgent review.'
    });
    await reports[0].save();
    console.log('Added comment to report:', reports[0]);
  }

  // 6. Delete a report (uncomment to use)
  // await Report.findByIdAndDelete(report._id);
  // console.log('Deleted report:', report._id);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
}

main().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
