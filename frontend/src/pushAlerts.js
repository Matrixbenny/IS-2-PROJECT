import api from './api';

/**
 * Zero-cost phone alerts. Uses the browser's own push service (the same one
 * every phone ships with), so it needs no airtime, SIM credit or SMS gateway -
 * only an internet connection. Requires HTTPS or localhost.
 */
export function pushSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return 'supported';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function readyRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing || navigator.serviceWorker.ready;
}

/** Asks permission (if needed), subscribes this device, and saves it server-side. */
export async function enablePushAlerts(publicKey) {
  const support = pushSupport();
  if (support === 'insecure') {
    throw new Error('Phone alerts need HTTPS. Open Kenya Watch over a secure connection to switch them on.');
  }
  if (support === 'unsupported') {
    throw new Error('This browser does not support phone alerts. On iPhone, add Kenya Watch to your Home Screen first.');
  }
  if (!publicKey) throw new Error('Phone alerts are not switched on for this deployment yet.');

  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked for Kenya Watch. Allow them in your browser settings and try again.');
  }

  const registration = await readyRegistration();
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey)
  });

  const response = await api.post('/auth/push-subscriptions', { subscription: subscription.toJSON() });
  return response.data;
}

/** Removes this device's subscription, server-side and in the browser. */
export async function disablePushAlerts() {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) {
    await api.delete('/auth/push-subscriptions', { data: { endpoint: subscription.endpoint } });
    await subscription.unsubscribe();
  } else {
    await api.delete('/auth/push-subscriptions', { data: {} });
  }
}

export async function sendTestPush() {
  const response = await api.post('/auth/push-test');
  return response.data;
}
