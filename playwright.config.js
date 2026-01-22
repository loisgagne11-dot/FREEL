import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright pour tests E2E
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  // Timeout par test
  timeout: 30000,

  // Nombre d'essais en cas d'échec
  retries: process.env.CI ? 2 : 0,

  // Workers (parallélisme)
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: process.env.CI ? 'github' : 'list',

  // Configuration globale
  use: {
    // Base URL
    baseURL: 'http://localhost:5173',

    // Trace en cas d'échec
    trace: 'on-first-retry',

    // Screenshot en cas d'échec
    screenshot: 'only-on-failure',

    // Video en cas d'échec
    video: 'retain-on-failure'
  },

  // Projets (browsers)
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Web server
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  },
});
