import React, { useState } from 'react';
import api from '../api';

function EvidenceDownloads({ reportId, evidence = [], trackingReference, trackingKey }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState('');

  const download = async (item) => {
    const evidenceId = item.id || item._id;
    setDownloadingId(evidenceId);
    setError('');
    try {
      const response = await api.get(`/evidence/${reportId}/${evidenceId}`, {
        responseType: 'blob',
        ...(trackingReference && trackingKey ? { params: { ref: trackingReference, key: trackingKey } } : {})
      });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.filename || `evidence-${evidenceId}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) {
      setError(downloadError.response?.status === 403
        ? 'You are not authorized to download this evidence.'
        : 'Could not retrieve this evidence file. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  if (!evidence.length) return null;

  return (
    <section aria-label="Report evidence">
      <h4>Evidence files</h4>
      <ul>
        {evidence.map((item) => {
          const id = item.id || item._id;
          return (
            <li key={id}>
              <span>{item.filename || item.type}</span>{' '}
              <button type="button" onClick={() => download(item)} disabled={downloadingId === id}>
                {downloadingId === id ? 'Downloading…' : 'Download original'}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <div className="error" role="alert">{error}</div>}
    </section>
  );
}

export default EvidenceDownloads;
