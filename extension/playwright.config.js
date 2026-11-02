import { defineConfig } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Two projects — keep offline mocks separate from live ATS e2e.
 *   npm run test:offline  → fixture HTML (no network)
 *   npm run test:e2e      → real Greenhouse / Lever / Ashby / Workday
 */
export default defineConfig({
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  outputDir: join(root, 'test-results'),
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'offline',
      testDir: join(root, 'tests/offline'),
      testMatch: '**/*.spec.js',
    },
    {
      name: 'e2e',
      testDir: join(root, 'e2e'),
      // Inject-only live portal specs (no Chrome extension UI)
      testMatch: /live-(?!extension-ui).*\.spec\.js$/,
      timeout: 240_000,
    },
    {
      name: 'e2e-ui',
      testDir: join(root, 'e2e'),
      // Real Side Panel path: upload → capture → Fill Form (+ refill)
      testMatch: '**/live-extension-ui*.spec.js',
      timeout: 420_000,
      use: {
        headless: false,
      },
    },
  ],
});
