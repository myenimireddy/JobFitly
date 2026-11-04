import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEngine } from '../../e2e/helpers/loadEngine.js';
import { FILL_MODES, selectFieldsForMode } from '../../src/lib/fillMode.js';

const root = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(join(root, '../mocks/requirement-matrix.html'), 'utf8');

test('requirement evidence is tri-state and absence stays unknown', async ({ page }) => {
  await page.route('https://requirements.example.test/form', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: fixture,
  }));
  await page.goto('https://requirements.example.test/form');
  await loadEngine(page);

  const fields = await page.evaluate(() => window.PortalEngine.scrape());
  const byLabel = (label) => fields.find((field) => field.label.includes(label));

  expect(byLabel('Native required')).toMatchObject({
    requiredStatus: 'required',
    requiredEvidence: expect.arrayContaining(['native-required']),
  });
  expect(byLabel('ARIA required')).toMatchObject({
    requiredStatus: 'required',
    requiredEvidence: expect.arrayContaining(['aria-required']),
  });
  expect(byLabel('Visual required')).toMatchObject({
    requiredStatus: 'required',
    requiredEvidence: expect.arrayContaining(['visible-required-marker']),
  });
  expect(byLabel('Portfolio')).toMatchObject({ requiredStatus: 'optional' });
  expect(byLabel('Middle name')).toMatchObject({
    requiredStatus: 'optional',
    requiredEvidence: expect.arrayContaining(['aria-optional']),
  });
  expect(byLabel('Security clearance')).toMatchObject({ requiredStatus: 'unknown' });
  expect(byLabel('Work authorization')).toMatchObject({ requiredStatus: 'required', type: 'radio' });
  expect(byLabel('Email')).toMatchObject({ requiredStatus: 'required', currentValue: 'candidate@example.test' });
  expect(byLabel('Veteran status')).toMatchObject({ requiredStatus: 'optional' });
  expect(fields.some((field) => /resume/i.test(field.label))).toBe(false);

  const requiredOnly = selectFieldsForMode(fields, FILL_MODES.REQUIRED_ONLY);
  expect(requiredOnly.fields.some((field) => field.label.includes('Security clearance'))).toBe(true);
  expect(requiredOnly.fields.some((field) => field.label.includes('Portfolio'))).toBe(false);
  expect(requiredOnly.fields.some((field) => field.label.includes('Veteran status'))).toBe(false);
});

test('a choice can reveal a newly required field for the mid-run re-scrape', async ({ page }) => {
  await page.route('https://requirements.example.test/form', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: fixture,
  }));
  await page.goto('https://requirements.example.test/form');
  await loadEngine(page);

  const before = await page.evaluate(() => window.PortalEngine.scrape());
  expect(before.some((field) => field.label.includes('Sponsorship details'))).toBe(false);

  await page.evaluate(() => window.PortalEngine.inject([
    { label: 'Need sponsorship?', answer: 'Yes' },
  ]));
  const after = await page.evaluate(() => window.PortalEngine.scrape());
  expect(after.find((field) => field.label.includes('Sponsorship details'))).toMatchObject({
    requiredStatus: 'required',
  });
});
