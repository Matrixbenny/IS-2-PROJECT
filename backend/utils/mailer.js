const nodemailer = require('nodemailer');

// No real SMTP provider is configured for this project (no shared credentials to use
// safely). Instead this uses Nodemailer's built-in Ethereal test account support -
// a real SMTP transaction actually happens, but it lands in a disposable sandbox inbox
// (https://ethereal.email/) rather than a real recipient. This is the standard, honest
// way to demonstrate real email-sending code without needing production credentials.
let transporterPromise = null;

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = nodemailer.createTestAccount().then((account) => {
      const transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass }
      });
      console.log(`[mailer] Ethereal test inbox ready: ${account.user}`);
      return transporter;
    });
  }
  return transporterPromise;
}

// Sends a real SMTP message; resolves with a preview URL for the sandbox inbox (dev/demo only).
async function sendMail({ to, subject, text, html }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: '"Kenya Watch" <no-reply@kenyawatch.local>',
    to,
    subject,
    text,
    html: html || `<p>${text}</p>`
  });
  const previewUrl = nodemailer.getTestMessageUrl(info);
  console.log(`[mailer] Sent "${subject}" to ${to} - preview: ${previewUrl}`);
  return { messageId: info.messageId, previewUrl };
}

module.exports = { sendMail };
