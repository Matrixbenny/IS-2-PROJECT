const nodemailer = require("nodemailer");

let transporterPromise = null;

const DEFAULT_FROM = '"Kenya Watch" <no-reply@kenyawatch.local>';

function getFromAddress() {
  return process.env.MAIL_FROM || DEFAULT_FROM;
}

function getReplyToAddress() {
  // The developer mailbox both sends Kenya Watch mail and acts as the
  // account-less "do not reply" address. Replies should reach a monitored
  // inbox rather than bounce off a from-address that cannot be registered.
  return process.env.MAIL_REPLY_TO || getFromAddress();
}

/**
 * True when the app has real SMTP credentials configured (Gmail app password
 * or another provider). In development without SMTP it falls back to an
 * Ethereal test mailbox, which does NOT reach the recipient's real inbox.
 */
function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

function getTransporter() {
  if (!transporterPromise) {
    const host = process.env.SMTP_HOST;
    if (host) {
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
      transporterPromise = Promise.resolve(transporter);
    } else if (process.env.NODE_ENV === "production") {
      transporterPromise = Promise.reject(
        new Error("SMTP_HOST must be configured in production"),
      );
    } else {
      transporterPromise = nodemailer.createTestAccount().then((account) =>
        nodemailer.createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.secure,
          auth: { user: account.user, pass: account.pass },
        }),
      );
    }
  }
  return transporterPromise;
}

async function sendMail({ to, subject, text, html, replyTo, headers }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: getFromAddress(),
    replyTo: replyTo || getReplyToAddress(),
    to,
    subject,
    text,
    html,
    headers,
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (
    previewUrl &&
    process.env.NODE_ENV !== "production" &&
    process.env.MAIL_LOG_PREVIEW_URL === "true"
  ) {
    console.warn(
      "[mailer] Local-only Ethereal preview URL enabled; treat it as a password-reset secret:",
      previewUrl,
    );
  }
  return {
    messageId: info.messageId,
    previewUrl,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}

module.exports = {
  sendMail,
  isEmailConfigured,
  getFromAddress,
  getReplyToAddress,
};
