const { randomBytes } = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const Report = require('../report.model');
const { hashRecordingToken } = require('../utils/recordingToken');

const router = express.Router();
const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const MAX_CHUNK_BYTES = 5 * 1024 * 1024;
const MAX_RECORDING_DURATION_MS = 10 * 60 * 1000;
const RECORDING_STOP_GRACE_MS = 30 * 1000;
const SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const uploads = new Map();
const activeWrites = new Set();
const parseRecordingChunk = express.raw({ type: 'application/octet-stream', limit: MAX_CHUNK_BYTES });

function sessions() {
  return mongoose.connection.db.collection('recordingSessions');
}

function isAllowedMimeType(mimeType, mediaType) {
  return typeof mimeType === 'string'
    && mimeType.length <= 100
    && new RegExp(`^${mediaType}/(?:webm|ogg|mp4)(?:;.*)?$`, 'i').test(mimeType);
}

async function deleteUpload(fileId) {
  if (!fileId) return;
  const db = mongoose.connection.db;
  await Promise.all([
    db.collection('evidence.files').deleteOne({ _id: fileId }),
    db.collection('evidence.chunks').deleteMany({ files_id: fileId })
  ]);
}

async function removeSession(session) {
  const stream = uploads.get(session._id);
  if (stream) {
    uploads.delete(session._id);
    stream.destroy();
  }
  await deleteUpload(session.fileId);
  await sessions().deleteOne({ _id: session._id });
}

async function cleanExpiredSessions() {
  if (mongoose.connection.readyState !== 1) return;
  const expired = await sessions().find({ expiresAt: { $lte: new Date() } }).toArray();
  for (const session of expired) {
    if (activeWrites.has(session._id)) continue;
    if (session.reportId && await Report.exists({ _id: session.reportId })) {
      await sessions().deleteOne({ _id: session._id });
      continue;
    }
    await removeSession(session);
  }
}

const cleanupTimer = setInterval(() => {
  cleanExpiredSessions().catch((error) => {
    console.error('Recording cleanup failed:', error.message);
  });
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

function getToken(req) {
  const token = req.get('X-Recording-Token');
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    stream.once('error', onError);
    stream.write(chunk, (error) => {
      stream.removeListener('error', onError);
      if (error) reject(error);
      else resolve();
    });
  });
}

router.post('/', express.json({ limit: '2kb' }), async (req, res) => {
  let sessionId;
  let stream;
  try {
    const { mediaType, mimeType } = req.body || {};
    if (!['audio', 'video'].includes(mediaType) || !isAllowedMimeType(mimeType, mediaType)) {
      return res.status(400).json({ error: 'Choose a supported audio or video recording format.' });
    }

    const token = randomBytes(32).toString('base64url');
    sessionId = hashRecordingToken(token);
    const fileId = new mongoose.Types.ObjectId();
    const startedAt = new Date();
    const filename = `live-recording-${startedAt.toISOString().replace(/[:.]/g, '-')}.${mimeType.split('/')[1].split(';')[0]}`;
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'evidence' });
    stream = bucket.openUploadStreamWithId(fileId, filename, {
      chunkSizeBytes: 16 * 1024,
      contentType: mimeType,
      metadata: { type: mediaType, liveRecording: true, contentType: mimeType }
    });
    stream.on('error', (error) => {
      console.error('Live recording GridFS upload failed:', error.message);
    });
    uploads.set(sessionId, stream);

    await sessions().insertOne({
      _id: sessionId,
      fileId,
      filename,
      mediaType,
      contentType: mimeType,
      bytesWritten: 0,
      status: 'recording',
      startedAt,
      expiresAt: new Date(startedAt.getTime() + SESSION_LIFETIME_MS)
    });

    return res.status(201).json({
      token,
      maxBytes: MAX_RECORDING_BYTES,
      maxDurationSeconds: MAX_RECORDING_DURATION_MS / 1000
    });
  } catch (error) {
    if (sessionId) uploads.delete(sessionId);
    if (stream) stream.destroy();
    return res.status(500).json({ error: 'Could not start the recording upload.' });
  }
});

router.post('/chunk', (req, res, next) => {
  parseRecordingChunk(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'A recording segment cannot exceed 5 MB.' });
    }
    return res.status(400).json({ error: 'Could not read the recording segment.' });
  });
}, async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Recording session is missing or invalid.' });
  const sessionId = hashRecordingToken(token);
  if (activeWrites.has(sessionId)) return res.status(409).json({ error: 'Wait for the previous recording chunk to finish uploading.' });
  activeWrites.add(sessionId);
  try {
    const session = await sessions().findOne({ _id: sessionId, status: 'recording', expiresAt: { $gt: new Date() } });
    if (!session) return res.status(404).json({ error: 'Recording session has expired or is no longer active.' });
    if (Date.now() - session.startedAt.getTime() > MAX_RECORDING_DURATION_MS + RECORDING_STOP_GRACE_MS) {
      await removeSession(session);
      return res.status(413).json({ error: 'Recording duration exceeded the 10-minute limit.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Recording chunk is empty.' });
    }
    if (session.bytesWritten + req.body.length > MAX_RECORDING_BYTES) {
      await removeSession(session);
      return res.status(413).json({ error: 'Recording exceeded the 100 MB limit.' });
    }
    const stream = uploads.get(sessionId);
    if (!stream) return res.status(409).json({ error: 'Recording upload was interrupted. Please start a new recording.' });
    await writeChunk(stream, req.body);
    const updated = await sessions().updateOne(
      { _id: sessionId, status: 'recording' },
      { $inc: { bytesWritten: req.body.length } }
    );
    if (!updated.matchedCount) return res.status(409).json({ error: 'Recording session is no longer active.' });
    return res.json({ bytesWritten: session.bytesWritten + req.body.length });
  } catch (error) {
    return res.status(500).json({ error: 'Could not save this recording chunk.' });
  } finally {
    activeWrites.delete(sessionId);
  }
});

router.post('/finish', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Recording session is missing or invalid.' });
  const sessionId = hashRecordingToken(token);
  if (activeWrites.has(sessionId)) return res.status(409).json({ error: 'Wait for the recording chunk to finish uploading.' });
  activeWrites.add(sessionId);
  let session;
  try {
    session = await sessions().findOne({ _id: sessionId, expiresAt: { $gt: new Date() } });
    if (!session) return res.status(404).json({ error: 'Recording session has expired or is no longer active.' });
    if (session.status === 'ready') {
      return res.json({ filename: session.filename, mediaType: session.mediaType, bytesWritten: session.bytesWritten });
    }
    if (session.status !== 'recording') return res.status(409).json({ error: 'Recording session is no longer active.' });
    if (Date.now() - session.startedAt.getTime() > MAX_RECORDING_DURATION_MS + RECORDING_STOP_GRACE_MS) {
      await removeSession(session);
      return res.status(413).json({ error: 'Recording duration exceeded the 10-minute limit.' });
    }
    const stream = uploads.get(sessionId);
    if (!stream) return res.status(409).json({ error: 'Recording upload was interrupted. Please start a new recording.' });
    if (!session.bytesWritten) return res.status(400).json({ error: 'Record something before finishing the recording.' });

    await new Promise((resolve, reject) => {
      stream.once('error', reject);
      stream.once('finish', resolve);
      stream.end();
    });
    uploads.delete(sessionId);
    await sessions().updateOne({ _id: sessionId }, { $set: { status: 'ready', finishedAt: new Date() } });
    return res.json({ filename: session.filename, mediaType: session.mediaType, bytesWritten: session.bytesWritten });
  } catch (error) {
    if (session) await removeSession(session);
    return res.status(500).json({ error: 'Could not finish saving the recording.' });
  } finally {
    activeWrites.delete(sessionId);
  }
});

router.post('/cancel', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Recording session is missing or invalid.' });
  const sessionId = hashRecordingToken(token);
  if (activeWrites.has(sessionId)) return res.status(409).json({ error: 'Wait for the recording chunk to finish uploading before cancelling.' });
  activeWrites.add(sessionId);
  try {
    const session = await sessions().findOneAndUpdate(
      { _id: sessionId, status: { $in: ['recording', 'ready'] } },
      { $set: { status: 'canceling' } },
      { returnDocument: 'after' }
    );
    if (session) await removeSession(session);
    return res.status(204).end();
  } catch (error) {
    return res.status(500).json({ error: 'Could not cancel the recording upload.' });
  } finally {
    activeWrites.delete(sessionId);
  }
});

module.exports = router;
