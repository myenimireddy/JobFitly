/**
 * Playwright helpers for real Side Panel UI flows (upload → capture → Fill Form).
 * Opens side_panel.default_path as a normal tab (Playwright cannot drive native side panel).
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { portalUrl, portalFixturePath, useLiveAts } from './portals.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const EXTENSION_DIST = join(__dirname, '../../dist');
export const SAMPLES_DIR = join(__dirname, '../../../docs/samples/resumes');
export const SAMPLE_RESUME = join(SAMPLES_DIR, '02-fullstack-alex-chen.pdf');
export const PORTAL_ORDER = ['greenhouse', 'lever', 'ashby', 'workday'];

/** Serve a local HTML fixture at a portal-looking URL (hostname drives PortalEngine.detect). */
async function gotoLocalFixture(page, portal) {
  const html = readFileSync(portalFixturePath(portal), 'utf8');
  const url = portalUrl(portal);
  await page.route('**/*', async (route) => {
    const type = route.request().resourceType();
    if (type === 'document') {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html,
      });
      return;
    }
    // Fixtures are self-contained — do not phone home to real ATS CDNs.
    await route.abort().catch(() => {});
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
}

/** Load 10 fictional personas (+ optional ROLE_KEY / PORTAL filters). */
export function loadUiMatrix() {
  const index = JSON.parse(readFileSync(join(SAMPLES_DIR, 'index.json'), 'utf8'));
  let profiles = (index.profiles || []).map((p) => {
    const data = JSON.parse(readFileSync(join(SAMPLES_DIR, p.json), 'utf8'));
    const phoneDigits = String(data.personalInfo?.phone || '').replace(/\D/g, '').slice(-10);
    const loc = String(data.personalInfo?.location || '');
    const [city, state] = loc.split(',').map((s) => s.trim());
    return {
      key: p.key,
      name: p.name,
      title: p.title,
      pdf: join(SAMPLES_DIR, p.pdf),
      firstName: data.personalInfo?.firstName || p.name.split(' ')[0],
      lastName: data.personalInfo?.lastName || p.name.split(' ').slice(1).join(' '),
      email: data.personalInfo?.email || `${p.key}@jobfitly.test`,
      phone: phoneDigits || '0000000000',
      city: city || 'Austin',
      state: state || 'TX',
      location: loc || 'Austin, TX',
      linkedin: data.personalInfo?.linkedin || `https://linkedin.com/in/${p.key}demo`,
      company: data.workExperience?.[0]?.company || 'Acme',
      pronouns: /jordan|riley|sam /i.test(p.name) ? 'They/them' : 'He/him',
      sponsorship: /diego|maya/i.test(p.key) ? 'Yes' : 'No',
    };
  });
  if (process.env.ROLE_KEY) {
    profiles = profiles.filter((p) => p.key === process.env.ROLE_KEY);
  }
  let portals = [...PORTAL_ORDER];
  if (process.env.PORTAL) {
    portals = portals.filter((p) => p === process.env.PORTAL);
  }
  const runs = [];
  for (const profile of profiles) {
    for (const portal of portals) {
      runs.push({ profile, portal });
    }
  }
  return { profiles, portals, runs };
}

export async function launchExtensionContext() {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false, // extension UI + focus assertions are more reliable headed
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    viewport: { width: 1280, height: 900 },
  });
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 30_000 });
  const extensionId = sw.url().split('/')[2];
  return { context, extensionId, serviceWorker: sw };
}

export async function openSidePanelPage(context, extensionId) {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/sidepanel/main.html`, {
    waitUntil: 'domcontentloaded',
  });
  // Marker uses `hidden` CSS — wait for attach, not visible.
  await panel.waitForSelector('[data-testid="panel-ready"]', { state: 'attached', timeout: 30_000 });
  return panel;
}

/** Dismiss Lever (and similar) cookie / privacy overlays that block form fields. */
export async function dismissCookieBanner(page) {
  // Prefer DOM click — Lever’s Privacy Notice can sit in a fixed overlay that
  // Playwright actionability checks treat as unstable.
  const clicked = await page.evaluate(() => {
    const match = (el) => {
      const t = (el.innerText || el.textContent || '').trim();
      return /^(Accept|Accept all|Accept All|I agree|Agree|Got it|OK)$/i.test(t);
    };
    const nodes = [
      ...document.querySelectorAll('button, a, [role="button"], input[type="button"]'),
    ];
    const btn = nodes.find(match);
    if (btn) {
      btn.click();
      return true;
    }
    // Banner copy: "Privacy Notice" / "uses cookies" — click Accept inside that root
    const roots = [...document.querySelectorAll('div, section, aside')].filter((el) =>
      /privacy notice|uses cookies|cookie/i.test(el.innerText || ''),
    );
    for (const root of roots.slice(0, 8)) {
      const b = [...root.querySelectorAll('button, a, [role="button"]')].find(match);
      if (b) {
        b.click();
        return true;
      }
    }
    return false;
  }).catch(() => false);

  if (clicked) await page.waitForTimeout(600);

  const oneTrust = page.locator('#onetrust-accept-btn-handler, #accept-recommended-btn-handler').first();
  if (await oneTrust.isVisible({ timeout: 600 }).catch(() => false)) {
    await oneTrust.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

export async function openPortalPage(context, portal = 'lever') {
  const page = await context.newPage();
  const live = useLiveAts();

  if (!live) {
    await gotoLocalFixture(page, portal);
  } else {
    const url = portalUrl(portal);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await dismissCookieBanner(page);
  }

  if (portal === 'lever') {
    if (live) await dismissCookieBanner(page);
    await page.waitForSelector('input[name="email"], .application-question', { timeout: live ? 45_000 : 10_000 });
  } else if (portal === 'greenhouse') {
    await page.waitForSelector('#first_name, input[aria-label="First Name"]', { timeout: live ? 60_000 : 10_000 });
  } else if (portal === 'ashby') {
    await page.waitForSelector('#_systemfield_email, input[type="email"]', { timeout: live ? 45_000 : 10_000 });
  } else if (portal === 'workday') {
    if (live) {
      await page.waitForTimeout(1500);
      await dismissCookieBanner(page);
      for (let attempt = 0; attempt < 3; attempt++) {
        if (await page.locator('#emailAddress--emailAddress').isVisible({ timeout: 1500 }).catch(() => false)) break;
        const apply = page.getByRole('button', { name: /^Apply$/i }).or(page.getByRole('link', { name: /^Apply$/i })).first();
        if (await apply.isVisible({ timeout: 5000 }).catch(() => false)) {
          await apply.click().catch(() => {});
          await page.waitForTimeout(2000);
        }
        const manual = page
          .getByRole('button', { name: /apply manually/i })
          .or(page.getByRole('link', { name: /apply manually/i }))
          .or(page.locator('a, button').filter({ hasText: /apply manually/i }))
          .first();
        if (await manual.isVisible({ timeout: 8000 }).catch(() => false)) {
          await manual.click({ force: true }).catch(() => {});
          await page.waitForTimeout(3000);
        }
        await dismissCookieBanner(page);
        if (await page.locator('#emailAddress--emailAddress').isVisible({ timeout: 8000 }).catch(() => false)) break;
        if (attempt === 1) {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
    }
    await page.waitForSelector('#emailAddress--emailAddress, #email', { timeout: live ? 60_000 : 10_000 });
  }
  await page.waitForTimeout(live ? 800 : 200);
  return page;
}

/** Bring job page to front briefly so Panel records jobTabId, then return to panel. */
export async function pinJobTab(panel, jobPage) {
  await jobPage.bringToFront();
  await jobPage.waitForTimeout(400);
  await panel.bringToFront();
  await panel.waitForTimeout(300);
}

/**
 * Upload + parse a résumé PDF into the Side Panel.
 * @param {{ force?: boolean, expectName?: string }} [opts]
 *   If expectName is already showing and force is false, skip re-upload (matrix reuse).
 */
export async function uploadResume(panel, pdfPath = SAMPLE_RESUME, opts = {}) {
  const { force = false, expectName = '' } = opts;
  const ready = panel.locator('[data-testid="panel-ready"]');
  const beforeId = (await ready.getAttribute('data-profile-id')) || '';

  if (!force && beforeId && expectName) {
    const bodyText = await panel.locator('body').innerText().catch(() => '');
    if (bodyText.includes(expectName) && /skills parsed|Application details|Application profile/i.test(bodyText)) {
      return; // same persona already loaded
    }
  }

  // Clear existing profile first if present
  const clearBtn = panel.getByRole('button', { name: /^(Clear|Re-upload)$/i });
  if (await clearBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await clearBtn.click();
    await panel.waitForFunction(() => {
      const el = document.querySelector('[data-testid="panel-ready"]');
      return el && !el.getAttribute('data-profile-id');
    }, null, { timeout: 15_000 }).catch(() => {});
    await panel.waitForSelector('[data-testid="resume-upload-input"]', {
      state: 'attached',
      timeout: 15_000,
    });
  }

  const input = panel.locator('[data-testid="resume-upload-input"]');
  await input.setInputFiles(pdfPath);

  // Wait until parse finishes with a *new* profile id (not the pre-loaded one).
  await panel.waitForFunction((prev) => {
    const el = document.querySelector('[data-testid="panel-ready"]');
    const id = el?.getAttribute('data-profile-id') || '';
    return !!(id && id !== prev);
  }, beforeId, { timeout: process.env.CI ? 90_000 : 180_000 });

  await panel.waitForSelector('text=/skills parsed|Application details|Application profile/i', {
    timeout: 60_000,
  });
  // Upload spinner gone
  await panel.waitForSelector('text=/Uploading/i', { state: 'hidden', timeout: 30_000 }).catch(() => {});
}

/**
 * Fill required capture fields from a persona (docs/samples/resumes/*.json), then save.
 * @param {import('@playwright/test').Page} panel
 * @param {ReturnType<typeof loadUiMatrix>['profiles'][0]} [persona]
 */
export async function completeApplicationCapture(panel, persona = null) {
  const p = persona || {
    firstName: 'Alex',
    phone: '0000000002',
    city: 'San Francisco',
    state: 'CA',
    location: 'San Francisco, CA',
    linkedin: 'https://linkedin.com/in/alexchendemo',
    pronouns: 'He/him',
    sponsorship: 'No',
  };

  const save = panel.locator('[data-testid="save-application-profile"]');
  if (!(await save.isVisible({ timeout: 5000 }).catch(() => false))) {
    const complete = panel.getByRole('button', { name: /complete details|edit details/i });
    if (await complete.isVisible({ timeout: 2000 }).catch(() => false)) {
      await complete.click();
      await panel.waitForTimeout(500);
    }
  }
  if (!(await save.isVisible({ timeout: 8000 }).catch(() => false))) return;

  // Expand all groups
  for (const btn of await panel.locator('button:has-text("Show")').all()) {
    await btn.click().catch(() => {});
  }

  const fillIfEmpty = async (labelRe, value) => {
    if (value == null || value === '') return;
    const lab = panel.locator('label').filter({ hasText: labelRe }).first();
    if (!(await lab.isVisible({ timeout: 800 }).catch(() => false))) return;
    const input = lab.locator('input, select').first();
    const tag = await input.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') {
      await input.selectOption({ label: String(value) }).catch(() => input.selectOption({ value: String(value) }).catch(() => {}));
      return;
    }
    const cur = await input.inputValue().catch(() => '');
    if (!String(cur || '').trim()) await input.fill(String(value));
  };

  await fillIfEmpty(/Preferred first name/i, p.firstName);
  const pronouns = panel.locator('label').filter({ hasText: /^Pronouns/i }).locator('select').first();
  if (await pronouns.isVisible({ timeout: 500 }).catch(() => false)) {
    await pronouns.selectOption({ label: p.pronouns || 'He/him' }).catch(() => {});
  }
  await fillIfEmpty(/Country of residence/i, 'United States');
  await fillIfEmpty(/^City$/i, p.city);
  await fillIfEmpty(/State/i, p.state);
  await fillIfEmpty(/Postal/i, '10001');
  await fillIfEmpty(/Location \(City/i, p.location);
  await fillIfEmpty(/LinkedIn/i, p.linkedin);
  await fillIfEmpty(/hear about/i, 'LinkedIn');

  const phoneCountry = panel.getByPlaceholder('Country (United States)');
  if (await phoneCountry.isVisible({ timeout: 500 }).catch(() => false)) {
    if (!(await phoneCountry.inputValue()).trim()) await phoneCountry.fill('United States');
  }
  const dial = panel.getByPlaceholder('Dial (+1)');
  if (await dial.isVisible({ timeout: 500 }).catch(() => false)) {
    if (!(await dial.inputValue()).trim()) await dial.fill('+1');
  }
  const num = panel.getByPlaceholder('Number');
  if (await num.isVisible({ timeout: 500 }).catch(() => false)) {
    // Always write the masked demo phone — parsers/LLMs sometimes invent real-looking numbers.
    await num.fill(p.phone || '0000000000');
  }

  await fillIfEmpty(/Authorized to work/i, 'Yes');
  await fillIfEmpty(/visa sponsorship/i, p.sponsorship || 'No');
  await fillIfEmpty(/18 or over/i, 'Yes');

  await save.click();
  await panel.waitForSelector('text=/Application profile ready|Still needed/i', { timeout: 30_000 });
  // "Still needed" banner can remount while React settles — dismiss without blocking Fill Form.
  const later = panel.getByRole('button', { name: /^Later$/i });
  if (await later.isVisible({ timeout: 1500 }).catch(() => false)) {
    await later.click({ force: true }).catch(() => {});
    await panel.waitForTimeout(300);
  }

  // Force masked demo phone onto the saved profile (parsers/LLMs often invent real-looking numbers).
  await syncPersonaPhoneToProfile(panel, p);
}

/** Overwrite personalInfo + applicationProfile phone with the persona’s masked number (Node-side API). */
export async function syncPersonaPhoneToProfile(panel, persona) {
  const phone = String(persona?.phone || '').replace(/\D/g, '').slice(-10);
  if (!phone) return;
  const profileId = await panel.locator('[data-testid="panel-ready"]').getAttribute('data-profile-id');
  if (!profileId) return;

  const base = 'http://localhost:3000/api';
  const get = await fetch(`${base}/profile/${profileId}`);
  if (!get.ok) {
    console.warn('syncPersonaPhoneToProfile GET failed', profileId, get.status);
    return;
  }
  const body = await get.json();
  const parsed = body?.data?.parsedData || {};
  const personalInfo = { ...(parsed.personalInfo || {}), phone };
  // Prior HITL saves land in extraAnswers and win over profile facts — overwrite phone there too.
  const extraAnswers = { ...(parsed.extraAnswers || {}), phone };
  const patch = await fetch(`${base}/profile/${profileId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parsedData: { ...parsed, personalInfo, extraAnswers } }),
  });
  if (!patch.ok) {
    console.warn('syncPersonaPhoneToProfile PATCH failed', await patch.text());
    return;
  }
  const put = await fetch(`${base}/profile/${profileId}/application-profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: { country: 'United States', countryCode: '+1', nationalNumber: phone },
    }),
  });
  if (!put.ok) {
    console.warn('syncPersonaPhoneToProfile PUT failed', await put.text());
  }
  await panel.waitForTimeout(200);
}

/** Reset Fill Form UI back to idle so the next run can click Fill Form again. */
export async function resetFillFormUi(panel) {
  const done = panel.getByRole('button', { name: /^(Done|Stop)$/i });
  if (await done.isVisible({ timeout: 2000 }).catch(() => false)) {
    await done.click();
    await panel.waitForTimeout(400);
  }
  await panel.locator('[data-testid="fill-form-btn"]').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Read autofill-done stats (identified / filled / skipped / skippedFilled). */
export async function readAutofillDoneStats(panel) {
  const done = panel.locator('[data-testid="autofill-done"]');
  await done.waitFor({ state: 'visible', timeout: 60_000 });
  return {
    identified: Number(await done.getAttribute('data-identified') || '0'),
    filled: Number(await done.getAttribute('data-filled') || '0'),
    skipped: Number(await done.getAttribute('data-skipped') || '0'),
    skippedFilled: Number(await done.getAttribute('data-skipped-filled') || '0'),
    label: (await panel.locator('[data-testid="autofill-done"] p').first().innerText().catch(() => '')) || '',
  };
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Read identity-ish values from the portal form DOM. */
export async function readFormIdentity(jobPage, portal) {
  return jobPage.evaluate((p) => {
    const val = (...sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && String(el.value || '').trim()) return String(el.value).trim();
      }
      return '';
    };
    if (p === 'lever') {
      return {
        email: val('input[name="email"]'),
        name: val('input[name="name"]'),
        phone: val('input[name="phone"], input[type="tel"]'),
      };
    }
    if (p === 'ashby') {
      return {
        email: val('#_systemfield_email', 'input[type="email"]'),
        name: val('input[name="fullName"], [data-field-path="fullName"] input'),
        phone: val('#_systemfield_phone', 'input[type="tel"]'),
      };
    }
    if (p === 'greenhouse') {
      return {
        email: val('#email', 'input[type="email"]', 'input[aria-label="Email"]'),
        name: [val('#first_name', 'input[aria-label="First Name"]'), val('#last_name', 'input[aria-label="Last Name"]')]
          .filter(Boolean)
          .join(' ')
          .trim(),
        phone: val('#phone', 'input[type="tel"]'),
      };
    }
    if (p === 'workday') {
      return {
        email: val('#emailAddress--emailAddress', '#email'),
        name: val('#fullName', 'input[name="fullName"]'),
        phone: val('#phone', '#phoneNumber--phoneNumber', 'input[type="tel"]'),
      };
    }
    return { email: '', name: '', phone: '' };
  }, portal);
}

/**
 * Confirm extension persona facts match what landed on the form
 * (email / name / phone digits). Phone may be absent on sparse fixtures.
 */
export async function assertFormMatchesPersona(jobPage, portal, persona) {
  const form = await readFormIdentity(jobPage, portal);
  const expectEmail = String(persona.email || '').toLowerCase();
  const formEmail = String(form.email || '').toLowerCase();
  if (!formEmail.includes('@') || /n\/a|demo e2e/i.test(formEmail)) {
    throw new Error(`${portal} email missing/bad on form: ${form.email}`);
  }
  if (expectEmail && formEmail !== expectEmail && !formEmail.includes(expectEmail.split('@')[0])) {
    throw new Error(`${portal} email mismatch: form=${form.email} persona=${persona.email}`);
  }

  const expectName = `${persona.firstName || ''} ${persona.lastName || ''}`.trim() || persona.name || '';
  if (expectName && form.name) {
    const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const fn = norm(form.name);
    const en = norm(expectName);
    const first = norm(persona.firstName || expectName.split(' ')[0] || '');
    if (fn !== en && !(first && fn.includes(first))) {
      throw new Error(`${portal} name mismatch: form=${form.name} persona=${expectName}`);
    }
  } else if (expectName && !form.name && portal === 'lever') {
    throw new Error(`${portal} name empty on form`);
  }

  const expectPhone = digits(persona.phone);
  const formPhone = digits(form.phone);
  if (expectPhone && formPhone) {
    // Compare last 4+ significant digits (fixtures may format / truncate dial codes).
    const a = expectPhone.slice(-4);
    const b = formPhone.slice(-4);
    if (a && b && a !== b) {
      throw new Error(`${portal} phone mismatch: form=${form.phone} persona=${persona.phone}`);
    }
  }

  return form;
}

/** Spot-check identity fields landed on the ATS / fixture page. */
export async function assertCoreIdentityOnPage(jobPage, portal, persona) {
  return assertFormMatchesPersona(jobPage, portal, persona);
}

/**
 * Drive HITL prompts until autofill-done. Prefers selecting options / Fill; Skip as last resort.
 * Also samples job-page focus stamps for assertions.
 */
export async function runFillFormWithHitl(panel, jobPage, { maxSteps = 120, persona = null } = {}) {
  await pinJobTab(panel, jobPage);
  await panel.locator('[data-testid="fill-form-btn"]').click();

  const focusSamples = [];
  for (let step = 0; step < maxSteps; step++) {
    if (await panel.locator('[data-testid="autofill-done"]').isVisible({ timeout: 800 }).catch(() => false)) {
      break;
    }

    // Sample focus on job page while a field is being worked
    const stamp = await jobPage.evaluate(() => ({
      label: document.documentElement.dataset.jobfitlyActiveLabel || '',
      activeTag: document.activeElement?.tagName || '',
      activeName: document.activeElement?.getAttribute?.('name') || '',
    })).catch(() => null);
    if (stamp?.label) focusSamples.push(stamp);

    const prompt = panel.locator('[data-testid="field-prompt"]');
    if (await prompt.isVisible({ timeout: 1500 }).catch(() => false)) {
      const select = prompt.locator('[data-testid="field-prompt-select"]');
      if (await select.isVisible({ timeout: 300 }).catch(() => false)) {
        const options = await select.locator('option').allTextContents();
        const pick = options.find((o) => o && !/^choose/i.test(o) && !/^select/i.test(o));
        if (pick) {
          await select.selectOption({ label: pick }).catch(async () => {
            await select.selectOption({ index: 1 }).catch(() => {});
          });
          await panel.waitForTimeout(350);
          continue;
        }
      }

      // Consent Yes buttons
      const yes = prompt.getByRole('button', { name: /^(Yes|I agree|Agree)$/i }).first();
      if (await yes.isVisible({ timeout: 200 }).catch(() => false)) {
        await yes.click();
        await panel.waitForTimeout(350);
        continue;
      }

      const fillBtn = prompt.locator('[data-testid="field-prompt-fill"]');
      if (await fillBtn.isEnabled({ timeout: 200 }).catch(() => false)) {
        await fillBtn.click();
        await panel.waitForTimeout(400);
        continue;
      }

      // Type a short fallback for empty free-text, then Fill — else Skip.
      const promptText = (await prompt.innerText().catch(() => '')) || '';
      const ta = prompt.locator('textarea, input[type="text"], input:not([type])').first();
      if (await ta.isVisible({ timeout: 200 }).catch(() => false)) {
        const v = await ta.inputValue().catch(() => '');
        if (!String(v || '').trim()) {
          let stub = 'N/A — demo e2e';
          if (/e-?mail/i.test(promptText) && persona?.email) stub = persona.email;
          else if (/phone/i.test(promptText) && persona?.phone) stub = persona.phone;
          else if (/first name/i.test(promptText) && persona?.firstName) stub = persona.firstName;
          else if (/last name/i.test(promptText) && persona?.lastName) stub = persona.lastName;
          else if (/^name|full name/i.test(promptText) && persona?.name) stub = persona.name;
          else if (/e-?mail|phone|first name|last name|\bfull name\b/i.test(promptText)) {
            // Sensitive identity with no persona value — Skip rather than pollute the ATS.
            const skip = prompt.locator('[data-testid="field-prompt-skip"]').or(prompt.getByRole('button', { name: /^Skip$/i }));
            if (await skip.isVisible({ timeout: 200 }).catch(() => false)) {
              await skip.click();
              await panel.waitForTimeout(300);
              continue;
            }
          }
          await ta.fill(stub);
        }
        if (await fillBtn.isEnabled({ timeout: 200 }).catch(() => false)) {
          await fillBtn.click();
          await panel.waitForTimeout(400);
          continue;
        }
      }

      const skip = prompt.locator('[data-testid="field-prompt-skip"]').or(prompt.getByRole('button', { name: /^Skip$/i }));
      if (await skip.isVisible({ timeout: 200 }).catch(() => false)) {
        await skip.click();
        await panel.waitForTimeout(300);
        continue;
      }
    }

    await panel.waitForTimeout(500);
  }

  const done = panel.locator('[data-testid="autofill-done"]');
  await done.waitFor({ state: 'visible', timeout: 120_000 });

  // Fast portals (e.g. Ashby) can finish between polls — grab a final stamp / filled-value proxy.
  const finalStamp = await jobPage.evaluate(() => ({
    label: document.documentElement.dataset.jobfitlyActiveLabel || '',
    activeTag: document.activeElement?.tagName || '',
    activeName: document.activeElement?.getAttribute?.('name') || '',
    valued: [...document.querySelectorAll('input, textarea, select')].filter(
      (el) => String(el.value || '').trim().length > 0,
    ).length,
  })).catch(() => null);
  if (finalStamp?.label) focusSamples.push(finalStamp);
  else if (!focusSamples.length && finalStamp?.valued > 0) {
    focusSamples.push({
      label: `(post-fill values:${finalStamp.valued})`,
      activeTag: finalStamp.activeTag || 'SYNTH',
      activeName: finalStamp.activeName || '',
    });
  }

  const stats = {
    identified: Number(await done.getAttribute('data-identified') || '0'),
    filled: Number(await done.getAttribute('data-filled') || '0'),
    skipped: Number(await done.getAttribute('data-skipped') || '0'),
    skippedFilled: Number(await done.getAttribute('data-skipped-filled') || '0'),
    focusSamples,
  };
  return stats;
}
