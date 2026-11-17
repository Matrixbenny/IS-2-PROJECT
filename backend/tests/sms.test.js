const test = require("node:test");
const assert = require("node:assert/strict");
const sms = require("../utils/sms");

const SMS_KEYS = [
  "SMS_PROVIDER",
  "SMS_PROVIDERS",
  "SMS_USERNAME",
  "SMS_API_KEY",
  "SMS_SENDER_ID",
  "SMS_GATEWAY_URL",
  "SMS_GATEWAY_TOKEN",
  "SMS_TEXTBEE_API_KEY",
  "SMS_TEXTBEE_DEVICE_ID",
  "SMS_TEXTBEE_URL",
  "SMS_BULK_SMS_URL",
  "SMS_BULK_SMS_KEY",
  "SMS_TWILIO_ACCOUNT_SID",
];

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of SMS_KEYS) saved[key] = process.env[key];
  for (const key of SMS_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of SMS_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    });
}

test("Kenyan phone numbers normalise to E.164 from every common way of typing them", () => {
  for (const input of [
    "0712345678",
    "712345678",
    "254712345678",
    "+254712345678",
    "+2540712345678",
    "0712 345 678",
    "+254 712-345-678",
  ]) {
    assert.equal(sms.normaliseKenyanPhoneNumber(input), "+254712345678", input);
  }
  // 01xx numbers are real Safaricom/Airtel prefixes and must not be mistaken
  // for an 07xx number with a stray leading zero.
  assert.equal(sms.normaliseKenyanPhoneNumber("0112345678"), "+254112345678");
  for (const invalid of [
    "",
    null,
    undefined,
    "12345",
    "+255712345678",
    "0812345678",
    "abc",
  ]) {
    assert.equal(
      sms.normaliseKenyanPhoneNumber(invalid),
      null,
      String(invalid),
    );
  }
});

test("SMS is unavailable until a provider with its required settings is configured", async () => {
  await withEnv({}, () => {
    assert.equal(sms.isSmsConfigured(), false);
    assert.deepEqual(sms.configuredProviders(), []);
  });

  await withEnv(
    { SMS_PROVIDER: "africastalking", SMS_USERNAME: "sandbox" },
    () => {
      assert.equal(sms.isSmsConfigured(), false, "an API key is also required");
    },
  );

  await withEnv(
    {
      SMS_PROVIDER: "africastalking",
      SMS_USERNAME: "sandbox",
      SMS_API_KEY: "sandbox-key",
    },
    () => {
      assert.equal(sms.isSmsConfigured(), true);
      assert.equal(
        sms.isSandboxOnly(),
        true,
        "sandbox messages never reach a real handset",
      );
    },
  );

  await withEnv(
    {
      SMS_PROVIDER: "android_gateway",
      SMS_GATEWAY_URL: "http://phone.local/send",
    },
    () => {
      assert.equal(sms.isSmsConfigured(), true);
      assert.equal(sms.isSandboxOnly(), false);
    },
  );
});

test("a provider chain is tried in order and a working provider short-circuits the rest", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  try {
    await withEnv(
      {
        SMS_PROVIDERS: "android_gateway,textbee,africastalking",
        SMS_GATEWAY_URL: "http://phone.local/send",
        SMS_GATEWAY_TOKEN: "gateway-token",
        SMS_TEXTBEE_API_KEY: "textbee-key",
        SMS_TEXTBEE_DEVICE_ID: "device-1",
        SMS_TEXTBEE_URL: "http://textbee.local/api/v1",
        SMS_USERNAME: "sandbox",
        SMS_API_KEY: "sandbox-key",
      },
      async () => {
        global.fetch = async (url, options) => {
          calls.push({ url: String(url), options });
          if (String(url).includes("phone.local")) {
            return {
              ok: false,
              status: 503,
              text: async () => "phone offline",
            };
          }
          return { ok: true, status: 200, text: async () => '{"id":"msg-1"}' };
        };

        const result = await sms.sendSms({
          to: "0712 345 678",
          message: "Kenya Watch test",
        });
        assert.equal(
          result.provider,
          "textbee",
          "the first failing provider must fall through to the next",
        );
        assert.equal(calls.length, 2);
        assert.equal(calls[0].url, "http://phone.local/send");
        assert.equal(
          calls[0].options.headers.Authorization,
          "Bearer gateway-token",
        );
        assert.equal(
          calls[1].url,
          "http://textbee.local/api/v1/gateways/device-1/sms",
        );
        assert.equal(calls[1].options.headers["x-api-key"], "textbee-key");
        assert.deepEqual(JSON.parse(calls[1].options.body), {
          recipients: ["+254712345678"],
          message: "Kenya Watch test",
        });
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("sending fails loudly with every provider error when nothing accepts the message", async () => {
  const originalFetch = global.fetch;
  try {
    await withEnv(
      {
        SMS_PROVIDER: "android_gateway",
        SMS_GATEWAY_URL: "http://phone.local/send",
      },
      async () => {
        global.fetch = async () => ({
          ok: false,
          status: 500,
          text: async () => "boom",
        });
        await assert.rejects(
          () => sms.sendSms({ to: "+254712345678", message: "hello" }),
          (error) => /android_gateway: .*boom/.test(error.message),
        );
        await assert.rejects(
          () => sms.sendSms({ to: "not-a-number", message: "hello" }),
          /not a valid Kenyan mobile number/,
        );
      },
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("status SMS text is compact and never carries report narrative", () => {
  const message = sms.buildStatusSms({
    trackingReference: "KW-ABC123",
    status: "In Review",
  });
  assert.match(message, /KW-ABC123/);
  assert.match(message, /In Review/);
  assert.ok(message.length <= 300);
  assert.equal(sms.truncate("x".repeat(400)).length, 300);
});
