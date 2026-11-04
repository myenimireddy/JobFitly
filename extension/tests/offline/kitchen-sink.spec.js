/**
 * Playwright kitchen-sink: one persona × portal fixtures (faster than 10×4 UI matrix).
 * Asserts scrape + inject for core control types against mocks/*.html.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mocksDir = join(__dirname, '../mocks');
const enginePath = join(__dirname, '../../src/portalEngine.js');

async function bundleEngine() {
  const result = await build({
    entryPoints: [enginePath],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'JobFitlyEngine',
    platform: 'browser',
  });
  return `${result.outputFiles[0].text}\nwindow.PortalEngine = JobFitlyEngine.PortalEngine;`;
}

const PORTALS = [
  {
    name: 'greenhouse_classic',
    file: 'greenhouse.html',
    url: 'https://boards.greenhouse.io/acme/jobs/1',
    answers: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'First Name', answer: 'Ada' },
      { label: 'Cover Letter', answer: 'Kitchen sink cover.' },
      { label: 'Are you able to work onsite?', answer: 'Yes' },
      { label: 'Will you now or in the future require sponsorship?', answer: 'No' },
    ],
    assert: async (page) => {
      await expect(page.locator('#email')).toHaveValue('ada@example.com');
      await expect(page.locator('#question_1')).toHaveValue(/Yes/i);
      await expect(page.locator('[data-testid="ks-radio"] input[type="radio"]')).toHaveCount(2);
      await expect(page.locator('[data-testid="ks-checkbox"] input[type="checkbox"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="ks-file"] input[type="file"]')).toHaveCount(1);
    },
  },
  {
    name: 'greenhouse_job_board',
    file: 'reddit-greenhouse.html',
    url: 'https://job-boards.greenhouse.io/jobfitly-fixture/jobs/local-1',
    answers: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Cover Letter', answer: 'Job board cover.' },
      { label: 'Country', answer: 'United States' },
    ],
    assert: async (page) => {
      await expect(page.locator('input[type="email"], #email').first()).toHaveValue('ada@example.com');
    },
  },
  {
    name: 'lever',
    file: 'lever.html',
    url: 'https://jobs.lever.co/jobfitly-fixture/local-1/apply',
    answers: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Name', answer: 'Ada Lovelace' },
      { label: 'Cover Letter', answer: 'Lever cover.' },
      { label: 'How did you hear about us?', answer: 'LinkedIn' },
      { label: 'Are you authorized to work in the US?', answer: 'Yes' },
    ],
    assert: async (page) => {
      await expect(page.locator('input[name="email"]')).toHaveValue('ada@example.com');
      await expect(page.locator('textarea[name="coverLetter"]')).toHaveValue(/Lever cover/);
    },
  },
  {
    name: 'ashby',
    file: 'ashby.html',
    url: 'https://jobs.ashbyhq.com/jobfitly-fixture/application',
    answers: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Full Name', answer: 'Ada Lovelace' },
      { label: 'Cover Letter', answer: 'Ashby cover.' },
      { label: 'How did you hear about us?', answer: 'LinkedIn' },
    ],
    assert: async (page) => {
      await expect(page.locator('input[type="email"], input[name="email"]').first()).toHaveValue('ada@example.com');
    },
  },
  {
    name: 'workday',
    file: 'workday.html',
    url: 'https://jobfitly.wd5.myworkdayjobs.com/en-US/external/job/Local-Fixture',
    answers: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Full Name', answer: 'Ada Lovelace' },
      { label: 'Country', answer: 'United States' },
      { label: 'State/Province', answer: 'Texas' },
      { label: 'Additional Information', answer: 'Workday notes.' },
      { label: 'How did you hear about us?', answer: 'LinkedIn' },
      { label: 'Are you legally authorized to work in the United States?', answer: 'Yes' },
    ],
    assert: async (page) => {
      await expect(page.locator('#emailAddress--emailAddress')).toHaveValue('ada@example.com');
      await expect(page.locator('#country-listbox-btn')).toHaveText(/United States/i);
      await expect(page.locator('#state-listbox-btn')).toHaveText(/Texas/i);
      await expect(page.locator('#additionalInfo')).toHaveValue(/Workday notes/);
    },
  },
];

test.describe('kitchen-sink portal fixtures', () => {
  let engineJs;

  test.beforeAll(async () => {
    engineJs = await bundleEngine();
  });

  for (const portal of PORTALS) {
    test(`${portal.name}: scrape + inject core controls`, async ({ page }) => {
      const html = readFileSync(join(mocksDir, portal.file), 'utf8');
      // Serve fixture at the real ATS host so PortalEngine.detect() keys off hostname.
      await page.route('**/*', async (route) => {
        if (route.request().isNavigationRequest()) {
          await route.fulfill({ status: 200, contentType: 'text/html', body: html });
          return;
        }
        await route.abort();
      });
      await page.goto(portal.url, { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ content: engineJs });

      const result = await page.evaluate(async (answers) => {
        const fields = await window.PortalEngine.scrape();
        const injectResult = await window.PortalEngine.inject(answers);
        const filled = typeof injectResult === 'number' ? injectResult : injectResult?.filled ?? 0;
        return { fieldCount: fields.length, filled };
      }, portal.answers);

      expect(result.fieldCount).toBeGreaterThanOrEqual(3);
      expect(result.filled).toBeGreaterThanOrEqual(2);
      await portal.assert(page);

      // File inputs stay empty
      const fileCounts = await page.locator('input[type="file"]').evaluateAll(
        (els) => els.map((el) => el.files?.length || 0),
      );
      expect(fileCounts.every((n) => n === 0)).toBeTruthy();
    });
  }
});
