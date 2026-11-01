/**
 * Focused live checks for phone/country + ambiguous ethnicity.
 */
import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { portalUrl } from './helpers/portals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOB_URL = portalUrl('greenhouse');

async function bundleEngine() {
  const result = await build({
    entryPoints: [join(__dirname, '../src/portalEngine.js')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'JobFitlyEngine',
    platform: 'browser',
  });
  return result.outputFiles[0].text + '\nwindow.PortalEngine = JobFitlyEngine.PortalEngine;';
}

async function openForm(page, engine) {
  await page.goto(JOB_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#phone', { timeout: 60_000 });
  await page.waitForTimeout(1200);
  await page.addScriptTag({ content: engine });
}

test.setTimeout(120_000);

test('country United States sticks (display may be +1) and full phone fills', async ({ page }) => {
  const engine = await bundleEngine();
  await openForm(page, engine);
  const result = await page.evaluate(async () => {
    const filled = await window.PortalEngine.inject([
      { label: 'Country', answer: 'United States' },
      { label: 'Phone', answer: '+1 (555) 123-4567' },
    ]);
    const root = document.querySelector('#country')?.closest('.select__container, .field-wrapper');
    return {
      filled,
      phone: document.querySelector('#phone')?.value || '',
      hasCountryValue: !!root?.querySelector('.select__value-container--has-value'),
      countryChip: root?.querySelector('.select__single-value')?.textContent?.trim() || '',
    };
  });
  expect(result.filled).toBe(2);
  expect(result.hasCountryValue).toBe(true);
  expect(result.countryChip.replace(/\s/g, '')).toMatch(/\+1/);
  expect(result.phone.replace(/\D/g, '')).toBe('5551234567');
});

test('phone answer of +1 alone must not write "1" into the tel field', async ({ page }) => {
  const engine = await bundleEngine();
  await openForm(page, engine);
  const result = await page.evaluate(async () => {
    await window.PortalEngine.inject([
      { label: 'Country', answer: 'United States' },
      { label: 'Phone', answer: '+1' },
    ]);
    return document.querySelector('#phone')?.value || '';
  });
  expect(result.replace(/\D/g, '')).not.toBe('1');
  expect(result.replace(/\D/g, '').length).toBe(0);
});

test('asian must not auto-pick East Asian when South Asian also exists', async ({ page }) => {
  const engine = await bundleEngine();
  await openForm(page, engine);
  const chips = await page.evaluate(async () => {
    await window.PortalEngine.inject([
      { label: 'Please select up to 2 ethnicities that you most closely identify with.', answer: 'asian' },
    ]);
    const root = document.querySelector('[id="436"]')?.closest('.select__container');
    return [...(root?.querySelectorAll('.select__multi-value__label, .select__single-value') || [])]
      .map((e) => e.textContent.trim());
  });
  expect(chips.join(' | ')).not.toMatch(/East Asian/i);
  expect(chips.join(' | ')).not.toMatch(/South Asian/i);
  expect(chips.length).toBe(0);
});
