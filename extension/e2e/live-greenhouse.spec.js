/**
 * Live Greenhouse smoke: fill Reddit apply form, never complete (resume left empty).
 * Run: npm run test:e2e -- e2e/live-greenhouse.spec.js
 */
import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { portalUrl } from './helpers/portals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOB_URL = portalUrl('greenhouse');
const enginePath = join(__dirname, '../src/portalEngine.js');

async function bundleEngine() {
  const result = await build({
    entryPoints: [enginePath],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'JobFitlyEngine',
    platform: 'browser',
  });
  return result.outputFiles[0].text + '\nwindow.PortalEngine = JobFitlyEngine.PortalEngine;';
}

// Messy answers matching what the extension/HITL often produces (short tokens, city-only, company+location).
const ANSWERS = [
  { label: 'First Name', answer: 'Alex' },
  { label: 'Last Name', answer: 'Rivera' },
  { label: 'Email', answer: 'alex.rivera@example.com' },
  { label: 'Country', answer: 'United States' },
  { label: 'Phone', answer: '+1 (555) 123-4567' },
  { label: 'Location (City)', answer: 'Austin' },
  { label: 'LinkedIn Profile', answer: 'https://www.linkedin.com/in/alexrivera-test/' },
  { label: 'How did you hear about this job?', answer: 'linkedIn' },
  { label: 'Please provide the name of your current (or most recent) company', answer: 'Acme Corp' },
  { label: 'Are you currently authorized to work in the U.S.?', answer: 'yes' },
  { label: 'Do you now, or will you in the future, require immigration sponsorship to work at Reddit?', answer: 'yes' },
  { label: 'By selecting "I agree," I understand that the information I have provided as part of this job application will be processed in accordance with Reddit\'s Candidate Privacy Policy.', answer: 'agree' },
  { label: 'What gender identity do you most closely identify with?', answer: 'male' },
  { label: 'Are you a person of transgender experience?', answer: 'no' },
  { label: 'What sexual orientation do you most closely identify with?', answer: 'heterosexual' },
  { label: 'Do you live with a disability (as outlined by the ADA)?', answer: 'no' },
  { label: 'Are you a veteran/have you served in the military?', answer: 'no' },
  // Must be an exact Reddit option — bare "asian" is ambiguous (East vs South) and must stay empty.
  { label: 'Please select up to 2 ethnicities that you most closely identify with.', answer: 'South Asian' },
  { label: 'By checking this box, I consent to Reddit collecting, storing, and processing my responses to the demographic data surveys above.', answer: 'yes' },
];

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test('live Reddit Greenhouse: only resume should error after inject', async ({ page }) => {
  const engine = await bundleEngine();
  await page.goto(JOB_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Application form may be on the job page or behind an Apply control.
  const apply = page.getByRole('button', { name: /apply|submit application/i }).first();
  if (await apply.isVisible().catch(() => false)) {
    const text = (await apply.textContent()) || '';
    if (/^apply/i.test(text.trim())) await apply.click().catch(() => {});
  }

  await page.waitForSelector('#application-form, form.application--form, #first_name, input[aria-label="First Name"]', {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);

  await page.addScriptTag({ content: engine });

  const injectResult = await page.evaluate(async (answers) => {
    const filled = await window.PortalEngine.inject(answers);
    return { filled };
  }, ANSWERS);

  await page.waitForTimeout(800);

  // Trigger client validation without expecting a successful submit (resume empty).
  await page.locator('button[type="submit"], button:has-text("Submit application")').first().click({ force: true });
  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
    // Real Greenhouse error helpers only (not label text that happens to match *error* classes).
    const errors = [...document.querySelectorAll('p.helper-text--error, [id$="-error"].helper-text')]
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
    const unique = [...new Set(errors)];
    const phone = document.querySelector('#phone, input[type="tel"].iti__tel-input, input[type="tel"]');
    const resume = document.querySelector('#resume, input[type="file"]');
    const gdpr = document.querySelector('#gdpr_demographic_data_consent_given_1, input[name="gdpr_demographic_data_consent_given"]');
    const singleValues = [...document.querySelectorAll('.select__single-value')]
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
    const badLebanon = unique.some((t) => /lebanon/i.test(t))
      || singleValues.some((t) => /lebanon/i.test(t))
      || [...document.querySelectorAll('input[role="combobox"]')].some((i) => /lebanon/i.test(i.value || ''));
    return {
      errors: unique,
      phoneValue: phone?.value || '',
      resumeEmpty: !resume?.files?.length,
      gdprChecked: !!gdpr?.checked,
      singleValues,
      badLebanon,
      stillOnForm: !!document.querySelector('#application-form, form.application--form'),
    };
  });

  await page.screenshot({
    path: join(__dirname, 'artifacts/live-greenhouse-after-inject.png'),
    fullPage: true,
  });

  console.log(JSON.stringify({ injectResult, report }, null, 2));

  expect(injectResult.filled).toBeGreaterThan(10);
  expect(report.stillOnForm).toBe(true);
  expect(report.resumeEmpty).toBe(true);
  expect(report.badLebanon).toBe(false);
  expect(report.phoneValue.replace(/\D/g, '').length).toBeGreaterThanOrEqual(10);
  expect(report.gdprChecked).toBe(true);

  // Company must be stripped of city/state during inject.
  const company = await page.locator('#question_69120607, input[aria-label*="current (or most recent) company" i]').first().inputValue();
  expect(company).toBe('Acme Corp');

  // Ethnicity must prefer "Asian" / "East Asian" style Asian — not American Indian.
  expect(report.singleValues.join(' | ')).not.toMatch(/American Indian/i);

  const nonResumeErrors = report.errors.filter((e) => !/resume|cv/i.test(e));
  expect(nonResumeErrors, `Unexpected field errors: ${nonResumeErrors.join(' | ')}`).toEqual([]);
  expect(report.errors.some((e) => /resume|cv/i.test(e))).toBe(true);
});
