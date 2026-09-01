import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1600, height: 1000 },
  },
  // Dedicated strict port: the suite must NEVER silently reuse an ambient dev
  // server (a stale, OS-throttled orphan on 5173 caused timeout clusters).
  // strictPort makes a collision fail loudly instead of auto-incrementing.
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
