const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
require("dotenv").config();
const createApp = require("../app");
const User = require("../user.model");
const webPush = require("../utils/webPush");

const TEST_MONGO_URI =
  process.env.TEST_MONGO_URI || "mongodb://localhost:27017/kenya_watch_test";

let app;
let user;
let cookie;

const subscription = {
  endpoint: "https://push.example.test/send/abc123",
  expirationTime: null,
  keys: { p256dh: "BPBz-valid-looking-p256dh-key", auth: "auth-secret" },
};

test.before(async () => {
  process.env.NODE_ENV = "test";
  await mongoose.connect(TEST_MONGO_URI);
  app = createApp();
  const registration = await request(app).post("/api/auth/register").send({
    name: "Push Citizen",
    email: "push-citizen@example.com",
    password: "StrongPassw0rd!",
  });
  assert.strictEqual(registration.status, 201);
  cookie = registration.headers["set-cookie"]
    .find((value) => value.startsWith("kw_token="))
    .split(";")[0];
  user = await User.findOne({ email: "push-citizen@example.com" });
});

test.after(async () => {
  await mongoose.connection.db.dropDatabase();
  await mongoose.disconnect();
});

test("phone alerts need authentication and reject malformed subscriptions", async () => {
  const anonymous = await request(app)
    .post("/api/auth/push-subscriptions")
    .send({ subscription });
  assert.strictEqual(anonymous.status, 401);

  const malformed = await request(app)
    .post("/api/auth/push-subscriptions")
    .set("Cookie", cookie)
    .send({ subscription: { endpoint: "not-a-url", keys: {} } });
  assert.strictEqual(malformed.status, 400);
});

test("a device subscription is stored once, even when the browser re-subscribes", async () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const saved = await request(app)
      .post("/api/auth/push-subscriptions")
      .set("Cookie", cookie)
      .send({ subscription });
    assert.strictEqual(saved.status, 201);
    assert.strictEqual(
      saved.body.devices,
      1,
      "re-subscribing the same endpoint must not duplicate it",
    );
  }

  const stored = await User.findById(user._id);
  assert.strictEqual(stored.pushNotificationsOptIn, true);
  assert.strictEqual(stored.pushSubscriptions.length, 1);
  assert.strictEqual(stored.pushSubscriptions[0].keys.auth, "auth-secret");
});

test("a test alert is delivered through the push service without any airtime", async () => {
  const originalSent = webPush.sendPushToUser;
  const calls = [];
  webPush.sendPushToUser = async (target, payload) => {
    calls.push({ target: target._id.toString(), payload });
    return { sent: 1, failed: 0, removeEndpoints: [] };
  };
  try {
    const response = await request(app)
      .post("/api/auth/push-test")
      .set("Cookie", cookie);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.sent, 1);
    assert.strictEqual(calls.length, 1);
    assert.equal(calls[0].target, user._id.toString());
    assert.match(calls[0].payload.title, /Kenya Watch/);
  } finally {
    webPush.sendPushToUser = originalSent;
  }
});

test("status push text carries only the reference and status, never the narrative", () => {
  const payload = webPush.buildStatusPush({
    trackingReference: "KW-ABC123",
    status: "In Review",
    hasResolution: false,
  });
  assert.match(payload.title, /KW-ABC123/);
  assert.match(payload.body, /In Review/);
  assert.strictEqual(payload.link, "/my-reports");
});

test("unsubscribing a device clears the stored endpoint and preference", async () => {
  const removed = await request(app)
    .delete("/api/auth/push-subscriptions")
    .set("Cookie", cookie)
    .send({ endpoint: subscription.endpoint });
  assert.strictEqual(removed.status, 200);
  assert.strictEqual(removed.body.subscribed, false);

  const stored = await User.findById(user._id);
  assert.strictEqual(stored.pushSubscriptions.length, 0);
  assert.strictEqual(stored.pushNotificationsOptIn, false);
});

test('web push reports "not configured" instead of pretending to send', async () => {
  const savedPublic = process.env.VAPID_PUBLIC_KEY;
  const savedPrivate = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  try {
    assert.strictEqual(webPush.isPushConfigured(), false);
    const result = await webPush.sendPushToUser(user, {
      title: "x",
      body: "y",
    });
    assert.deepStrictEqual(result.reason, "not_configured");
    assert.strictEqual(result.sent, 0);
  } finally {
    if (savedPublic !== undefined) process.env.VAPID_PUBLIC_KEY = savedPublic;
    if (savedPrivate !== undefined)
      process.env.VAPID_PRIVATE_KEY = savedPrivate;
  }
});
