const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27018/kenya_watch';
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB (${mongoose.connection.name})`);
  return mongoose.connection;
}

module.exports = connectDB;
