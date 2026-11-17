import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import { useLanguage } from "../context/LanguageContext";
import usePolling from "../hooks/usePolling";

function statusClass(status) {
  return `status-${status.toLowerCase().replace(/\s+/g, "-")}`;
}

const ANONYMITY_STEPS = [
  {
    icon: "👤",
    title: "No account needed",
    text: "Report without ever giving your name, email or phone number. There is nothing to leak because nothing is collected.",
  },
  {
    icon: "🔑",
    title: "Get a private tracking key",
    text: "You receive a Tracking Reference and a one-time Access Key. That pair - not your identity - is the only way your case is opened.",
  },
  {
    icon: "👀",
    title: "Reviewers never see who reported",
    text: "Case reviewers work from the report content alone. Even a database leak cannot link a case back to a person.",
  },
];

function Home() {
  const { t } = useLanguage();
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async () => {
    // Load the two feeds independently so one failure cannot blank the page.
    const [reportsResult, statsResult] = await Promise.allSettled([
      api.get("/reports"),
      api.get("/stats/public"),
    ]);
    if (reportsResult.status === "fulfilled") {
      const list = Array.isArray(reportsResult.value?.data)
        ? reportsResult.value.data
        : [];
      setReports(list.slice(0, 5));
    }
    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value?.data || null);
    }
    if (reportsResult.status === "rejected") {
      const loadError = reportsResult.reason;
      setError(
        loadError?.response?.data?.error ||
          loadError?.message ||
          "Failed to load reports. Is the backend running?",
      );
    } else {
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);
  usePolling(loadReports);

  return (
    <div>
      <section className="kw-hero">
        <div className="kw-hero-inner">
          <h2 className="kw-hero-title">
            Report corruption. <span>Safely. Anonymously.</span>
          </h2>
          <p className="kw-hero-sub">
            Witnessed a bribe demand? Kicked back a "facilitation fee"? Report
            it in minutes - no name, no account, no way back to you.
          </p>
          <Link to="/submit" className="kw-btn kw-cta-button">
            Report corruption now
          </Link>
          <div className="kw-hero-stats">
            <div className="kw-hero-stat">
              <div className="kw-hero-stat-num">
                {stats ? stats.totalReports : "—"}
              </div>
              <div className="kw-hero-stat-label">cases reported</div>
            </div>
            <div className="kw-hero-stat">
              <div className="kw-hero-stat-num">
                {stats ? stats.resolvedReports : "—"}
              </div>
              <div className="kw-hero-stat-label">resolved so far</div>
            </div>
            <div className="kw-hero-stat">
              <div className="kw-hero-stat-num">
                {stats && stats.resolutionRate !== null
                  ? `${stats.resolutionRate}%`
                  : "—"}
              </div>
              <div className="kw-hero-stat-label">resolution rate</div>
            </div>
          </div>
        </div>
      </section>

      <section className="kw-anonymity" aria-labelledby="kw-anonymity-heading">
        <h3 id="kw-anonymity-heading">How your anonymity actually works</h3>
        <div className="kw-anonymity-grid">
          {ANONYMITY_STEPS.map((step) => (
            <div className="kw-anonymity-card" key={step.title}>
              <span className="kw-anonymity-icon" aria-hidden="true">
                {step.icon}
              </span>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="kw-reports-summary">
        <h2 style={{ margin: 0 }}>{t("home_title")}</h2>
        <div className="kw-reports-meta">
          {reports.length < 5 ? reports.length : "5 most recent"} case
          {reports.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="kw-helper" style={{ marginBottom: 16 }}>
        {t("home_helper")} {t("home_haveRef")}{" "}
        <Link to="/track">{t("home_lookup")}</Link>.
      </div>
      {error && <div className="error">{error}</div>}
      {loading ? (
        <div className="kw-empty-state">{t("home_loading")}</div>
      ) : (
        <div className="reports-list">
          {reports.length === 0 && (
            <div className="kw-empty-state">
              <span
                role="img"
                aria-label="no reports"
                className="kw-empty-emoji"
              >
                📋
              </span>
              <div>{t("home_empty")}</div>
            </div>
          )}
          {reports.map((r) => (
            <div className="report-card kw-pro-card" key={r._id}>
              <div className="kw-pro-card-row">
                <h3>{r.title}</h3>
                <span className={`kw-status-badge ${statusClass(r.status)}`}>
                  {r.status}
                </span>
              </div>
              <div className="kw-pro-meta">
                <span className="kw-tracking-chip">{r.trackingReference}</span>
              </div>
              <div className="kw-pro-meta">
                <b>Category:</b> {r.reportedCategory}
              </div>
              <div className="kw-pro-meta">
                <b>Location:</b> {r.subCounty}, {r.county}
              </div>
              <div className="kw-pro-meta">
                <b>Evidence:</b>{" "}
                {r.evidenceCount > 0 ? (
                  `${r.evidenceCount} file(s) attached`
                ) : (
                  <span className="kw-faded">None</span>
                )}
              </div>
              <div className="kw-pro-meta">
                <b>Submitted:</b> {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;
