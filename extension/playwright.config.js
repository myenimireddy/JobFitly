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
      testMatch: '**/live-*.spec.js',
      timeout: 240_000,
    },
  ],
});
