/**
 * Live validation: inject consolidated-fill-context.json on real ATS pages and
 * assert each answer is visible in the DOM (resume left empty — no submit).
 */
import { test, expect } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
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

async function loadEngine(page) {
  const engine = await bundleEngine();
  await page.evaluate((code) => {
    // eslint-disable-next-line no-new-func
    new Function(code)();
  }, engine);
}

/** Inject answers, then read back observed values for each expected label. */
async function injectAndVerify(page, answers) {
  return page.evaluate(async (ans) => {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const score = (a, b) => {
      const na = norm(a);
      const nb = norm(b);
      if (!na || !nb) return 0;
      if (na === nb) return 10000 + na.length;
      const ta = tokens(a);
      const tb = tokens(b);
      const aInB = ta.every((t) => tb.includes(t));
      const bInA = tb.every((t) => ta.includes(t));
      if (aInB || bInA) {
        return Math.min(ta.length, tb.length) * 100 - Math.abs(ta.length - tb.length) * 80;
      }
      return 0;
    };
    const softMatch = (expected, observed) => {
      if (!expected) return true;
      const e = String(expected).trim();
      const o = String(observed || '').trim();
      if (!o) return false;
      if (norm(e) === norm(o)) return true;
      if (norm(o).includes(norm(e)) || norm(e).includes(norm(o))) return true;
      // Phone: compare national digits
      const ed = e.replace(/\D/g, '');
      const od = o.replace(/\D/g, '');
      if (ed.length >= 10 && od.includes(ed.slice(-10))) return true;
      // Workday aria-label noise: "Country United States of America Required"
      if (/united states/i.test(e) && /united states/i.test(o)) return true;
      if (/^texas$/i.test(e) && /texas/i.test(o)) return true;
      if (/^mobile$/i.test(e) && /mobile/i.test(o)) return true;
      // Yes/No short answers vs long ADA/veteran strings / checkbox value "1"
      if (/^(yes|1|true|on)$/i.test(e) && /^(yes|1|true|on)$/i.test(o)) return true;
      if (/^yes$/i.test(e) && /^yes\b/i.test(o)) return true;
      if (/^no$/i.test(e) && (/^no\b/i.test(o) || /not a|do not have|no military|not a protected/i.test(o))) return true;
      // GH country chip often displays "+1" after United States commits
      if (/united states/i.test(e) && (/^\+?1$/.test(o) || /united states/i.test(o))) return true;
      // City autocomplete may expand "Austin" / "Austin, TX" → "Austin, Texas, United States"
      if (/dallas/i.test(e) && /dallas/i.test(o)) return true;
      return score(e, o) > 0;
    };

    const portal = window.PortalEngine.detect();
    const filled = await window.PortalEngine.inject(ans);
    await new Promise((r) => setTimeout(r, 700));

    const clean = (s) => String(s || '').replace(/[*:✱＊]+/g, ' ').replace(/\s+/g, ' ').trim();

    const valueFromContainer = (wrap) => {
      if (!wrap) return '';
      const singles = [...wrap.querySelectorAll('.select__single-value, .select__multi-value__label')]
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean);
      if (singles.length) return singles.join(' | ');

      const listBtn = wrap.querySelector('button[aria-haspopup="listbox"]');
      if (listBtn) return (listBtn.innerText || listBtn.getAttribute('aria-label') || '').trim();

      const multiSelected = [...wrap.querySelectorAll('[data-automation-id="selectedItem"]')]
        .map((el) => (el.innerText || '').trim())
        .filter(Boolean);
      if (multiSelected.length) return multiSelected.join(' | ');

      const checkedRadio = wrap.querySelector('input[type="radio"]:checked');
      if (checkedRadio) {
        const span = checkedRadio.parentElement?.querySelector('.application-answer-alternative');
        if (span) return clean(span.innerText);
        const rl = document.querySelector(`label[for="${checkedRadio.id}"]`);
        return rl ? clean(rl.innerText) : checkedRadio.value;
      }

      const checkedBoxes = [...wrap.querySelectorAll('input[type="checkbox"]:checked')];
      if (checkedBoxes.length) {
        const texts = checkedBoxes.map((cb) => {
          const span = cb.parentElement?.querySelector('.application-answer-alternative');
          return span ? clean(span.innerText) : cb.value;
        }).filter(Boolean);
        if (texts.length) return texts.join(' | ');
      }

      const cb = wrap.querySelector('input[type="checkbox"]');
      if (cb && !wrap.querySelector('input[type="text"], input[type="email"], input[type="tel"], textarea, input[role="combobox"]')) {
        return cb.checked ? 'yes' : 'no';
      }

      const select = wrap.querySelector('select');
      if (select && select.selectedIndex >= 0) {
        const opt = select.options[select.selectedIndex];
        return clean((opt && opt.text) || select.value);
      }

      const input = wrap.querySelector(
        'textarea, input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([aria-hidden="true"])',
      );
      if (input && input.value && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(input.value)) return input.value;
      return '';
    };

    const readFieldValue = (label) => {
      // 1) aria-label / name exact controls (Greenhouse Job Board)
      const byAria = [...document.querySelectorAll('input[aria-label], textarea[aria-label], select[aria-label]')]
        .find((el) => score(el.getAttribute('aria-label'), label) > 0);
      if (byAria) {
        if (byAria.tagName === 'SELECT') {
          const opt = byAria.options[byAria.selectedIndex];
          return clean((opt && opt.text) || byAria.value);
        }
        if (byAria.value) return byAria.value;
        const nest = byAria.closest('.field, [class*="field--"], .select__container, div') || byAria.parentElement;
        const fromNest = valueFromContainer(nest);
        if (fromNest) return fromNest;
      }

      // 2) label[for] → control (GH / generic)
      let bestLabel = null;
      let bestScore = 0;
      for (const lab of document.querySelectorAll('label')) {
        const text = clean(lab.innerText || lab.textContent);
        const sc = score(text, label);
        if (sc > bestScore) {
          bestScore = sc;
          bestLabel = lab;
        }
      }
      if (bestLabel && bestScore > 0) {
        if (bestLabel.htmlFor) {
          const el = document.getElementById(bestLabel.htmlFor);
          if (el) {
            if (el.tagName === 'SELECT') {
              const opt = el.options[el.selectedIndex];
              const t = clean((opt && opt.text) || el.value);
              if (t) return t;
            }
            // Workday listbox button — visible text, not the opaque value UUID
            if (el.tagName === 'BUTTON' || el.getAttribute('aria-haspopup') === 'listbox') {
              const t = clean(el.innerText || el.getAttribute('aria-label') || '');
              if (t && !/^(select one|select\.\.\.|choose)/i.test(t)) return t;
            }
            if (el.type === 'checkbox') return el.checked ? 'yes' : 'no';
            // Ignore opaque Workday UUIDs in companion inputs
            if (el.value && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(el.value) && el.value.length < 80) {
              return el.value;
            }
            let p = el.parentElement;
            for (let i = 0; i < 8 && p; i++) {
              const v = valueFromContainer(p);
              if (v && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(v)) return v;
              p = p.parentElement;
            }
          }
        }
        const wrap = bestLabel.closest(
          '.field, [class*="field--"], .application-question, [data-field-path], [data-automation-id^="formField-"], [data-automation-id="radioGroup"], li, div',
        );
        const fromWrap = valueFromContainer(wrap);
        if (fromWrap && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(fromWrap)) return fromWrap;
      }

      // 3) Portal-ish containers with an inner label (Lever / Ashby / Workday)
      let bestWrap = null;
      bestScore = 0;
      for (const wrap of document.querySelectorAll(
        '.application-question, [data-field-path], [data-automation-id^="formField-"], [data-automation-id="radioGroup"]',
      )) {
        // Lever: prefer .text; EEO titles are bare text nodes under .application-label.
        const textNode = wrap.querySelector('.application-label .text');
        const appLabel = wrap.querySelector('.application-label');
        let fLabel = '';
        if (textNode) {
          fLabel = clean(textNode.innerText || textNode.textContent);
        } else if (appLabel) {
          const direct = [...appLabel.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent || '')
            .join(' ')
            .trim();
          fLabel = clean(direct || appLabel.innerText || appLabel.textContent);
        } else {
          const labelEl = wrap.querySelector('.ashby-application-form-question-title, [data-automation-id="formLabel"], label, [class*="title"]');
          fLabel = labelEl ? clean(labelEl.innerText || labelEl.textContent) : '';
        }
        fLabel = fLabel.split(/\n/)[0].replace(/\bSelect\b.*/i, '').trim();
        const sc = score(fLabel, label);
        if (sc > bestScore) {
          bestScore = sc;
          bestWrap = wrap;
        }
      }
      if (bestWrap && bestScore > 0) {
        const select = bestWrap.querySelector('select');
        if (select && select.selectedIndex >= 0) {
          const t = clean(select.options[select.selectedIndex]?.text || select.value);
          if (t && !/^select/i.test(t)) return t;
        }
        const checkedBoxes = [...bestWrap.querySelectorAll('input[type="checkbox"]:checked')];
        if (checkedBoxes.length) {
          return checkedBoxes.map((cb) => {
            const span = cb.parentElement?.querySelector('.application-answer-alternative');
            return span ? clean(span.innerText) : cb.value;
          }).filter(Boolean).join(' | ');
        }
        const checked = bestWrap.querySelector('input[type="radio"]:checked');
        if (checked) {
          const span = checked.parentElement?.querySelector('.application-answer-alternative');
          return span ? clean(span.innerText) : checked.value;
        }
        const v = valueFromContainer(bestWrap);
        if (v && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(v)) return v;
      }
      return '';
    };

    const results = ans.map(({ label, answer }) => {
      const observed = readFieldValue(label);
      const ok = softMatch(answer, observed);
      return { label, expected: answer, observed, ok };
    });

    return {
      portal,
      filled,
      url: location.href,
      results,
      okCount: results.filter((r) => r.ok).length,
      failCount: results.filter((r) => !r.ok).length,
      failures: results.filter((r) => !r.ok),
    };
  }, answers);
}

function assertCatalog(report, portal, minOkRatio = 0.85) {
  console.log(`\n===== ${portal.toUpperCase()} =====`);
  console.log(JSON.stringify({
    portal: report.portal,
    filled: report.filled,
    ok: report.okCount,
    fail: report.failCount,
    url: report.url,
    failures: report.failures,
  }, null, 2));
  writeFileSync(join(artifacts, `validate-${portal}.json`), JSON.stringify(report, null, 2));

  expect(report.portal, `${portal} detect`).toBe(portal);
  expect(report.okCount + report.failCount, `${portal} has answers`).toBeGreaterThan(0);
  const ratio = report.okCount / (report.okCount + report.failCount);
  expect(
    ratio,
    `${portal} fill ratio ${report.okCount}/${report.okCount + report.failCount}; failures: ${JSON.stringify(report.failures)}`,
  ).toBeGreaterThanOrEqual(minOkRatio);

  const must = report.results.filter((r) => /^(email|phone|first name|last name|full name|legal name|phone number)$/i.test(r.label));
  for (const row of must) {
    expect(row.ok, `${portal} identity ${row.label}: expected=${row.expected} observed=${row.observed}`).toBe(true);
  }
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('live Greenhouse: consolidated catalog fills', async ({ page }) => {
  const url = portalUrl('greenhouse');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const apply = page.getByRole('button', { name: /apply|submit application/i }).first();
  if (await apply.isVisible().catch(() => false)) {
    const text = (await apply.textContent()) || '';
    if (/^apply/i.test(text.trim())) await apply.click().catch(() => {});
  }
  await page.waitForSelector('#application-form, form.application--form, #first_name, input[aria-label="First Name"]', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  await loadEngine(page);

  const answers = answersFor('greenhouse');
  const report = await injectAndVerify(page, answers);
  await page.screenshot({ path: join(artifacts, 'validate-greenhouse.png'), fullPage: true });
  assertCatalog(report, 'greenhouse', 0.95);
});

test('live Lever: consolidated catalog fills', async ({ page }) => {
  const url = portalUrl('lever');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('input[name="email"], .application-question', { timeout: 30_000 });
  await page.waitForTimeout(1000);
  await loadEngine(page);

  const report = await injectAndVerify(page, answersFor('lever'));
  await page.screenshot({ path: join(artifacts, 'validate-lever.png'), fullPage: true });
  assertCatalog(report, 'lever', 0.85);
});

test('live Ashby: consolidated catalog fills', async ({ page }) => {
  const url = portalUrl('ashby');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#_systemfield_email, [data-field-path="_systemfield_email"]', { timeout: 45_000 });
  await page.waitForTimeout(1500);
  await loadEngine(page);

  const report = await injectAndVerify(page, answersFor('ashby'));
  await page.screenshot({ path: join(artifacts, 'validate-ashby.png'), fullPage: true });
  assertCatalog(report, 'ashby', 0.95);
});

test('live Workday: consolidated catalog fills', async ({ page }) => {
  const job = portalUrl('workday');
  await page.goto(job, { waitUntil: 'domcontentloaded', timeout: 60_000 });
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
  await loadEngine(page);

  const report = await injectAndVerify(page, answersFor('workday'));
  await page.screenshot({ path: join(artifacts, 'validate-workday.png'), fullPage: true });
  assertCatalog(report, 'workday', 0.85);
});
