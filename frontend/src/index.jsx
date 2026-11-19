import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Registered in development too, because the service worker is what delivers
// the zero-cost phone alerts (Web Push). Service workers need a secure context,
// which localhost satisfies.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => {
        if (import.meta.env.PROD && !navigator.serviceWorker.controller) {
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
        }
      })
      .catch((error) => console.error('Kenya Watch service worker could not be registered:', error));
  });
}
