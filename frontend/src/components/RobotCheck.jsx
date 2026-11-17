import React, { useEffect, useState } from "react";
import api from "../api";

// Self-hosted image challenge with a text alternative. Verification is performed
// by the backend; client-side interaction signals are not treated as proof.
function RobotCheck({ onToken, onBusy }) {
  const [state, setState] = useState("idle"); // idle | checking | verified | challenge | image
  const [challenge, setChallenge] = useState(null);
  const [imageChallenge, setImageChallenge] = useState(null); // { prompt, token, tiles }
  const [selected, setSelected] = useState([]); // selected tile ids
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (onBusy) onBusy(state === "checking");
  }, [state, onBusy]);

  const startImageChallenge = async () => {
    setError("");
    setState("checking");
    try {
      const res = await api.get("/reports/captcha-image");
      setImageChallenge(res.data);
      setSelected([]);
      setState("image");
      onToken("", "");
    } catch (err) {
      setError("Could not load the security check. Is the backend running?");
      setState("idle");
      onToken("", "");
    }
  };

  const startTextChallenge = async () => {
    setError("");
    setState("checking");
    try {
      const res = await api.get("/reports/captcha-challenge");
      setChallenge(res.data);
      setAnswer("");
      setState("challenge");
      onToken("", "");
    } catch (err) {
      setError("Could not load the text security check. Is the backend running?");
      setState("idle");
      onToken("", "");
    }
  };

  const submitChallenge = () => {
    if (!challenge) return;
    setError("");
    setState("verified");
    onToken(challenge.token, answer.trim());
  };

  const submitImageChallenge = () => {
    if (!imageChallenge) return;
    setError("");
    if (selected.length === 0) {
      setError("Select at least one image.");
      return;
    }
    // Pass the image token + selected tile ids to the parent form; the report
    // endpoint validates the exact selection server-side (fail closed).
    setState("verified");
    onToken(imageChallenge.token, JSON.stringify(selected));
  };

  const toggleTile = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const reset = () => {
    setState("idle");
    setChallenge(null);
    setImageChallenge(null);
    setSelected([]);
    setAnswer("");
    setError("");
    onToken("", "");
  };

  return (
    <div className="kw-robotcheck">
      {state === "image" ? (
        // NOTE: no <form> here - this widget renders inside the report form, and
        // nested <form> elements are invalid HTML (browsers drop the inner one,
        // which made "Verify" submit the whole report instead). Plain divs +
        // type="button" buttons keep the outer form safe.
        <div className="kw-robotcheck-card kw-robotcheck-image">
          <div className="kw-robotcheck-image-head">
            <span className="kw-robotcheck-logo" aria-hidden="true">🛡️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Quick security check</div>
              <div style={{ fontSize: "0.92rem" }}>{imageChallenge?.prompt}</div>
            </div>
          </div>
          <div className="kw-robotcheck-grid" role="group" aria-label={imageChallenge?.prompt}>
            {imageChallenge?.tiles.map((tile) => (
              <button
                type="button"
                key={tile.id}
                className={`kw-robotcheck-tile ${selected.includes(tile.id) ? "selected" : ""}`}
                onClick={() => toggleTile(tile.id)}
                aria-pressed={selected.includes(tile.id)}
                aria-label={`Image tile ${tile.id + 1} of 9`}
                dangerouslySetInnerHTML={{ __html: tile.svg }}
              />
            ))}
          </div>
          <div className="kw-helper" role="status" aria-live="polite">
            {selected.length} image{selected.length === 1 ? "" : "s"} selected.
          </div>
          <div className="kw-robotcheck-footer">
            <button type="button" className="kw-robotcheck-refresh" title="Verify selection" onClick={submitImageChallenge}>✓ Verify</button>
            <button type="button" className="kw-robotcheck-refresh" onClick={startImageChallenge} title="Get a new image challenge">↻ New challenge</button>
            <button type="button" className="kw-robotcheck-refresh" onClick={startTextChallenge}>Use text check</button>
          </div>
        </div>
      ) : state === "challenge" ? (
        <div className="kw-robotcheck-card kw-robotcheck-challenge">
          <div className="kw-robotcheck-body">
            <span className="kw-robotcheck-logo" aria-hidden="true">🛡️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Quick security check</div>
              <div style={{ fontSize: "0.92rem", marginBottom: 8 }}>{challenge?.question}</div>
              <input
                aria-label="Security check answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitChallenge();
                  }
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 4,
                  border: "1px solid #cbd5e1",
                }}
              />
            </div>
          </div>
          <div className="kw-robotcheck-footer">
            <button type="button" className="kw-robotcheck-refresh" title="Verify answer" onClick={submitChallenge}>✓ Verify</button>
            <button type="button" className="kw-robotcheck-refresh" onClick={reset} title="Try the automatic check again">↻ Retry</button>
            <button type="button" className="kw-robotcheck-refresh" onClick={startImageChallenge}>Use image check</button>
          </div>
        </div>
      ) : (
        <div className="kw-robotcheck-card">
          <div className="kw-robotcheck-body">
            <button
              type="button"
              className="kw-robotcheck-checkbox"
              aria-label={state === "verified" ? "Human verification complete" : "Start human verification"}
              disabled={state === "checking" || state === "verified"}
              onClick={startImageChallenge}
            >
              {state === "verified" && (
                <span className="kw-robotcheck-check" aria-hidden="true">
                  ✔
                </span>
              )}
            </button>
            <button
              type="button"
              className="kw-robotcheck-label"
              disabled={state !== "idle"}
              onClick={startImageChallenge}
            >
              {state === "verified" ? "Verification complete" : "I'm not a robot"}
            </button>
            <span className="kw-robotcheck-logo" aria-hidden="true">
              {state === "checking" ? (
                <span
                  className="kw-robotcheck-spinner"
                  role="status"
                  aria-label="Verifying"
                />
              ) : (
                "🛡️"
              )}
            </span>
          </div>
          <div className="kw-robotcheck-footer">
            <span className="kw-robotcheck-brand">Kenya Watch Verify</span>
            {state === "idle" && (
              <button type="button" className="kw-robotcheck-refresh" onClick={startTextChallenge}>
                Use text check instead
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default RobotCheck;
