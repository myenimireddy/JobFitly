/**
 * Live inject smokes for Lever / Ashby / Workday (no successful submit — resume left empty).
 * Answers come from consolidated-fill-context.json so shared profile facts hit every portal.
 */
import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'fs';
import { portalUrl } from './helpers/portals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifacts = join(__dirname, 'artifacts');
mkdirSync(artifacts, { recursive: true });

const catalog = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/profile-fill-answers.json'), 'utf8'),
);

function answersFor(portal) {
  return (catalog.byPortal[portal] || [])
    .filter((f) => f.answer != null && String(f.answer).trim() !== '')
    .map((f) => ({ label: f.label, answer: String(f.answer) }));
}

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

async function injectAndSnapshot(page, answers) {
  const engine = await bundleEngine();
  // Ashby (and some others) block <script> tags via CSP; CDP evaluate still works.
  await page.evaluate((code) => {
    // eslint-disable-next-line no-new-func
    new Function(code)();
  }, engine);
  return page.evaluate(async (ans) => {
    const portal = window.PortalEngine.detect();
    const fields = await window.PortalEngine.scrape();
    const filled = await window.PortalEngine.inject(ans);
    const email = document.querySelector('input[type="email"], input[name="email"], input[name*="email" i], #email, #_systemfield_email, #emailAddress--emailAddress')?.value || '';
    const phone = document.querySelector('input[type="tel"], input[name="phone"], input[name*="phone" i], #phone, #phoneNumber--phoneNumber')?.value || '';
    const name = document.querySelector('input[name="name"], #_systemfield_name, #name--legalName--firstName, #fullName')?.value || '';
    const city = document.querySelector('#address--city, input[id*="city" i]')?.value || '';
    const source = document.querySelector('#source--source')?.value || '';
    const countryBtn = document.querySelector('#country--country')?.innerText || '';
    const stateBtn = document.querySelector('#address--countryRegion')?.innerText || '';
    const formAlive = document.querySelectorAll('[data-automation-id^="formField-"]').length;
    return {
      portal,
      fieldCount: fields.length,
      fieldLabels: fields.slice(0, 20).map((f) => f.label),
      filled,
      email,
      phone,
      name,
      city,
      source,
      countryBtn,
      stateBtn,
      formAlive,
      url: location.href,
    };
  }, answers);
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

function injectFilled(snap) {
  const f = snap?.filled;
  return typeof f === 'number' ? f : (f?.filled || 0);
}

test('live Lever: fill core identity fields', async ({ page }) => {
  await page.goto(portalUrl('lever'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('input[name="email"], .application-question', { timeout: 30_000 });
  await page.waitForTimeout(1000);

  const snap = await injectAndSnapshot(page, answersFor('lever'));
  await page.screenshot({ path: join(artifacts, 'live-lever.png'), fullPage: true });
  console.log('LEVER', JSON.stringify(snap, null, 2));

  expect(snap.portal).toBe('lever');
  expect(injectFilled(snap)).toBeGreaterThan(5);
  expect(snap.email).toBe('alex.rivera@example.com');
  expect(snap.phone.replace(/\D/g, '')).toContain('5551234567');
});

test('live Ashby: fill core identity fields', async ({ page }) => {
  await page.goto(portalUrl('ashby'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#_systemfield_email, [data-field-path="_systemfield_email"]', { timeout: 45_000 });
  await page.waitForTimeout(1500);

  const snap = await injectAndSnapshot(page, answersFor('ashby'));
  await page.screenshot({ path: join(artifacts, 'live-ashby.png'), fullPage: true });
  console.log('ASHBY', JSON.stringify(snap, null, 2));

  expect(snap.portal).toBe('ashby');
  expect(injectFilled(snap)).toBeGreaterThan(4);
  expect(snap.email).toBe('alex.rivera@example.com');
  expect(String(snap.name || '')).toMatch(/Alex/i);
  expect(snap.phone.replace(/\D/g, '')).toMatch(/5551234567/);
});

test('live Workday: fill core identity fields', async ({ page }) => {
  await page.goto(portalUrl('workday'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2000);

  const apply = page.getByRole('button', { name: /^Apply$/i }).or(page.getByRole('link', { name: /^Apply$/i })).first();
  if (await apply.isVisible({ timeout: 10000 }).catch(() => false)) {
    await apply.click();
    await page.waitForTimeout(3000);
  }
  const manual = page.getByRole('button', { name: /apply manually/i }).first();
  if (await manual.isVisible({ timeout: 8000 }).catch(() => false)) {
    await manual.click();
    await page.waitForTimeout(4000);
  }

  await page.waitForSelector('#emailAddress--emailAddress, [data-automation-id="formField-emailAddress"]', { timeout: 45_000 });
  await page.waitForTimeout(1500);

  const snap = await injectAndSnapshot(page, answersFor('workday'));
  await page.screenshot({ path: join(artifacts, 'live-workday.png'), fullPage: true });
  console.log('WORKDAY', JSON.stringify(snap, null, 2));

  expect(snap.portal).toBe('workday');
  expect(snap.formAlive).toBeGreaterThan(0);
  expect(injectFilled(snap)).toBeGreaterThan(5);
  expect(snap.email).toBe('alex.rivera@example.com');
  expect(snap.name).toMatch(/Alex/i);
  expect(snap.phone.replace(/\D/g, '')).toMatch(/5551234567/);
  expect(snap.city).toMatch(/Austin/i);
  expect(snap.countryBtn).toMatch(/United States/i);
});
