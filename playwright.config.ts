import { defineConfig, devices } from '@playwright/test'

/**
 * Real-WebKit e2e config for editor interaction tests.
 *
 * Why this exists: happy-dom / jsdom unit tests cannot reproduce ProseMirror's
 * click→focus path, so a focus race in the math NodeView shipped three times
 * while all unit tests were green. These specs run the actual frontend in real
 * WebKit (same engine family as the Tauri WKWebView) against `pnpm dev`.
 *
 * Run: `pnpm test:e2e`  (auto-starts + tears down the Vite dev server)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    port: 1420,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
