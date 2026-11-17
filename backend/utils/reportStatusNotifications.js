// Reporter status-change notifications (decision #23).
//
// "Email me about status changes on my reports" is a per-account preference
// stored on User.emailNotificationsOptIn. Every status transition that a
// reporter would care about (new case status, approved agency update, and a
// regression-record for a reviewer editing their own submission) goes through
// notifyReporterOfStatusChange so the rules live in exactly one place.
//
// Path A (anonymous) reporters are never proactively contacted, by design -
// they were never asked, and silence is the safer default for this project.

const User = require("../user.model");
const mailer = require("./mailer");
const sms = require("./sms");
const webPush = require("./webPush");

const FRONTEND_ORIGIN = () =>
  (process.env.FRONTEND_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildStatusEmail({
  report,
  status,
  resolutionNote,
  resolutionReference,
  rejectionReason,
  ownerName,
}) {
  const subject = `Kenya Watch: report ${report.trackingReference} is now "${status}"`;
  const lines = [
    `Hello${ownerName ? ` ${ownerName.split(/\s+/)[0]}` : ""},`,
    "",
    `Your report "${report.title}" (${report.trackingReference}) has a new status: ${status}.`,
  ];
  if (status === "Resolved" && resolutionNote) {
    lines.push("", `Resolution: ${resolutionNote}`);
    if (resolutionReference) lines.push(`Reference: ${resolutionReference}`);
  }
  if (status === "Rejected" && rejectionReason) {
    lines.push("", `Reason: ${rejectionReason}`);
  }
  lines.push(
    "",
    `See the full case: ${FRONTEND_ORIGIN()}/my-reports`,
    "",
    'You are receiving this because you chose "Email me about status changes on my reports" when creating your Kenya Watch account.',
    "To stop these emails, sign in to My Reports and turn off status email notifications.",
    "",
    "- Kenya Watch",
  );

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;color:#10243b;line-height:1.6;max-width:560px">
      <p>Hello${ownerName ? ` ${escapeHtml(ownerName.split(/\s+/)[0])}` : ""},</p>
      <p>Your report <strong>${escapeHtml(report.title)}</strong>
        (<span style="font-family:Consolas,monospace">${escapeHtml(report.trackingReference)}</span>)
        has a new status: <strong>${escapeHtml(status)}</strong>.</p>
      ${
        status === "Resolved" && resolutionNote
          ? `<p><strong>Resolution:</strong> ${escapeHtml(resolutionNote)}${
              resolutionReference
                ? `<br><strong>Reference:</strong> ${escapeHtml(resolutionReference)}`
                : ""
            }</p>`
          : ""
      }
      ${status === "Rejected" && rejectionReason ? `<p><strong>Reason:</strong> ${escapeHtml(rejectionReason)}</p>` : ""}
      <p><a href="${FRONTEND_ORIGIN()}/my-reports" style="color:#0f766e">Open my reports</a></p>
      <p style="font-size:12px;color:#64748b">You asked Kenya Watch to email you about status changes on your reports.
        You can turn this off any time from My Reports.</p>
    </div>`;

  return { subject, text: lines.join("\n"), html };
}

async function sendStatusEmail(owner, report, extra = {}) {
  const message = buildStatusEmail({ report, ownerName: owner.name, ...extra });
  return mailer.sendMail({
    to: owner.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
    headers: {
      // Lets mailbox providers and support handle these as transactional mail
      // and gives the account-holder a stable thread id per case.
      "X-KenyaWatch-Report": String(report.trackingReference || ""),
      "List-Unsubscribe": `<${FRONTEND_ORIGIN()}/my-reports>`,
    },
  });
}

/**
 * Fire-and-forget status email. Never throws, never blocks the API response -
 * email delivery is a convenience, not a workflow dependency.
 * Returns { sent, reason } so callers (and tests) can see what happened.
 */
function notifyReporterOfStatusChange(
  report,
  { status, resolutionNote, resolutionReference, rejectionReason },
) {
  if (!report || !report.user)
    return Promise.resolve({ email: false, sms: false, reason: "anonymous_report" });
  return User.findById(report.user)
    .then(async (owner) => {
      if (!owner) return { email: false, sms: false, reason: "owner_not_found" };
      const result = { email: false, sms: false };

      if (owner.emailNotificationsOptIn) {
        try {
          await sendStatusEmail(owner, report, {
            status,
            resolutionNote,
            resolutionReference,
            rejectionReason,
          });
          result.email = true;
        } catch (error) {
          console.error("[status email] send failed:", error.message);
          result.emailError = error.message;
        }
      }

      // SMS is a compact, non-identifying twin of the email. It never repeats
      // the narrative, the category detail, or any person's name.
      if (
        owner.smsNotificationsOptIn &&
        owner.phoneNumber &&
        sms.isSmsConfigured()
      ) {
        try {
          await sms.sendSms({
            to: owner.phoneNumber,
            message: sms.buildStatusSms({
              trackingReference: report.trackingReference,
              status,
              hasResolution: Boolean(resolutionNote),
            }),
          });
          result.sms = true;
        } catch (error) {
          console.error("[status sms] send failed:", error.message);
          result.smsError = error.message;
        }
      }

      // Zero-cost phone alert (Web Push). This is the option that works on a
      // SIM with no airtime: the handset's push service delivers it over the
      // internet, so it costs nothing per message.
      if (
        owner.pushNotificationsOptIn &&
        (owner.pushSubscriptions || []).length &&
        webPush.isPushConfigured()
      ) {
        const pushResult = await webPush.sendPushToUser(
          owner,
          webPush.buildStatusPush({
            trackingReference: report.trackingReference,
            status,
            hasResolution: Boolean(resolutionNote),
          }),
        );
        result.push = pushResult.sent > 0;
        if (pushResult.removeEndpoints.length) {
          owner.pushSubscriptions = owner.pushSubscriptions.filter(
            (item) => !pushResult.removeEndpoints.includes(item.endpoint),
          );
          if (!owner.pushSubscriptions.length) owner.pushNotificationsOptIn = false;
          await owner.save();
        }
      }
      return result;
    })
    .catch((error) => {
      console.error("[status notification] failed:", error.message);
      return { email: false, sms: false, reason: "send_failed", error: error.message };
    });
}

/** Used by the "send me a test email" button so a reporter can verify delivery. */
async function sendNotificationOptInConfirmation(owner, report) {
  const message = buildStatusEmail({
    report: report || {
      trackingReference: "KW-TEST",
      title: "Test notification",
    },
    status: "In Review",
    ownerName: owner.name,
  });
  return mailer.sendMail({
    to: owner.email,
    subject: "Kenya Watch: status email notifications are on",
    text: `This is a test of your Kenya Watch status email notifications.\n\n${message.text}`,
    html: message.html,
  });
}

module.exports = {
  buildStatusEmail,
  notifyReporterOfStatusChange,
  sendNotificationOptInConfirmation,
  sendStatusEmail,
};
