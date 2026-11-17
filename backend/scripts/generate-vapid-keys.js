// Generates the Web Push VAPID key pair used for zero-cost phone alerts.
// Run once:  node scripts/generate-vapid-keys.js
// Then paste the two lines into backend/.env. Nothing is sent anywhere and no
// account is required - the keys are just a local signing identity.
const webpush = require("web-push");

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("Add these to backend/.env (keep the private key secret):\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:you@example.com");
