/**
 * Same profile + same application twice:
 *   1) First Fill Form on a blank Lever fixture
 *   2) Fill Form again on the *same* page (DOM still filled) → should skip already-filled
 *   3) Fresh blank Lever page, same profile → should still fill from profile (autocomplete knowns)
 *
 * Local fixtures only (set LIVE_ATS=1 to hit live sites).
 *
 *   cd extension && npx playwright test --project=e2e-ui e2e/live-extension-ui-refill.spec.js
 */
import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
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

const { profiles } = loadUiMatrix();
const profile = profiles.find((p) => p.key === 'fullstack') || profiles[0];

test.setTimeout(420_000);

test('same profile × same Lever app: second pass skips already-filled; fresh blank still autocompletes', async () => {
  const { context, extensionId } = await launchExtensionContext();
  const panel = await openSidePanelPage(context, extensionId);
  let jobPage = null;

  try {
    jobPage = await openPortalPage(context, 'lever');
    await pinJobTab(panel, jobPage);

    await uploadResume(panel, profile.pdf, { force: true, expectName: profile.name });
    await completeApplicationCapture(panel, profile);

    // --- Pass 1: blank form ---
    const first = await runFillFormWithHitl(panel, jobPage, {
      maxSteps: 80,
      persona: profile,
    });
    console.log('REFILL_PASS1', JSON.stringify({
      identified: first.identified,
      filled: first.filled,
      skipped: first.skipped,
      skippedFilled: first.skippedFilled,
    }));

    expect(first.identified, 'pass1 identified').toBeGreaterThan(2);
    expect(first.filled, 'pass1 filled').toBeGreaterThan(2);
    await assertCoreIdentityOnPage(jobPage, 'lever', profile);

    // Snapshot values left on the page after first fill
    const afterFirst = await jobPage.evaluate(() => ({
      email: document.querySelector('input[name="email"]')?.value || '',
      name: document.querySelector('input[name="name"]')?.value || '',
      valued: [...document.querySelectorAll('input, textarea, select')].filter(
        (el) => String(el.value || '').trim().length > 0
          || (el.type === 'checkbox' && el.checked)
          || (el.type === 'radio' && el.checked),
      ).length,
    }));
    expect(afterFirst.email).toContain('@');
    expect(afterFirst.valued).toBeGreaterThan(2);

    // --- Pass 2: same page, same profile (DOM still filled) ---
    await resetFillFormUi(panel);
    await pinJobTab(panel, jobPage);
    const second = await runFillFormWithHitl(panel, jobPage, {
      maxSteps: 40,
      persona: profile,
    });
    console.log('REFILL_PASS2_SAME_PAGE', JSON.stringify({
      identified: second.identified,
      filled: second.filled,
      skipped: second.skipped,
      skippedFilled: second.skippedFilled,
    }));

    // Already-filled fields are skipped — second pass should barely touch the form.
    expect(second.skippedFilled, 'pass2 skipped already filled').toBeGreaterThanOrEqual(
      Math.min(first.filled, afterFirst.valued),
    );
    expect(second.identified, 'pass2 much less work than pass1').toBeLessThan(first.identified);
    expect(second.filled, 'pass2 little or no re-fill').toBeLessThanOrEqual(2);
    await expect(panel.getByText(/already filled/i).first()).toBeVisible();

    // Values must not have been wiped
    const afterSecond = await jobPage.evaluate(() => ({
      email: document.querySelector('input[name="email"]')?.value || '',
      name: document.querySelector('input[name="name"]')?.value || '',
    }));
    expect(afterSecond.email).toBe(afterFirst.email);
    expect(afterSecond.name).toBe(afterFirst.name);

    // --- Pass 3: fresh blank application, same profile ---
    await jobPage.close();
    jobPage = await openPortalPage(context, 'lever');
    await pinJobTab(panel, jobPage);
    await resetFillFormUi(panel);

    const blank = await jobPage.evaluate(() => (
      document.querySelector('input[name="email"]')?.value || ''
    ));
    expect(blank.trim(), 'fresh page starts empty').toBe('');

    const third = await runFillFormWithHitl(panel, jobPage, {
      maxSteps: 80,
      persona: profile,
    });
    console.log('REFILL_PASS3_FRESH_BLANK', JSON.stringify({
      identified: third.identified,
      filled: third.filled,
      skipped: third.skipped,
      skippedFilled: third.skippedFilled,
    }));

    // Profile still drives fill on a blank form (known answers / capture facts).
    expect(third.filled, 'pass3 filled from profile').toBeGreaterThan(2);
    await assertCoreIdentityOnPage(jobPage, 'lever', profile);

    writeFileSync(
      join(artifacts, 'refill-same-profile-lever.json'),
      `${JSON.stringify({ profile: profile.key, first, second, third, afterFirst }, null, 2)}\n`,
    );
  } finally {
    await jobPage?.close().catch(() => {});
    await context.close().catch(() => {});
  }
});
