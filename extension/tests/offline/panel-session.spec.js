/**
 * Offline contract for Side Panel session rules:
 * - Job fit per job-tab URL
 * - Application details open/close
 * - Workday Address Line 1 typed (not treated as a listbox)
 *
 * Runs with: cd extension && npm run test:offline
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import {
  jobKey,
  navigateJobFit,
  storeJobFitResult,
  emptyJobFitView,
} from '../../src/lib/jobFitSession.js';
import { nextShowCapture } from '../../src/lib/captureSession.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mocks = join(__dirname, '../mocks');
const enginePath = join(__dirname, '../../src/portalEngine.js');

const REDDIT = 'https://job-boards.greenhouse.io/reddit/jobs/8194576';
const LEVER = 'https://jobs.lever.co/leverdemo/58db3f8e-b108-47d1-9e6e-87a1712497cd/apply';

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

test('job fit cache is scoped to the open job URL', async () => {
  const redditView = {
    ...emptyJobFitView(),
    status: 'done',
    jobTitle: 'Frontend Engineer, Ads',
    company: 'Reddit',
    pageUrl: REDDIT,
    score: 62,
  };
  const cache = new Map([[jobKey(REDDIT), redditView]]);
  const moved = navigateJobFit({
    cache,
    jobUrl: LEVER,
    previousKey: jobKey(REDDIT),
    profileId: 'p1',
    previousProfileId: 'p1',
  });
  expect(moved.view.status).toBe('idle');
  expect(moved.view.score).toBeNull();

  const late = storeJobFitResult({
    cache: moved.cache,
    activeKey: jobKey(LEVER),
    scoredUrl: REDDIT,
    view: redditView,
  });
  expect(late.show).toBe(false);

  const back = navigateJobFit({
    cache: late.cache,
    jobUrl: REDDIT,
    previousKey: jobKey(LEVER),
    profileId: 'p1',
    previousProfileId: 'p1',
  });
  expect(back.view.score).toBe(62);
});

test('application details stays closed across tab changes after Later or Save', async () => {
  expect(nextShowCapture('later', { showCapture: true })).toBe(false);
  expect(nextShowCapture('saved', { showCapture: true, captureComplete: false })).toBe(false);
  expect(nextShowCapture('tab-changed', { showCapture: false })).toBe(false);
  expect(nextShowCapture('edit', { showCapture: false })).toBe(true);
});

test('Workday Address Line 1 scrapes as text and injects the saved street', async ({ page }) => {
  const html = readFileSync(join(mocks, 'workday.html'), 'utf8');
  const engineJs = await bundleEngine();
  await page.route('**/*', async (route) => {
    if (route.request().isNavigationRequest()) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: html });
      return;
    }
    await route.abort();
  });
  await page.goto('https://jobfitly.wd5.myworkdayjobs.com/en-US/external/job/Local-Fixture', {
    waitUntil: 'domcontentloaded',
  });
  await page.addScriptTag({ content: engineJs });

  const result = await page.evaluate(async () => {
    const fields = await window.PortalEngine.scrape();
    const line1 = fields.find((f) => /address line 1/i.test(f.label || ''));
    const injectResult = await window.PortalEngine.inject([
      { label: 'Address Line 1', answer: '123 Main Street' },
    ]);
    const filled = typeof injectResult === 'number' ? injectResult : injectResult?.filled ?? 0;
    return {
      type: line1?.type || null,
      options: line1?.options || null,
      filled,
      value: document.querySelector('#address-line-1')?.value || '',
    };
  });

  expect(result.type).not.toBe('select');
  expect(result.options == null || result.options.length === 0).toBeTruthy();
  expect(result.filled).toBeGreaterThanOrEqual(1);
  expect(result.value).toBe('123 Main Street');
});
