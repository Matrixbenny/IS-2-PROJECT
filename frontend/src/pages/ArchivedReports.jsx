import React, { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

function ArchivedReports() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'admin') return undefined;
    let mounted = true;
    const load = async () => {
      try {
        const response = await api.get('/reports/archived');
        if (mounted) {
          setReports(response.data);
          setError('');
        }
      } catch (loadError) {
        if (mounted) setError(loadError.response?.data?.error || loadError.message);
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [user]);

  if (!user || user.role !== 'admin') {
    return <div className="kw-helper">This page is only available to Admins.</div>;
  }

  const restore = async (report) => {
    setError('');
    try {
      await api.patch(`/reports/${report._id}/restore`);
      setReports((current) => current.filter((item) => item._id !== report._id));
    } catch (restoreError) {
      setError(restoreError.response?.data?.error || restoreError.message);
    }
  };

  const permanentlyDelete = async (report) => {
    if (report.legalHold) {
      setError('A report under legal hold cannot be permanently deleted.');
      return;
    }
    if (!window.confirm(`Permanently delete ${report.trackingReference}, including its stored evidence? This cannot be undone.`)) return;
    setError('');
    try {
      await api.delete(`/reports/${report._id}/permanent`);
      setReports((current) => current.filter((item) => item._id !== report._id));
    } catch (deleteError) {
      setError(deleteError.response?.data?.error || deleteError.message);
    }
  };

  return (
    <div>
      <h2>Archived Reports</h2>
      <div className="kw-helper" style={{ marginBottom: 14 }}>
        Archived reports are hidden from active views. Restore a report or permanently remove it and its GridFS evidence.
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {reports.length === 0 && !error && <div className="kw-empty-state">No archived reports.</div>}
      <div className="reports-list">
        {reports.map((report) => (
          <div className="report-card kw-pro-card" key={report._id}>
            <div className="kw-pro-card-row">
              <h3>{report.title}</h3>
              <span className="kw-tracking-chip">{report.trackingReference}</span>
            </div>
            <div className="kw-pro-meta">{report.reportedCategory} · {report.subCounty}, {report.county}</div>
            <div className="kw-pro-meta">Archived {new Date(report.archivedAt).toLocaleString()}</div>
            {report.legalHold && <div className="kw-helper">This report is under legal hold and cannot be permanently deleted.</div>}
            <button type="button" className="kw-btn" onClick={() => restore(report)}>Restore</button>
            <button type="button" className="kw-btn kw-btn-secondary" onClick={() => permanentlyDelete(report)} disabled={report.legalHold}>
              Permanently delete with evidence
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArchivedReports;
