import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  disablePushAlerts,
  enablePushAlerts,
  pushSupport,
  sendTestPush,
} from "../pushAlerts";

/**
 * "Email me about status changes on my reports" - visible, editable, and
 * testable after registration. The toggle is backed by
 * PATCH /api/auth/notification-preferences, which is the same flag the status
 * route reads before sending mail.
 */
function NotificationSettings() {
  const { user, updateNotificationPreferences } = useAuth();
  const [emailOn, setEmailOn] = useState(
    Boolean(user?.emailNotificationsOptIn),
  );
  const [smsOn, setSmsOn] = useState(Boolean(user?.smsNotificationsOptIn));
  const [phone, setPhone] = useState(user?.phoneNumber || "");
  const [smsAvailable, setSmsAvailable] = useState(Boolean(user?.smsAvailable));
  const [smsSandboxOnly, setSmsSandboxOnly] = useState(
    Boolean(user?.smsSandboxOnly),
  );
  const [pushAvailable, setPushAvailable] = useState(
    Boolean(user?.pushAvailable),
  );
  const [pushOn, setPushOn] = useState(Boolean(user?.pushNotificationsOptIn));
  const [pushBusy, setPushBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setEmailOn(Boolean(user?.emailNotificationsOptIn));
    setSmsOn(Boolean(user?.smsNotificationsOptIn));
    setPhone(user?.phoneNumber || "");
    setPushAvailable(Boolean(user?.pushAvailable));
    setPushOn(Boolean(user?.pushNotificationsOptIn));
  }, [
    user?.emailNotificationsOptIn,
    user?.smsNotificationsOptIn,
    user?.phoneNumber,
    user?.pushAvailable,
    user?.pushNotificationsOptIn,
  ]);

  // Loads the public VAPID key lazily: it is only needed while subscribing.
  const pushPublicKey = React.useRef(null);
  const loadPublicKey = async () => {
    if (pushPublicKey.current) return pushPublicKey.current;
    const response = await (await import("../api")).default.get(
      "/auth/push-config",
    );
    setPushAvailable(Boolean(response.data.available));
    pushPublicKey.current = response.data.publicKey;
    return response.data.publicKey;
  };

  const togglePush = async () => {
    setPushBusy(true);
    setError("");
    setMessage("");
    try {
      if (pushOn) {
        await disablePushAlerts();
        setPushOn(false);
        setMessage("Phone alerts are now off for this device.");
      } else {
        const publicKey = await loadPublicKey();
        await enablePushAlerts(publicKey);
        setPushOn(true);
        setMessage(
          "Phone alerts are on for this device. Tap \"Send a test alert\" to confirm it arrives.",
        );
      }
    } catch (pushError) {
      setError(pushError.response?.data?.error || pushError.message);
    } finally {
      setPushBusy(false);
    }
  };

  const testPush = async () => {
    setPushBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await sendTestPush();
      setMessage(
        `Test alert sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. Check your notifications.`,
      );
    } catch (pushError) {
      setError(
        pushError.response?.data?.error || "Could not send the test alert.",
      );
    } finally {
      setPushBusy(false);
    }
  };

  const pushState = pushSupport();

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await updateNotificationPreferences({
        emailNotificationsOptIn: emailOn,
        ...(smsAvailable || smsOn
          ? { smsNotificationsOptIn: smsOn, phoneNumber: phone }
          : {}),
      });
      setSmsAvailable(Boolean(result.smsAvailable));
      setSmsSandboxOnly(Boolean(result.smsSandboxOnly));
      if (result.testSms === "sent" && smsOn) {
        setMessage(
          result.testSmsError ||
            `Saved. A test SMS is on its way to ${result.phoneNumber || phone}.`,
        );
      } else if (result.testSms === "failed" && smsOn) {
        setError(
          `Your preference was saved, but the test SMS could not be sent. ${result.testSmsError || "Check the number and try again."}`,
        );
      } else if (result.testEmail === "failed") {
        setError(
          "Your preference was saved, but the test email could not be delivered. Check the address and try again.",
        );
      } else if (result.testEmail === "sent") {
        setMessage(`Saved. A test email is on its way to ${user.email}.`);
      } else if (emailOn) {
        setMessage(
          `Saved. We will email ${user.email} whenever one of your reports changes status.`,
        );
      } else {
        setMessage(
          "Saved. Status emails are now off. You can still check My Reports any time.",
        );
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Could not save your notification settings.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="kw-notify-panel" aria-labelledby="kw-notify-heading">
      <header className="kw-notify-panel-head">
        <span className="kw-notify-panel-icon" aria-hidden="true">
          🔔
        </span>
        <div>
          <div className="kw-dashboard-eyebrow">NOTIFICATION SETTINGS</div>
          <h2 id="kw-notify-heading">Stay in the loop, quietly</h2>
          <p>
            Only status changes on your reports - never marketing, never your
            case narrative.
          </p>
        </div>
      </header>

      <form onSubmit={save} className="kw-notify-form">
        <div className={`kw-notify-toggle ${emailOn ? "is-on" : ""}`}>
          <div className="kw-notify-toggle-copy">
            <strong>Email me about status changes on my reports</strong>
            <span>
              Sent to <b>{user?.email}</b> when a reviewer moves your case
              forward or closes it.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={emailOn}
            aria-label="Email me about status changes on my reports"
            className="kw-switch"
            onClick={() => setEmailOn((value) => !value)}
          >
            <span className="kw-switch-knob" aria-hidden="true" />
          </button>
        </div>

        <div
          className={`kw-notify-toggle ${smsOn ? "is-on" : ""} ${smsAvailable ? "" : "is-disabled"}`}
        >
          <div className="kw-notify-toggle-copy">
            <strong>
              SMS updates{" "}
              <span className="kw-notify-badge">optional · free tier</span>
            </strong>
            <span>
              {smsAvailable
                ? smsSandboxOnly
                  ? "A short, non-identifying text with your case reference and new status. This deployment is in SMS sandbox mode, so test texts appear in the provider simulator rather than your handset."
                  : "A short, non-identifying text with your case reference and new status. Sent to your handset - carrier rates for receiving SMS may apply."
                : "Not switched on for this deployment yet. Email stays available in the meantime."}
            </span>
            {smsAvailable && (
              <label className="kw-notify-phone">
                <span>Mobile number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="0712 345 678 or +254712345678"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={smsOn}
            aria-label="SMS updates"
            className="kw-switch"
            disabled={!smsAvailable}
            onClick={() => setSmsOn((value) => !value)}
          >
            <span className="kw-switch-knob" aria-hidden="true" />
          </button>
        </div>

        <div
          className={`kw-notify-toggle ${pushOn ? "is-on" : ""} ${pushAvailable ? "" : "is-disabled"}`}
        >
          <div className="kw-notify-toggle-copy">
            <strong>
              Phone alerts{" "}
              <span className="kw-notify-badge">free · no airtime needed</span>
            </strong>
            <span>
              {pushState === "insecure"
                ? "Phone alerts need HTTPS. They will switch on once Kenya Watch is served over a secure connection."
                : pushState === "unsupported"
                  ? "This browser cannot receive phone alerts. On iPhone, add Kenya Watch to your Home Screen first."
                  : !pushAvailable
                    ? "Not switched on for this deployment yet. Email stays available in the meantime."
                    : "A short pop-up on this phone when a case changes status. Delivered over the internet, so it uses no SMS airtime and costs nothing - works while the app is closed."}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pushOn}
            aria-label="Phone alerts"
            className="kw-switch"
            disabled={
              pushBusy ||
              !pushAvailable ||
              pushState !== "supported"
            }
            onClick={togglePush}
          >
            <span className="kw-switch-knob" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="kw-notify-status" role="status">
            {message}
          </div>
        )}

        <div className="kw-notify-actions">
          <button type="submit" className="kw-btn" disabled={busy}>
            {busy ? "Saving…" : "Save notification settings"}
          </button>
          <button
            type="button"
            className="kw-btn kw-btn-secondary"
            disabled={busy || !emailOn}
            onClick={async () => {
              setBusy(true);
              setError("");
              setMessage("");
              try {
                const result = await updateNotificationPreferences({
                  emailNotificationsOptIn: true,
                  sendTestEmail: true,
                });
                if (result.testEmail === "sent")
                  setMessage(`Test email sent to ${user.email}.`);
                else
                  setError(
                    "The test email could not be delivered. Check the address and try again.",
                  );
              } catch (requestError) {
                setError(
                  requestError.response?.data?.error ||
                    "Could not send the test email.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Send a test email
          </button>
          <button
            type="button"
            className="kw-btn kw-btn-secondary"
            disabled={busy || !smsAvailable || !smsOn}
            onClick={async () => {
              setBusy(true);
              setError("");
              setMessage("");
              try {
                const result = await updateNotificationPreferences({
                  smsNotificationsOptIn: true,
                  phoneNumber: phone,
                  sendTestSms: true,
                });
                if (result.testSms === "sent") {
                  setMessage(
                    result.testSmsError ||
                      `Test SMS sent to ${result.phoneNumber || phone}.`,
                  );
                } else {
                  setError(
                    result.testSmsError ||
                      "The test SMS could not be sent. Check the number and try again.",
                  );
                }
              } catch (requestError) {
                setError(
                  requestError.response?.data?.error ||
                    "Could not send the test SMS.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Send a test SMS
          </button>
          <button
            type="button"
            className="kw-btn kw-btn-secondary"
            disabled={pushBusy || !pushOn}
            onClick={testPush}
          >
            Send a test alert
          </button>
        </div>
      </form>
    </section>
  );
}

export default NotificationSettings;
