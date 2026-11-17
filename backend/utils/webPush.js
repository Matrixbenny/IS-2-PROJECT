// Zero-cost phone alerts (Web Push / VAPID).
//
// Why this exists: an SMS gateway sends using the SIM's outgoing airtime, so a
// SIM with no credit cannot send anything, and every paid provider bills per
// message. Web Push instead uses the push service that every Android/iOS
// browser already ships with (Chrome -> FCM, Safari -> APNs). Delivery to the
// handset is free, needs no airtime, no SIM and no SMS credits - only an
// internet connection, which can be free Wi-Fi.
//
// Requirements on the deployment:
//   * HTTPS (or localhost) - service workers only run in a secure context.
//   * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in .env.
// Generate a key pair once with:
//   node scripts/generate-vapid-keys.js
//
// There is no third-party account to create and no per-message charge.

const webpush = require("web-push");

function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@kenyawatch.local",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

/**
 * Sends one push notification to every device a user registered. Invalid or
 * expired endpoints (404/410 from the push service) are returned in
 * `removeEndpoints` so the caller can prune them from the account.
 * Returns { sent, failed, removeEndpoints, reason? } and never throws.
 */
async function sendPushToUser(user, payload) {
  if (!isPushConfigured())
    return {
      sent: 0,
      failed: 0,
      removeEndpoints: [],
      reason: "not_configured",
    };
  const subscriptions = Array.isArray(user?.pushSubscriptions)
    ? user.pushSubscriptions
    : [];
  if (!subscriptions.length)
    return {
      sent: 0,
      failed: 0,
      removeEndpoints: [],
      reason: "no_subscriptions",
    };

  configure();
  const body = JSON.stringify(payload);
  const result = { sent: 0, failed: 0, removeEndpoints: [] };

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            expirationTime: subscription.expirationTime || null,
            keys: subscription.keys,
          },
          body,
          { TTL: 24 * 60 * 60 },
        );
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        // 404/410 mean the browser dropped the subscription (app uninstalled,
        // permission revoked). Prune it rather than retrying forever.
        if (error.statusCode === 404 || error.statusCode === 410) {
          result.removeEndpoints.push(subscription.endpoint);
        } else {
          console.error("[web push] send failed:", error.message);
        }
      }
    }),
  );

  return result;
}

/**
 * The push twin of the status email/SMS: reference + status only, so a
 * notification preview never exposes the narrative on a shared screen.
 */
function buildStatusPush({ trackingReference, status, hasResolution }) {
  const body =
    status === "Resolved" && hasResolution
      ? "A resolution note is waiting in My Reports."
      : status === "Rejected"
        ? "Open My Reports to see the reason."
        : "Open My Reports to track it.";
  return {
    title: `Kenya Watch: ${trackingReference}`,
    body: `Status is now ${status}. ${body}`,
    link: "/my-reports",
  };
}

module.exports = { buildStatusPush, isPushConfigured, sendPushToUser };
