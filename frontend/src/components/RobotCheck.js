import React, { useEffect, useRef, useState } from "react";
import api from "../api";

// Self-hosted reCAPTCHA-style "I'm not a robot" widget (decision #9 keeps the
// challenge on our own infrastructure - no third-party tracking scripts). It
// measures human-like interaction on the page and, on success, returns a signed
// verification token to the parent form. If the behavioral check is inconclusive,
// it falls back to a visual challenge with a text alternative.
//
// Styling mirrors the familiar Google widget look (checkbox card, spinner, green
// check) without copying any Google assets or code.
function RobotCheck({ onToken, onBusy }) {
  const [state, setState] = useState("idle"); // idle | checking | verified | challenge | image
  const [challenge, setChallenge] = useState(null); // text challenge { question, token }
  const [imageChallenge, setImageChallenge] = useState(null); // { prompt, token, tiles }
  const [selected, setSelected] = useState([]); // selected tile ids
  const [answer, setAnswer] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [error, setError] = useState("");
  const mountedAt = useRef(Date.now());
  const pointerMoves = useRef(0);
  const keyEvents = useRef(0);
  const hasPointer = useRef(false);

  useEffect(() => {
    mountedAt.current = Date.now();
    const onMove = () => {
      pointerMoves.current += 1;
      hasPointer.current = true;
    };
    const onKey = () => {
      keyEvents.current += 1;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("touchstart", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchstart", onMove);
    };
  }, []);

  useEffect(() => {
    if (onBusy) onBusy(state === "checking");
  }, [state, onBusy]);

  const verify = async () => {
    setError("");
    setState("checking");
    try {
      const res = await api.post("/reports/captcha-verify", {
        timeSpentMs: Date.now() - mountedAt.current,
        pointerMoves: pointerMoves.current,
        keyEvents: keyEvents.current,
        honeypot,
        hasPointer: hasPointer.current,
      });
      if (res.data.verified) {
        setState("verified");
        onToken(res.data.token, "");
      } else if (res.data.imageMode) {
        setImageChallenge(res.data);
        setSelected([]);
        setState("image");
        onToken("", "");
      } else {
        setChallenge(res.data);
        setState("challenge");
        onToken("", "");
      }
    } catch (err) {
      setError("Verification service unreachable. Is the backend running?");
      setState("idle");
      onToken("", "");
    }
  };

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

  const submitChallenge = async (e) => {
    e.preventDefault();
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
    setHoneypot("");
    setError("");
    onToken("", "");
  };

  return (
    <div className="kw-robotcheck">
      {/* Honeypot: visually hidden, bots tab/fill it, humans never see it */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          height: 0,
          overflow: "hidden",
        }}
      >
        <label htmlFor="kw_honeypot">Leave this field empty</label>
        <input
          id="kw_honeypot"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

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
          <div className="kw-robotcheck-footer">
            <button type="button" className="kw-robotcheck-refresh" title="Verify selection" onClick={submitImageChallenge}>✓ Verify</button>
            <button type="button" className="kw-robotcheck-refresh" onClick={reset} title="Skip to a new challenge">↻ Skip</button>
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
            <div
              className="kw-robotcheck-checkbox"
              role="checkbox"
              aria-checked={state === "verified"}
              tabIndex={0}
              onClick={() => {
                if (state === "idle") verify();
              }}
              onKeyDown={(e) => {
                if ((e.key === " " || e.key === "Enter") && state === "idle") {
                  e.preventDefault();
                  verify();
                }
              }}
            >
              {state === "verified" && (
                <span className="kw-robotcheck-check" aria-hidden="true">
                  ✔
                </span>
              )}
            </div>
            <label
              className="kw-robotcheck-label"
              onClick={() => {
                if (state === "idle") verify();
              }}
            >
              {state === "verified"
                ? "Verified - you are human"
                : "I'm not a robot"}
            </label>
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
            <button
              type="button"
              className="kw-robotcheck-refresh"
              onClick={verify}
              title="Re-run verification"
              disabled={state === "checking"}
            >
              ↻
            </button>
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
