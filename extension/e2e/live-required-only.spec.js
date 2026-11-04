/**
 * Requirement classification smoke on fixture or live ATS pages.
 * Scrapes only: never injects answers and never clicks Submit.
 */
import { test, expect } from '@playwright/test';
import { loadEngine } from './helpers/loadEngine.js';
import { openPortalPage } from './helpers/extensionUi.js';
import { FILL_MODES, selectFieldsForMode } from '../src/lib/fillMode.js';

for (const portal of ['greenhouse', 'lever', 'ashby', 'workday']) {
  test(`${portal}: required-only excludes confirmed optional fields`, async ({ context }) => {
    const page = await openPortalPage(context, portal);
    try {
      await loadEngine(page);
      const fields = await page.evaluate(() => window.PortalEngine.scrape());
      const selection = selectFieldsForMode(fields, FILL_MODES.REQUIRED_ONLY);

      console.log('REQUIRED_ONLY', JSON.stringify({
        portal,
        stats: selection.stats,
        required: fields.filter((field) => field.requiredStatus === 'required').map((field) => field.label),
        optional: fields.filter((field) => field.requiredStatus === 'optional').map((field) => field.label),
        unknown: fields.filter((field) => field.requiredStatus === 'unknown').map((field) => field.label),
      }, null, 2));

      expect(fields.length).toBeGreaterThan(0);
      expect(selection.stats.required, `${portal} should expose at least one mandatory field`).toBeGreaterThan(0);
      expect(fields.filter((field) => field.requiredStatus === 'optional')
        .every((field) => field.requiredEvidence.length > 0)).toBe(true);
      expect(selection.fields.some((field) => field.requiredStatus === 'optional')).toBe(false);
      expect(selection.fields.filter((field) => field.requiredStatus === 'unknown').length)
        .toBe(selection.stats.unknown);
      expect(selection.fields.length).toBe(fields.length - selection.stats.optionalSkipped);
    } finally {
      await page.close();
    }
  });
}
