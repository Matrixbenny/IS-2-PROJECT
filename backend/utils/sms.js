// SMS notifications (decision #33) - a free-first provider layer.
//
// Sending a real SMS always costs *someone* money; this module is built so the
// cost never falls on a paid bulk-SMS subscription. Providers, cheapest first:
//
// 1. android_gateway  (recommended for real phones, completely free)
//    App (e.g. opensource SMSGate, https://sms-gate.app) on an Android phone
//    with a SIM. POST { to, message } to SMS_GATEWAY_URL with an optional
//    `Authorization: Bearer <SMS_GATEWAY_TOKEN>`. Message goes via the phone's
//    own airtime, so it reaches real handsets at no API cost.
//
// 2. textbee         (free hosted open-source gateway)
//    Register a phone at https://textbee.dev, then POST { recipients,
//    message } to SMS_TEXTBEE_URL/api/v3/gateways/<device>/sms with an
//    `x-api-key: <SMS_TEXTBEE_API_KEY>` header.
//
// 3. africastalking  (free sandbox / paid production)
//    username=sandbox + sandbox key is free but messages only appear in the
//    Africa's Talking simulator. A production username/USSD is billed per SMS.
//
// 4. bulk_sms        (backup via a generic Kenyan HTTP bulk-SMS gateway)
//    POST { recipient, sender, message } to SMS_BULK_SMS_URL with an api-key
//    header, e.g. intended for a hero-sms / sandbox trial that is *not* needed
//    through Africa's Talking.
//
// 5. twilio          (paid, kept only for completeness)
//    Sends real SMS via SMS_TWILIO_* if a paid account is ever used.
//
// When several providers are configured, sendSms() tries them in the order
// SMS_PROVIDERS (comma separated); otherwise it uses SMS_PROVIDER. Failing
// silently must never balloon into "I received an SMS that was never sent", so
// every send returns the provider that accepted it or throws the last error.

const { normaliseForMatching } = require("./kenyaLingo");

const DEFAULT_AT_ENDPOINT = "https://api.africastalking.com/version1/messaging";
const DEFAULT_TEXTBEE_ENDPOINT = "https://api.textbee.dev/api/v1";
const DEFAULT_TWILIO_ENDPOINT = "https://api.twilio.com/2010-04-01/Accounts";
const MAX_SMS_CHARS = 300;
const KNOWN_PROVIDERS = [
  "android_gateway",
  "textbee",
  "africastalking",
  "bulk_sms",
  "twilio",
];

function readProviderList() {
  const raw = (process.env.SMS_PROVIDERS || process.env.SMS_PROVIDER || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return raw.filter((value) => KNOWN_PROVIDERS.includes(value));
}

function isProviderConfigured(provider) {
  switch (provider) {
    case "android_gateway":
      return Boolean(process.env.SMS_GATEWAY_URL);
    case "textbee":
      return Boolean(
        process.env.SMS_TEXTBEE_API_KEY && process.env.SMS_TEXTBEE_DEVICE_ID,
      );
    case "africastalking":
      return Boolean(process.env.SMS_USERNAME && process.env.SMS_API_KEY);
    case "bulk_sms":
      return Boolean(process.env.SMS_BULK_SMS_URL);
    case "twilio":
      return Boolean(
        process.env.SMS_TWILIO_ACCOUNT_SID &&
        process.env.SMS_TWILIO_AUTH_TOKEN &&
        process.env.SMS_TWILIO_FROM,
      );
    default:
      return false;
  }
}

/** Provider names that are configured and will actually be attempted, in order. */
function configuredProviders() {
  return readProviderList().filter(isProviderConfigured);
}

/** True when some SMS provider is configured for this deployment. */
function isSmsConfigured() {
  return configuredProviders().length > 0;
}

function isSandboxOnly() {
  const providers = configuredProviders();
  return (
    providers.length > 0 &&
    providers.every((p) => p === "africastalking") &&
    String(process.env.SMS_USERNAME || "")
      .trim()
      .toLowerCase() === "sandbox"
  );
}

/**
 * Accepts 0712345678, 254712345678, +254712345678, +2540712345678 and spaces /
 * dashes, then returns E.164 (+2547XXXXXXXX). Returns null if it is not a
 * plausible Kenyan mobile number.
 */
function normaliseKenyanPhoneNumber(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  let local = digits;
  if (local.startsWith("254")) local = local.slice(3);
  // A real +2540112... is possible once 01xxxxxxx local numbers are entered
  // without the leading 0, so strip any leading 0 that follows the country code
  // before matching local prefixes below.
  if (local.startsWith("0")) local = local.slice(1);
  // Safaricom/Airtel/Telkom/Equitel mobile prefixes: 01xx or 07xx.
  if (!/^[17]\d{8}$/.test(local)) return null;
  return `+254${local}`;
}

function truncate(text, max = MAX_SMS_CHARS) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

async function postJson(url, body, headers = {}) {
  if (typeof fetch !== "function")
    throw new Error("This Node version has no global fetch.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `SMS provider responded ${response.status}: ${text.slice(0, 200)}`,
    );
  }
  return text.slice(0, 500);
}

async function sendViaAndroidGateway({ to, message }) {
  const headers = {};
  if (process.env.SMS_GATEWAY_TOKEN) {
    headers.Authorization = `Bearer ${process.env.SMS_GATEWAY_TOKEN}`;
  }
  const response = await postJson(
    process.env.SMS_GATEWAY_URL,
    { to, message },
    headers,
  );
  return { provider: "android_gateway", response };
}

async function sendViaTextBee({ to, message }) {
  const base = (
    process.env.SMS_TEXTBEE_URL || DEFAULT_TEXTBEE_ENDPOINT
  ).replace(/\/$/, "");
  const url = `${base}/gateways/${encodeURIComponent(process.env.SMS_TEXTBEE_DEVICE_ID)}/sms`;
  const response = await postJson(
    url,
    { recipients: [to], message },
    {
      "x-api-key": process.env.SMS_TEXTBEE_API_KEY,
    },
  );
  return { provider: "textbee", response };
}

async function sendViaAfricasTalking({ to, message }) {
  if (typeof fetch !== "function")
    throw new Error("This Node version has no global fetch.");
  const params = new URLSearchParams();
  params.set("username", process.env.SMS_USERNAME);
  params.set("to", to);
  params.set("message", message);
  if (process.env.SMS_SENDER_ID) params.set("from", process.env.SMS_SENDER_ID);

  const response = await fetch(
    process.env.SMS_ENDPOINT || DEFAULT_AT_ENDPOINT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey: process.env.SMS_API_KEY,
        Accept: "application/json",
      },
      body: params.toString(),
    },
  );
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Africa's Talking responded ${response.status}: ${body.slice(0, 200)}`,
    );
  }
  return { provider: "africastalking", response: body.slice(0, 500) };
}

async function sendViaBulkSms({ to, message }) {
  const body = {
    recipient: to.replace(/^\+/, ""),
    message,
  };
  if (process.env.SMS_BULK_SMS_SENDER)
    body.sender = process.env.SMS_BULK_SMS_SENDER;
  const headers = {};
  if (process.env.SMS_BULK_SMS_KEY)
    headers["api-key"] = process.env.SMS_BULK_SMS_KEY;
  const response = await postJson(process.env.SMS_BULK_SMS_URL, body, headers);
  return { provider: "bulk_sms", response };
}

async function sendViaTwilio({ to, message }) {
  if (typeof fetch !== "function")
    throw new Error("This Node version has no global fetch.");
  const sid = process.env.SMS_TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(
    `${sid}:${process.env.SMS_TWILIO_AUTH_TOKEN}`,
  ).toString("base64");
  const params = new URLSearchParams({
    To: to,
    From: process.env.SMS_TWILIO_FROM,
    Body: message,
  });
  const response = await fetch(
    `${process.env.SMS_TWILIO_ENDPOINT || DEFAULT_TWILIO_ENDPOINT}/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`,
      },
      body: params.toString(),
    },
  );
  const body = await response.text();
  if (!response.ok)
    throw new Error(
      `Twilio responded ${response.status}: ${body.slice(0, 200)}`,
    );
  return { provider: "twilio", response: body.slice(0, 500) };
}

const SENDERS = {
  android_gateway: sendViaAndroidGateway,
  textbee: sendViaTextBee,
  africastalking: sendViaAfricasTalking,
  bulk_sms: sendViaBulkSms,
  twilio: sendViaTwilio,
};

/**
 * Sends one SMS, trying each configured provider in order until one accepts
 * it. Throws (with every provider's error joined) only when all fail - callers
 * decide whether that should be logged only (status notifications) or
 * surfaced (practice SMS).
 */
async function sendSms({ to, message }) {
  const providers = configuredProviders();
  if (!providers.length) throw new Error("No SMS provider is configured.");
  const normalised = normaliseKenyanPhoneNumber(to);
  if (!normalised)
    throw new Error("The phone number is not a valid Kenyan mobile number.");
  const body = truncate(message);

  const failures = [];
  for (const provider of providers) {
    try {
      return await SENDERS[provider]({ to: normalised, message: body });
    } catch (error) {
      failures.push(`${provider}: ${error.message}`);
    }
  }
  throw new Error(`All SMS providers failed -> ${failures.join(" | ")}`);
}

/**
 * Builds a compact, non-identifying status SMS. It names the case reference
 * and the new status only - never the narrative, category detail, county, or
 * any person's name - because SMS is not a confidential channel.
 */
function buildStatusSms({ trackingReference, status, hasResolution }) {
  const base = `Kenya Watch: report ${trackingReference} status is now ${status}.`;
  if (status === "Resolved") {
    return truncate(
      `${base} ${hasResolution ? "A resolution note is waiting in My Reports." : ""} Sign in to view.`,
    );
  }
  if (status === "Rejected")
    return truncate(`${base} Sign in to see the reason in My Reports.`);
  return truncate(`${base} Track it at My Reports.`);
}

/**
 * Optional reviewer-attestation helper used by the application form copy:
 * returns a short list of the recognised Sheng/Kiswahili terms in a text, used
 * only for the reviewer hint panel. Exported here so sms.js stays the single
 * place that knows about Kenyan-language message handling.
 */
function lingoHint(text) {
  return normaliseForMatching(text).slice(0, 200);
}

/**
 * Sends a one-off practice SMS so a citizen can confirm their number works
 * before relying on it for case updates.
 */
async function sendPracticeSms(phoneNumber) {
  return sendSms({
    to: phoneNumber,
    message:
      "Kenya Watch: SMS notifications are now on for your account. This is a test message.",
  });
}

module.exports = {
  buildStatusSms,
  configuredProviders,
  isProviderConfigured,
  isSandboxOnly,
  isSmsConfigured,
  lingoHint,
  normaliseKenyanPhoneNumber,
  sendPracticeSms,
  sendSms,
  truncate,
};
