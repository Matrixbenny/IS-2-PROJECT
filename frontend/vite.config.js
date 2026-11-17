import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config replacing Create React App (CRA is deprecated; Vite gives instant
// cold starts and hot reload). Dev server stays on port 3000 to match the
// backend's CORS allow-list (FRONTEND_ORIGIN).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "build",
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.js",
    globals: true,
  },
});
