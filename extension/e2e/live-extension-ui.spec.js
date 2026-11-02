/**
 * Product-path UI e2e — sample personas × 4 portals against local HTML fixtures
 * (extension/tests/mocks/*). Set LIVE_ATS=1 only if you intentionally want live sites.
 *
 *   cd extension && npm run test:e2e:ui
 *   ROLE_KEY=fullstack PORTAL=lever npm run test:e2e:ui
 *
 * Requires backend on :3000. Never submits the ATS form.
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  launchExtensionContext,
  openSidePanelPage,
  openPortalPage,
  pinJobTab,
  uploadResume,
  completeApplicationCapture,
  runFillFormWithHitl,
  resetFillFormUi,
  assertCoreIdentityOnPage,
  loadUiMatrix,
} from './helpers/extensionUi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifacts = join(__dirname, 'artifacts/extension-ui');
mkdirSync(artifacts, { recursive: true });
const SUMMARY_PATH = join(artifacts, 'summary.json');

const { runs: RUNS } = loadUiMatrix();

function readSummary() {
  try {
    return JSON.parse(readFileSync(SUMMARY_PATH, 'utf8'));
  } catch {
    return { at: null, expected: RUNS.length, passed: 0, failed: 0, results: [] };
  }
}

function upsertResult(row) {
  const summary = readSummary();
  summary.expected = RUNS.length;
  summary.at = new Date().toISOString();
  summary.results = (summary.results || []).filter(
    (r) => !(r.key === row.key && r.portal === row.portal),
  );
  summary.results.push(row);
  summary.passed = summary.results.filter((r) => r.status === 'passed').length;
  summary.failed = summary.results.filter((r) => r.status === 'failed').length;
  summary.runs = summary.results.length;
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

// workers:1 in playwright.config — do NOT use serial mode (one fail would skip the other 39).
test.setTimeout(420_000);

/** Shared Chromium + Side Panel for the whole matrix (faster than relaunching 40×). */
let shared = null;
let lastPersonaKey = null;

async function ensureShared() {
  try {
    if (shared?.context && shared.panel && !shared.panel.isClosed() && shared.context.pages().length > 0) {
      return shared;
    }
  } catch {
    /* relaunch */
  }
  await shared?.context?.close().catch(() => {});
  shared = await launchExtensionContext();
  shared.panel = await openSidePanelPage(shared.context, shared.extensionId);
  lastPersonaKey = null;
  return shared;
}

test.beforeAll(async () => {
  await ensureShared();
});

test.afterAll(async () => {
  const summary = readSummary();
  console.log('\nEXTENSION_UI_MATRIX_SUMMARY\n', JSON.stringify(summary, null, 2));
  await shared?.context?.close().catch(() => {});
});

test(`matrix size: ${RUNS.length} runs (10×4 unless filtered)`, async () => {
  // Reset here (not beforeAll) so a worker restart mid-matrix does not wipe prior results.
  writeFileSync(
    SUMMARY_PATH,
    `${JSON.stringify({ at: new Date().toISOString(), expected: RUNS.length, passed: 0, failed: 0, results: [] }, null, 2)}\n`,
  );
  expect(RUNS.length).toBeGreaterThan(0);
});

for (const { profile, portal } of RUNS) {
  test(`UI ${profile.key} (${profile.title}) → ${portal}`, async () => {
    const { context, panel } = await ensureShared();
    let jobPage = null;
    const row = {
      key: profile.key,
      name: profile.name,
      title: profile.title,
      portal,
      status: 'running',
    };

    try {
      // Reset previous fill session if still showing "done"
      if (await panel.locator('[data-testid="autofill-done"]').isVisible({ timeout: 500 }).catch(() => false)) {
        await resetFillFormUi(panel);
      }

      jobPage = await openPortalPage(context, portal);
      await pinJobTab(panel, jobPage);

      const forceUpload = lastPersonaKey !== profile.key;
      await uploadResume(panel, profile.pdf, { force: forceUpload, expectName: profile.name });
      lastPersonaKey = profile.key;
      await completeApplicationCapture(panel, profile);

      const stats = await runFillFormWithHitl(panel, jobPage, {
        maxSteps: portal === 'greenhouse' ? 140 : 120,
        persona: profile,
      });

      const slug = `${profile.key}-${portal}`;
      await panel.screenshot({ path: join(artifacts, `${slug}-panel.png`), fullPage: true }).catch(() => {});
      await jobPage.screenshot({ path: join(artifacts, `${slug}-page.png`), fullPage: true }).catch(() => {});
      const compact = {
        identified: stats.identified,
        filled: stats.filled,
        skipped: stats.skipped,
        skippedFilled: stats.skippedFilled,
        focusSamples: stats.focusSamples.length,
      };
      writeFileSync(join(artifacts, `${slug}.json`), `${JSON.stringify({ profile: profile.key, portal, ...compact }, null, 2)}\n`);
      console.log(`EXTENSION_UI_STATS ${slug}`, JSON.stringify(compact));

      expect(stats.identified, `${slug} identified`).toBeGreaterThan(2);
      expect(stats.filled + stats.skipped, `${slug} accounted`).toBe(stats.identified);
      expect(
        stats.filled / Math.max(1, stats.identified),
        `${slug} fill ratio`,
      ).toBeGreaterThanOrEqual(0.55);
      expect(stats.focusSamples.length, `${slug} focus samples`).toBeGreaterThan(0);

      const form = await assertCoreIdentityOnPage(jobPage, portal, profile);
      console.log(`EXTENSION_UI_FORM_MATCH ${slug}`, JSON.stringify(form));

      row.status = 'passed';
      row.identified = stats.identified;
      row.filled = stats.filled;
      row.skipped = stats.skipped;
      row.focusSamples = stats.focusSamples.length;
      row.formMatch = form;
    } catch (err) {
      row.status = 'failed';
      row.error = (err.message || String(err)).slice(0, 500);
      throw err;
    } finally {
      upsertResult(row);
      if (jobPage) await jobPage.close().catch(() => {});
      // Return panel to idle for the next persona/portal
      await resetFillFormUi(panel).catch(() => {});
    }
  });
}
