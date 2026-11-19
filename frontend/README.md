# Kenya Watch – Frontend

React 19 single-page app (built with Vite) for the Kenya Watch anonymous corruption-reporting platform. It talks to the Express API in [`../backend`](../backend/); see the [root README](../README.md) for full setup, the Admin account, and the agency workflow.

## Scripts

| Command | What it does |
|---|---|
| `npm start` (or `npm run dev`) | Starts the Vite dev server on <http://localhost:3000> (the port the backend's CORS allow-list expects) |
| `npm test` | Runs the Vitest + React Testing Library suite once |
| `npm run build` | Produces a production build in `build/` |
| `npm run preview` | Serves the production build locally |

## Layout

- `src/pages/` – route-level screens (reporting, tracking, My Reports, Reviewer Queue, Admin, etc.)
- `src/components/` – shared UI (evidence downloads, live recorder, CAPTCHA, notification settings)
- `src/context/` – authentication and language (English/Kiswahili) providers
- `src/i18n/translations.js` – UI strings
- `public/` – PWA manifest, icons and service worker (caches only the static shell, never API data)
