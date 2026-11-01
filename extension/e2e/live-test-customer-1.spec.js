/**
 * End-to-end: Test Customer 1 profile → backend generateAnswers → inject on live ATS.
 * Requires backend on :3000 with seeded profile (npm run seed:test-customer-1).
 *
 *   npm run test:e2e:customer
 */
import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'fs';
import { portalUrl } from './helpers/portals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifacts = join(__dirname, 'artifacts');
mkdirSync(artifacts, { recursive: true });

const API = process.env.API_BASE || 'http://localhost:3000/api';
const PROFILE_ID = process.env.PROFILE_ID || 'cmvwjgkvw0000npi3s1rmrzox';

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

async function loadEngine(page) {
  await page.evaluate((code) => { new Function(code)(); }, await bundleEngine());
}

async function generateAnswers(fields, pageContext) {
  const res = await fetch(`${API}/autofill/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: PROFILE_ID,
      pageContext,
      fields: fields.map((f) => ({
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options || null,
      })),
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `generate failed ${res.status}`);
  return (json.data.answers || [])
    .filter((a) => a.answer && !a.missing)
    .map((a) => ({ label: a.label, answer: String(a.answer) }));
}

async function scrapeInjectVerify(page, portal) {
  await loadEngine(page);
  const scraped = await page.evaluate(async () => {
    const portal = window.PortalEngine.detect();
    const fields = await window.PortalEngine.scrape();
    return { portal, fields };
  });
  expect(scraped.portal).toBe(portal);

  const answers = await generateAnswers(scraped.fields, { url: page.url(), title: await page.title() });
  // Consent / agree fields often lack options in scrape — add profile defaults.
  if (portal === 'greenhouse' && !answers.some((a) => /i agree/i.test(a.label))) {
    answers.push({
      label: 'By selecting "I agree," I understand that the information I have provided as part of this job application will be processed in accordance with Reddit\'s Candidate Privacy Policy.',
      answer: 'I agree',
    });
    answers.push({
      label: 'By checking this box, I consent to Reddit collecting, storing, and processing my responses to the demographic data surveys above.',
      answer: 'yes',
    });
  }

  const report = await page.evaluate(async (ans) => {
    const result = await window.PortalEngine.inject(ans);
    const filledCount = typeof result === 'number'
      ? result
      : (result && typeof result.filled === 'number' ? result.filled : 0);
    const okLabels = (result && result.okLabels) || [];
    const failed = (result && result.failed) || [];
    await new Promise((r) => setTimeout(r, 800));
    const email = document.querySelector('#email, #_systemfield_email, #emailAddress--emailAddress, input[type=email], input[name=email]')?.value || '';
    const phone = document.querySelector('#phone, #phoneNumber--phoneNumber, input[type=tel], input[name=phone]')?.value || '';
    const name = document.querySelector('#first_name, #_systemfield_name, #name--legalName--firstName, input[name=name]')?.value || '';
    const countryBtn = document.querySelector('#country--country')?.innerText || '';
    const city = document.querySelector('#address--city')?.value || '';
    const singles = [...document.querySelectorAll('.select__single-value, .select__multi-value__label')]
      .map((e) => (e.textContent || '').trim())
      .filter(Boolean);
    // Unanswered / human-only fields from the answer list that did not inject.
    const answeredLabels = new Set(ans.map((a) => a.label));
    const failedLabels = failed.map((f) => f.label || f);
    return {
      filled: filledCount,
      okLabels,
      failed: failedLabels,
      email,
      phone,
      name,
      city,
      countryBtn,
      singles,
      formAlive: document.querySelectorAll('[data-automation-id^="formField-"]').length,
      answerCount: answeredLabels.size,
    };
  }, answers);

  // Fields scrape found but generate left empty (HITL / missing).
  const answered = new Set(answers.map((a) => a.label));
  const unanswered = scraped.fields
    .map((f) => f.label)
    .filter((l) => l && !answered.has(l) && !/resume|cv|cover letter/i.test(l));

  writeFileSync(join(artifacts, `test-customer-1-${portal}.json`), JSON.stringify({
    scraped: scraped.fields.map((f) => f.label),
    answers,
    unanswered,
    report,
  }, null, 2));
  await page.screenshot({ path: join(artifacts, `test-customer-1-${portal}.png`), fullPage: true });
  return { answers, report, fieldCount: scraped.fields.length, unanswered };
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('API: Test Customer 1 profile loaded', async () => {
  const res = await fetch(`${API}/profile/${PROFILE_ID}`);
  const json = await res.json();
  expect(res.ok).toBe(true);
  expect(json.data.parsedData.applicationProfile.displayName).toBe('Test Customer 1');
  expect(json.data.parsedData.applicationProfile.phone.nationalNumber).toBe('5551234567');
  expect(json.data.parsedData.applicationProfile.phone.countryCode).toBe('+1');
  expect(json.data.parsedData.applicationProfile.captureComplete).toBe(true);
});

test('live Greenhouse via Test Customer 1 generateAnswers', async ({ page }) => {
  await page.goto(portalUrl('greenhouse'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#first_name, input[aria-label="First Name"]', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  const { report, unanswered, fieldCount, answers } = await scrapeInjectVerify(page, 'greenhouse');
  console.log(`[greenhouse] fields=${fieldCount} answers=${answers.length} filled=${report.filled} failed=${(report.failed||[]).length} unanswered=${unanswered.length}`);
  console.log('[greenhouse] failed:', report.failed);
  console.log('[greenhouse] unanswered:', unanswered);
  expect(report.filled).toBeGreaterThan(10);
  expect(report.email).toBe('alex.rivera@example.com');
  expect(report.phone.replace(/\D/g, '')).toMatch(/5551234567/);
  expect(report.name).toMatch(/Alex/i);
  expect(report.singles.join(' ')).toMatch(/Austin/i);
});

test('live Lever via Test Customer 1 generateAnswers', async ({ page }) => {
  await page.goto(portalUrl('lever'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
  await page.waitForTimeout(1000);
  const { report, unanswered, fieldCount, answers } = await scrapeInjectVerify(page, 'lever');
  console.log(`[lever] fields=${fieldCount} answers=${answers.length} filled=${report.filled} failed=${(report.failed||[]).length} unanswered=${unanswered.length}`);
  console.log('[lever] failed:', report.failed);
  console.log('[lever] unanswered:', unanswered);
  expect(report.filled).toBeGreaterThan(5);
  expect(report.email).toBe('alex.rivera@example.com');
  expect(report.phone.replace(/\D/g, '')).toMatch(/5551234567/);
  expect(report.name).toMatch(/Alex/i);
});

test('live Ashby via Test Customer 1 generateAnswers', async ({ page }) => {
  await page.goto(portalUrl('ashby'), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#_systemfield_email', { timeout: 45_000 });
  await page.waitForTimeout(1500);
  const { report, unanswered, fieldCount, answers } = await scrapeInjectVerify(page, 'ashby');
  console.log(`[ashby] fields=${fieldCount} answers=${answers.length} filled=${report.filled} failed=${(report.failed||[]).length} unanswered=${unanswered.length}`);
  console.log('[ashby] failed:', report.failed);
  console.log('[ashby] unanswered:', unanswered);
  expect(report.filled).toBeGreaterThan(3);
  expect(report.email).toBe('alex.rivera@example.com');
  expect(report.phone.replace(/\D/g, '')).toMatch(/5551234567/);
  expect(report.name).toMatch(/Alex/i);
});

test('live Workday via Test Customer 1 generateAnswers', async ({ page }) => {
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
  await page.waitForSelector('#emailAddress--emailAddress', { timeout: 45_000 });
  await page.waitForTimeout(1500);
  const { report, unanswered, fieldCount, answers } = await scrapeInjectVerify(page, 'workday');
  console.log(`[workday] fields=${fieldCount} answers=${answers.length} filled=${report.filled} failed=${(report.failed||[]).length} unanswered=${unanswered.length}`);
  console.log('[workday] failed:', report.failed);
  console.log('[workday] unanswered:', unanswered);
  expect(report.formAlive).toBeGreaterThan(0);
  expect(report.filled).toBeGreaterThan(5);
  expect(report.email).toBe('alex.rivera@example.com');
  expect(report.phone.replace(/\D/g, '')).toMatch(/5551234567/);
  expect(report.name).toMatch(/Alex/i);
  expect(report.city).toMatch(/Austin/i);
  expect(report.countryBtn).toMatch(/United States/i);
});
