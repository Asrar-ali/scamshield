import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for ScamShield Live.
 *
 * The server keeps sessions/leaderboard in an in-memory store (no MONGODB_URI
 * configured) and runs "keyless" (no GEMINI_API_KEY / ELEVENLABS_API_KEY), so
 * every run exercises the deterministic keyword-matching mock mode in
 * apps/server/src/mock.ts. That determinism is what makes the risk-escalation
 * assertions in e2e/escalation.spec.ts reliable.
 *
 * IMPORTANT: the server broadcasts every WebSocket event to *all* connected
 * clients with no session filtering (see apps/server/src/app.ts `broadcast`).
 * If two browser pages were connected at once, each page's transcript would
 * receive the other session's events too. Tests must therefore never run
 * concurrently against the same server — hence fullyParallel: false and a
 * single worker. See the final report for this documented as a product
 * limitation (not fixed, per scope).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    launchOptions: {
      // Browser audio APIs (speechSynthesis / <audio>) are exercised by the app's
      // TTS fallback path. These flags keep audio playback silent/non-blocking
      // in headless Chromium so no test can hang waiting on real playback.
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w apps/server',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      // Force mock mode even when apps/server/.env holds real keys: dotenv
      // never overrides variables already present in the environment, so these
      // empty values win and keep the suite deterministic. Note this cannot
      // protect against reuseExistingServer picking up an already-running dev
      // server that was started WITH keys — stop that server before running e2e.
      env: { GEMINI_API_KEY: '', ELEVENLABS_API_KEY: '', MONGODB_URI: '' },
    },
    {
      command: 'npm run dev -w apps/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
