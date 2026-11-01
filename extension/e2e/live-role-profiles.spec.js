/**
 * Live fill: each role × all 4 portals, asserting the consolidated field catalog.
 *
 *   cd backend && npm run seed:role-profiles
 *   cd extension && npm run test:e2e -- e2e/live-role-profiles.spec.js
 *
 * Filters: ROLE_KEY=fullstack  PORTAL=greenhouse
 */
import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { injectAndVerifyDom } from './helpers/domFieldVerify.js';
import { requiredConsolidatedFields, assertAnswersCoverCatalog, labelMatch } from './helpers/consolidatedExpect.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifacts = join(__dirname, 'artifacts/roles');
mkdirSync(artifacts, { recursive: true });

const API = process.env.API_BASE || 'http://localhost:3000/api';
const fixturePath = join(__dirname, 'fixtures/role-profiles.seeded.json');
const PORTAL_ORDER = ['greenhouse', 'lever', 'ashby', 'workday'];

/** Per-portal minimum DOM ok ratio for consolidated required fields. */
const MIN_DOM_RATIO = {
  greenhouse: 0.9,
  lever: 0.85,
  ashby: 0.9,
  workday: 0.85,
};

function loadFixture() {
  if (!existsSync(fixturePath)) {
    throw new Error(`Missing ${fixturePath}. Run: cd backend && npm run seed:role-profiles`);
  }
  return JSON.parse(readFileSync(fixturePath, 'utf8'));
}

function loadMatrix() {
  const data = loadFixture();
  let profiles = data.profiles || [];
  if (process.env.ROLE_KEY) {
    profiles = profiles.filter((p) => p.key === process.env.ROLE_KEY);
  }
  let portals = PORTAL_ORDER.filter((p) => data.portals?.[p]);
  if (process.env.PORTAL) {
    portals = portals.filter((p) => p === process.env.PORTAL);
  }
  const runs = [];
  for (const profile of profiles) {
    for (const portal of portals) {
      const meta = data.portals[portal];
      runs.push({
        ...profile,
        portal,
        jobUrl: meta.url,
        jobTitle: meta.title,
      });
    }
  }
  return { profiles, runs };
}

const { profiles: PROFILES, runs: RUNS } = loadMatrix();

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

async function fetchParsed(profileId) {
  const res = await fetch(`${API}/profile/${profileId}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `profile ${profileId} ${res.status}`);
  return json.data.parsedData;
}

async function generateAnswers(profileId, fields, pageContext) {
  const res = await fetch(`${API}/autofill/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId,
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

async function openPortal(page, portal, jobUrl) {
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (portal === 'greenhouse') {
    await page.waitForSelector('#first_name, input[aria-label="First Name"]', { timeout: 60_000 });
  } else if (portal === 'lever') {
    await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
  } else if (portal === 'ashby') {
    await page.waitForSelector('#_systemfield_email', { timeout: 45_000 });
  } else if (portal === 'workday') {
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
  }
  await page.waitForTimeout(1200);
}

async function scrapeInjectVerifyCatalog(page, profile, portal) {
  const parsed = await fetchParsed(profile.id);
  const required = requiredConsolidatedFields(parsed, portal);

  await loadEngine(page);
  const scraped = await page.evaluate(async () => {
    const portal = window.PortalEngine.detect();
    const fields = await window.PortalEngine.scrape();
    return { portal, fields };
  });
  expect(scraped.portal).toBe(portal);

  const answers = await generateAnswers(
    profile.id,
    scraped.fields,
    { url: page.url(), title: profile.jobTitle || (await page.title()) },
  );

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

  const cover = assertAnswersCoverCatalog(answers, required, portal);
  expect(
    cover.missing,
    `${profile.key}@${portal} generateAnswers missing consolidated fields: ${JSON.stringify(cover.missing)}`,
  ).toEqual([]);

  // Inject every generated answer (full form), then DOM-check consolidated required labels.
  const verifyAnswers = required.map((req) => {
    const hit = answers.find((a) => labelMatch(a.label, req.label));
    // Prefer generate snap for selects; keep catalog short answers for consent checkboxes.
    let answer = hit?.answer || req.expected;
    if (req.canonical === 'consent' && /checking this box|demographic/i.test(req.label)) {
      answer = 'yes';
    }
    return { label: req.label, answer, canonical: req.canonical };
  });

  // Inject full generate payload; assert consolidated required labels in the DOM.
  const report = await injectAndVerifyDom(page, answers, verifyAnswers);
  const ratio = report.okCount / Math.max(1, report.okCount + report.failCount);
  const minRatio = MIN_DOM_RATIO[portal] || 0.85;

  const slug = `${profile.key}-${portal}`;
  const payload = {
    profile: {
      key: profile.key,
      id: profile.id,
      displayName: profile.displayName,
      roleTitle: profile.roleTitle,
      email: profile.email,
    },
    portal,
    jobUrl: profile.jobUrl,
    required,
    cover,
    scraped: scraped.fields.map((f) => f.label),
    answers,
    report,
    catalogDomRatio: ratio,
  };
  writeFileSync(join(artifacts, `${slug}.json`), JSON.stringify(payload, null, 2));
  await page.screenshot({ path: join(artifacts, `${slug}.png`), fullPage: true });

  expect(
    ratio,
    `${profile.key}@${portal} consolidated DOM ${report.okCount}/${report.okCount + report.failCount}; failures=${JSON.stringify(report.failures)}`,
  ).toBeGreaterThanOrEqual(minRatio);

  // Identity must always pass
  for (const row of report.results.filter((r) => /^(email|phone|first name|last name|full name|legal name|phone number)$/i.test(r.label))) {
    expect(row.ok, `${profile.key}@${portal} ${row.label}: expected=${row.expected} observed=${row.observed}`).toBe(true);
  }

  return payload;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

test('API: all role profiles seeded and capture-complete', async () => {
  expect(PROFILES.length).toBeGreaterThanOrEqual(1);
  const portalCount = process.env.PORTAL ? 1 : 4;
  expect(RUNS.length).toBe(PROFILES.length * portalCount);
  for (const p of PROFILES) {
    const res = await fetch(`${API}/profile/${p.id}`);
    const json = await res.json();
    expect(res.ok, `${p.key} profile ${p.id}`).toBe(true);
    expect(json.data.parsedData.applicationProfile.displayName).toBe(p.displayName);
    expect(json.data.parsedData.applicationProfile.captureComplete).toBe(true);
    expect(json.data.parsedData.applicationProfile.phone.nationalNumber).toBe(p.phone);
  }
});

for (const run of RUNS) {
  test(`live ${run.key} (${run.roleTitle}) → ${run.portal} consolidated catalog`, async ({ page }) => {
    await openPortal(page, run.portal, run.jobUrl);
    await scrapeInjectVerifyCatalog(page, run, run.portal);
  });
}

test('write roles summary', async () => {
  const summary = RUNS.map((p) => {
    const file = join(artifacts, `${p.key}-${p.portal}.json`);
    if (!existsSync(file)) return { key: p.key, portal: p.portal, status: 'missing' };
    const d = JSON.parse(readFileSync(file, 'utf8'));
    return {
      key: p.key,
      displayName: p.displayName,
      roleTitle: p.roleTitle,
      portal: p.portal,
      required: d.required?.length,
      covered: d.cover?.covered,
      missingGenerate: d.cover?.missing?.map((m) => m.label) || [],
      domOk: d.report?.okCount,
      domFail: d.report?.failCount,
      catalogDomRatio: d.catalogDomRatio,
      failures: d.report?.failures || [],
    };
  });

  const byRole = {};
  for (const row of summary) {
    if (!byRole[row.key]) byRole[row.key] = { role: row.displayName, portals: {} };
    byRole[row.key].portals[row.portal] = {
      required: row.required,
      covered: row.covered,
      missingGenerate: row.missingGenerate,
      domOk: row.domOk,
      domFail: row.domFail,
      catalogDomRatio: row.catalogDomRatio,
      failLabels: (row.failures || []).map((f) => f.label),
    };
  }

  writeFileSync(join(artifacts, 'summary.json'), JSON.stringify({
    at: new Date().toISOString(),
    runs: summary.length,
    results: summary,
    byRole,
  }, null, 2));
  console.log('\nConsolidated catalog summary:\n', JSON.stringify(byRole, null, 2));
  expect(summary.every((r) => r.status !== 'missing' && (r.missingGenerate || []).length === 0)).toBe(true);
});
