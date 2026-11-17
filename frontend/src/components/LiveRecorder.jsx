import React, { useEffect, useRef, useState } from 'react';
import api from '../api';

const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
const MAX_PENDING_BYTES = 10 * 1024 * 1024;
const MAX_DURATION_SECONDS = 10 * 60;

function formatTime(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function LiveRecorder({ onRecordingReady, onBusyChange }) {
  const [mediaType, setMediaType] = useState('audio');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [bytesWritten, setBytesWritten] = useState(0);
  const [queuedBytes, setQueuedBytes] = useState(0);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const tokenRef = useRef(null);
  const uploadQueueRef = useRef(Promise.resolve());
  const queuedBytesRef = useRef(0);
  const bytesWrittenRef = useRef(0);
  const uploadFailedRef = useRef(false);
  const cancelledRef = useRef(false);
  const startedAtRef = useRef(0);
  const stopRecordingRef = useRef(null);

  useEffect(() => {
    onBusyChange(['requesting', 'recording', 'saving'].includes(status));
  }, [status, onBusyChange]);

  useEffect(() => () => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (tokenRef.current) {
      uploadQueueRef.current.finally(() => cancelServerSession());
    }
  }, []);

  useEffect(() => {
    if (status !== 'recording') return undefined;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= MAX_DURATION_SECONDS) stopRecordingRef.current?.();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function cancelServerSession() {
    if (!tokenRef.current) return;
    try {
      await api.post('/recordings/cancel', null, {
        headers: { 'X-Recording-Token': tokenRef.current }
      });
    } catch (cancelError) {
      console.error('Could not cancel the recording upload:', cancelError);
    }
    tokenRef.current = null;
  }

  async function startRecording() {
    setError('');
    setElapsedSeconds(0);
    setBytesWritten(0);
    setQueuedBytes(0);
    bytesWrittenRef.current = 0;
    queuedBytesRef.current = 0;
    uploadFailedRef.current = false;
    cancelledRef.current = false;

    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Live recording requires a supported browser and a secure connection (HTTPS or localhost).');
      setStatus('error');
      return;
    }

    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mediaType === 'video' ? { audio: true, video: true } : { audio: true, video: false }
      );
      if (cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeOptions = mediaType === 'video'
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4']
        : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = mimeOptions.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
        videoBitsPerSecond: 1000000
      });
      const session = await api.post('/recordings', {
        mediaType,
        mimeType: recorder.mimeType || mimeType || `${mediaType}/webm`
      });
      tokenRef.current = session.data.token;
      if (cancelledRef.current) {
        await cancelServerSession();
        stopTracks();
        return;
      }
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (cancelledRef.current || !event.data.size) return;
        const chunk = event.data;
        if (bytesWrittenRef.current + queuedBytesRef.current + chunk.size > MAX_RECORDING_BYTES
          || queuedBytesRef.current + chunk.size > MAX_PENDING_BYTES) {
          uploadFailedRef.current = true;
          setError('The recording is too large or your connection is too slow to save it. Stop and try a shorter recording.');
          if (recorder.state === 'recording') recorder.stop();
          return;
        }

        queuedBytesRef.current += chunk.size;
        setQueuedBytes(queuedBytesRef.current);
        uploadQueueRef.current = uploadQueueRef.current.then(async () => {
          if (uploadFailedRef.current || cancelledRef.current) return;
          await api.post('/recordings/chunk', chunk, {
            headers: {
              'Content-Type': 'application/octet-stream',
              'X-Recording-Token': tokenRef.current
            }
          });
          bytesWrittenRef.current += chunk.size;
          setBytesWritten(bytesWrittenRef.current);
        }).catch((uploadError) => {
          uploadFailedRef.current = true;
          setError(uploadError.response?.data?.error || 'A recording segment could not be saved. Please try again.');
          if (recorder.state === 'recording') recorder.stop();
        }).finally(() => {
          queuedBytesRef.current = Math.max(0, queuedBytesRef.current - chunk.size);
          setQueuedBytes(queuedBytesRef.current);
        });
      };

      recorder.onstop = async () => {
        stopTracks();
        if (cancelledRef.current) return;
        setStatus('saving');
        await uploadQueueRef.current;
        if (cancelledRef.current) return;
        if (uploadFailedRef.current) {
          await cancelServerSession();
          setStatus('error');
          return;
        }
        try {
          const finished = await api.post('/recordings/finish', null, {
            headers: { 'X-Recording-Token': tokenRef.current }
          });
          setStatus('ready');
          onRecordingReady(tokenRef.current, finished.data.filename);
        } catch (finishError) {
          setError(finishError.response?.data?.error || 'The recording could not be finalized. Please try again.');
          await cancelServerSession();
          setStatus('error');
        }
      };

      startedAtRef.current = Date.now();
      recorder.start(1000);
      setStatus('recording');
    } catch (startError) {
      stopTracks();
      if (cancelledRef.current) return;
      await cancelServerSession();
      setError(startError.name === 'NotAllowedError'
        ? 'Camera or microphone permission was denied. Allow access in your browser settings and try again.'
        : startError.response?.data?.error || 'Could not start the recording. Check your camera and microphone and try again.');
      setStatus('error');
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }
  stopRecordingRef.current = stopRecording;

  async function cancelRecording() {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    stopTracks();
    await uploadQueueRef.current;
    await cancelServerSession();
    onRecordingReady(null, null);
    setStatus('idle');
    setError('');
  }

  async function discardReadyRecording() {
    await cancelServerSession();
    onRecordingReady(null, null);
    setStatus('idle');
    setElapsedSeconds(0);
    setBytesWritten(0);
  }

  const statusMessage = {
    requesting: 'Requesting camera or microphone access…',
    recording: 'Recording is in progress. New segments are uploaded and saved automatically.',
    saving: 'Saving the final recording segment…',
    ready: 'Recording saved and ready to attach to your report.'
  }[status] || '';

  return (
    <fieldset className="kw-live-recorder" aria-describedby="live-recording-help">
      <legend>Record a live incident</legend>
      <p id="live-recording-help" className="kw-helper">
        Record audio or video with audio. Segments are saved to the server while recording. Maximum 10 minutes or 100 MB. Use HTTPS or localhost.
      </p>
      <div className="kw-recorder-options">
        <label>
          <input
            type="radio"
            name="recordingType"
            value="audio"
            checked={mediaType === 'audio'}
            onChange={() => setMediaType('audio')}
            disabled={['requesting', 'recording', 'saving', 'ready'].includes(status)}
          />
          Audio
        </label>
        <label>
          <input
            type="radio"
            name="recordingType"
            value="video"
            checked={mediaType === 'video'}
            onChange={() => setMediaType('video')}
            disabled={['requesting', 'recording', 'saving', 'ready'].includes(status)}
          />
          Video with audio
        </label>
        {status === 'ready'
          ? <button type="button" className="kw-btn kw-btn-secondary" onClick={discardReadyRecording}>Remove recording</button>
          : status === 'recording'
            ? (
              <>
                <button type="button" className="kw-btn" onClick={stopRecording}>Stop and save</button>
                <button type="button" className="kw-btn kw-btn-secondary" onClick={cancelRecording}>Cancel recording</button>
              </>
            )
            : status === 'requesting'
              ? <button type="button" className="kw-btn kw-btn-secondary" onClick={cancelRecording}>Cancel recording</button>
              : status === 'saving'
                ? <button type="button" className="kw-btn kw-btn-secondary" disabled>Saving recording…</button>
                : <button type="button" className="kw-btn" onClick={startRecording}>Start recording</button>}
      </div>
      {statusMessage && <p className="kw-recorder-status" role="status" aria-live="polite" aria-atomic="true">{statusMessage}</p>}
      {status === 'recording' && (
        <p className="kw-helper" aria-live="off">
          {formatTime(elapsedSeconds)} elapsed. {Math.floor(bytesWritten / 1024 / 1024)} MB uploaded; {Math.ceil(queuedBytes / 1024)} KB waiting to upload.
        </p>
      )}
      {error && <p className="kw-recorder-error" role="alert">{error}</p>}
    </fieldset>
  );
}

export default LiveRecorder;
