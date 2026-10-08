import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useLanguage } from '../context/LanguageContext';

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, '-')}`;
}

function Home() {
  const { t } = useLanguage();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports')
      .then((res) => setReports(res.data))
      .catch(() => setError('Failed to load reports. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="kw-reports-summary">
        <h2 style={{ margin: 0 }}>{t('home_title')}</h2>
        <div className="kw-reports-meta">{reports.length} report{reports.length === 1 ? '' : 's'}</div>
      </div>
      <div className="kw-helper" style={{ marginBottom: 16 }}>
        {t('home_helper')}
        {' '}{t('home_haveRef')} <Link to="/track">{t('home_lookup')}</Link>.
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="kw-empty-state">{t('home_loading')}</div>
      ) : (
        <div className="reports-list">
          {reports.length === 0 && (
            <div className="kw-empty-state">
              <span role="img" aria-label="no reports" className="kw-empty-emoji">📋</span>
              <div>{t('home_empty')}</div>
            </div>
          )}
          {reports.map((r) => (
            <div className="report-card kw-pro-card" key={r._id}>
              <div className="kw-pro-card-row">
                <h3>{r.title}</h3>
                <span className={`kw-status-badge ${statusClass(r.status)}`}>{r.status}</span>
              </div>
              <div className="kw-pro-meta"><span className="kw-tracking-chip">{r.trackingReference}</span></div>
              <div className="kw-pro-meta"><b>Category:</b> {r.reportedCategory}</div>
              <div className="kw-pro-meta"><b>Location:</b> {r.subCounty}, {r.county}</div>
              <div className="kw-pro-meta"><b>Evidence:</b> {r.evidenceCount > 0 ? `${r.evidenceCount} file(s) attached` : <span className="kw-faded">None</span>}</div>
              <div className="kw-pro-meta"><b>Submitted:</b> {new Date(r.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;
