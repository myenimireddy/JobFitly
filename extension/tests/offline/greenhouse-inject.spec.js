/**
 * Playwright harness for Greenhouse/Reddit React-Select inject.
 * Uses a local fixture that includes an intl-tel country list (Lebanon +961)
 * so short answers like "No" cannot silently select the wrong option.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '../mocks/reddit-greenhouse.html');
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
  return result.outputFiles[0].text + '\nwindow.PortalEngine = JobFitlyEngine.PortalEngine;';
}

const ANSWERS = [
  { label: 'First Name', answer: 'Alex' },
  { label: 'Last Name', answer: 'Rivera' },
  { label: 'Email', answer: 'alex.rivera@example.com' },
  { label: 'Country', answer: 'United States' },
  { label: 'Phone', answer: '5551234567' },
  { label: 'Location (City)', answer: 'Austin, Texas, United States' },
  { label: 'LinkedIn Profile', answer: 'https://www.linkedin.com/in/alexrivera-test/' },
  { label: 'How did you hear about this job?', answer: 'LinkedIn' },
  { label: 'Please provide the name of your current (or most recent) company', answer: 'Acme Corp' },
  { label: 'Are you currently authorized to work in the U.S.?', answer: 'Yes' },
  { label: 'Do you now, or will you in the future, require immigration sponsorship to work at Reddit?', answer: 'Yes' },
  { label: 'By selecting "I agree," I understand that the information I have provided as part of this job application will be processed in accordance with Reddit\'s Candidate Privacy Policy.', answer: 'I agree' },
  { label: 'What gender identity do you most closely identify with?', answer: 'Male' },
  { label: 'Are you a person of transgender experience?', answer: 'No' },
  { label: 'What sexual orientation do you most closely identify with?', answer: 'Heterosexual' },
  { label: 'Do you live with a disability (as outlined by the ADA)?', answer: 'No' },
  { label: 'Are you a veteran/have you served in the military?', answer: 'No' },
  { label: 'Please select up to 2 ethnicities that you most closely identify with.', answer: 'Asian' },
  { label: 'By checking this box, I consent to Reddit collecting, storing, and processing my responses to the demographic data surveys above.', answer: 'Yes' },
];

test('Reddit Greenhouse React-Select inject commits real options', async ({ page }) => {
  const html = readFileSync(fixturePath, 'utf8');
  const engine = await bundleEngine();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: engine });

  const result = await page.evaluate(async (answers) => {
    const filled = await window.PortalEngine.inject(answers);
    const val = (sel) => document.querySelector(sel)?.value || '';
    const display = (key) => document.querySelector(`[data-rs="${key}"] [data-value-display]`)?.textContent || '';
    return {
      filled,
      phone: val('#phone'),
      company: val('#company'),
      firstName: val('#first_name'),
      email: val('#email'),
      country: val('[data-rs-value="country"]') || display('country'),
      location: val('[data-rs-value="location"]') || display('location'),
      workauth: val('[data-rs-value="workauth"]') || display('workauth'),
      sponsor: val('[data-rs-value="sponsor"]') || display('sponsor'),
      privacy: val('[data-rs-value="privacy"]') || display('privacy'),
      gender: val('[data-rs-value="gender"]') || display('gender'),
      trans: val('[data-rs-value="trans"]') || display('trans'),
      orient: val('[data-rs-value="orient"]') || display('orient'),
      disability: val('[data-rs-value="disability"]') || display('disability'),
      veteran: val('[data-rs-value="veteran"]') || display('veteran'),
      ethnicity: val('[data-rs-value="ethnicity"]') || display('ethnicity'),
      gdpr: !!document.querySelector('#gdpr_demographic_data_consent_given_1')?.checked,
      badLebanon: [
        display('trans'),
        display('disability'),
        display('veteran'),
        val('[data-rs-value="trans"]'),
        val('[data-rs-value="disability"]'),
        val('[data-rs-value="veteran"]'),
      ].some((t) => /lebanon/i.test(t || '')),
    };
  }, ANSWERS);

  const filledN = typeof result.filled === 'number' ? result.filled : (result.filled?.filled || 0);
  expect(filledN).toBeGreaterThan(10);
  expect(result.firstName).toBe('Alex');
  expect(result.email).toBe('alex.rivera@example.com');
  expect(String(result.phone || '').replace(/\D/g, '')).toMatch(/5551234567/);
  expect(result.company).toBe('Acme Corp');
  expect(result.country).toMatch(/United States/i);
  expect(result.location).toMatch(/Austin/i);
  expect(result.workauth).toMatch(/^Yes$/i);
  expect(result.sponsor).toMatch(/^Yes$/i);
  expect(result.privacy).toMatch(/I agree/i);
  expect(result.gender).toMatch(/^Male$/i);
  expect(result.trans).toMatch(/^No$/i);
  expect(result.orient).toMatch(/Heterosexual/i);
  expect(result.disability).toMatch(/^No$/i);
  expect(result.veteran).toMatch(/^No$/i);
  expect(result.ethnicity).toMatch(/Asian/i);
  expect(result.gdpr).toBe(true);
  expect(result.badLebanon).toBe(false);

  const validity = await page.evaluate(() => {
    const form = document.getElementById('application-form');
    const invalid = [...form.querySelectorAll('input, select, textarea')].filter((el) => !el.checkValidity());
    return {
      invalidIds: invalid.map((el) => el.id || el.name || el.getAttribute('data-rs-value') || el.type),
      resumeEmpty: !document.querySelector('#resume')?.files?.length,
    };
  });
  // Only resume may remain invalid — every other required field must be committed.
  expect(validity.resumeEmpty).toBe(true);
  expect(validity.invalidIds).toEqual(['resume']);
});
