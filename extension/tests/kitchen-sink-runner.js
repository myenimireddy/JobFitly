/**
 * Kitchen-sink control coverage — scrape/inject against enriched mock HTML.
 * Asserts portal × control matrix (see docs/portal-field-coverage.json).
 * Invoked from `npm test` after mock-runner.js.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { PortalEngine } from '../src/portalEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coveragePath = join(__dirname, '../../docs/portal-field-coverage.json');
const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));

const FIXTURES = [
  {
    key: 'greenhouse_classic',
    file: 'greenhouse.html',
    url: 'https://boards.greenhouse.io/acme/jobs/1',
    inject: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Cover Letter', answer: 'Kitchen sink cover letter.' },
      { label: 'Are you able to work onsite?', answer: 'Yes' },
      { label: 'Will you now or in the future require sponsorship?', answer: 'No' },
    ],
    afterInject(doc) {
      const cover = doc.querySelector('#cover_letter')?.value || '';
      const radio = doc.querySelector('input[name="sponsorship"][value="No"]');
      return /kitchen sink/i.test(cover) && !!radio?.checked;
    },
  },
  {
    key: 'greenhouse_job_board',
    file: 'reddit-greenhouse.html',
    url: 'https://job-boards.greenhouse.io/jobfitly-fixture/jobs/local-1',
    inject: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Cover Letter', answer: 'Job board cover letter.' },
      { label: 'Gender (native select)', answer: 'Female' },
    ],
  },
  {
    key: 'lever',
    file: 'lever.html',
    url: 'https://jobs.lever.co/jobfitly-fixture/local-1/apply',
    inject: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Name', answer: 'Ada Lovelace' },
      { label: 'Cover Letter', answer: 'Lever cover.' },
      { label: 'How did you hear about us?', answer: 'LinkedIn' },
      { label: 'Are you authorized to work in the US?', answer: 'Yes' },
      { label: 'Pronouns', answer: 'She/her' },
    ],
  },
  {
    key: 'ashby',
    file: 'ashby.html',
    url: 'https://jobs.ashbyhq.com/jobfitly-fixture/application',
    inject: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Full Name', answer: 'Ada Lovelace' },
      { label: 'Cover Letter', answer: 'Ashby cover.' },
      { label: 'How did you hear about us?', answer: 'LinkedIn' },
      { label: 'Are you authorized to work in the US?', answer: 'Yes' },
    ],
    afterInject(doc) {
      const yes = doc.querySelector('[data-field-path="workAuthorization"] button[data-value="Yes"]');
      return yes?.getAttribute('aria-pressed') === 'true';
    },
  },
  {
    key: 'workday',
    file: 'workday.html',
    url: 'https://jobfitly.wd5.myworkdayjobs.com/en-US/external/job/Local-Fixture',
    inject: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Full Name', answer: 'Ada Lovelace' },
      { label: 'Country', answer: 'United States' },
      { label: 'State/Province', answer: 'Texas' },
      { label: 'Additional Information', answer: 'Workday notes.' },
      { label: 'How did you hear about us?', answer: 'LinkedIn' },
      { label: 'Are you legally authorized to work in the United States?', answer: 'Yes' },
    ],
    afterInject(doc) {
      const country = doc.getElementById('country-listbox-btn')?.textContent?.trim() || '';
      const state = doc.getElementById('state-listbox-btn')?.textContent?.trim() || '';
      return /united states/i.test(country) && /texas/i.test(state);
    },
  },
  {
    key: 'generic',
    file: 'generic.html',
    url: 'https://example.com/apply',
    inject: [
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Full Name', answer: 'Ada Lovelace' },
      { label: 'Additional notes', answer: 'Generic notes.' },
      { label: 'Country', answer: 'United States' },
      { label: 'Authorized to work in the US?', answer: 'Yes' },
    ],
  },
];

function load(file, url) {
  const html = readFileSync(join(__dirname, 'mocks', file), 'utf8');
  // runScripts so Workday listbox open/select handlers in the fixture fire on click.
  const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: 'dangerously' });
  PortalEngine._window = dom.window;
  PortalEngine._document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  // Quiet jsdom "Not implemented: window.scrollTo" during scrape.
  dom.window.scrollTo = () => {};
  return dom;
}

function filledCount(result) {
  if (typeof result === 'number') return result;
  if (result && typeof result.filled === 'number') return result.filled;
  return 0;
}

/** Detect which control kinds exist in the kitchen-sink fixture DOM. */
function detectControls(doc) {
  const hasText = !!doc.querySelector('input[type="text"], input[type="email"], input[type="tel"]');
  const hasTextarea = !!doc.querySelector('textarea');
  const hasNativeSelect = !!doc.querySelector('select');
  const hasRadio = !!doc.querySelector('input[type="radio"]');
  const hasCheckbox = !!doc.querySelector('input[type="checkbox"]');
  const hasFile = !!doc.querySelector('input[type="file"]');
  const hasCustom =
    !!doc.querySelector('.select__control, [role="combobox"], button[aria-haspopup="listbox"]')
    || !!doc.querySelector('[data-field-path="workAuthorization"] button, ._option_y2cw4');
  const hasContinue = !!doc.querySelector('[data-testid="ks-continue"]');
  return {
    text_input: hasText,
    textarea: hasTextarea,
    native_select: hasNativeSelect,
    radio: hasRadio,
    checkbox: hasCheckbox,
    custom_select: hasCustom,
    file_input: hasFile,
    multipage_continue: hasContinue,
  };
}

let failed = 0;
function check(ok, msg) {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed += 1;
}

async function run() {
  console.log('\n== kitchen-sink coverage ==');

  for (const fx of FIXTURES) {
    console.log(`\n-- ${fx.key} (${fx.file}) --`);
    const dom = load(fx.file, fx.url);
    const doc = dom.window.document;
    if (typeof fx.prep === 'function') fx.prep(doc);

    const present = detectControls(doc);
    const cells = coverage.cells[fx.key] || {};

    for (const control of coverage.controls) {
      const cell = cells[control];
      if (!cell) continue;
      if (cell.status === 'deferred') {
        check(true, `${fx.key}.${control}: deferred`);
        continue;
      }
      if (cell.status === 'red') {
        // Red means we intentionally do not require presence/inject yet.
        check(true, `${fx.key}.${control}: red (tracked gap)`);
        continue;
      }
      // green → control must be present in fixture
      check(!!present[control], `${fx.key}.${control}: present (green)`);
    }

    // File inputs must remain empty after inject (never auto-upload).
    const filesBefore = [...doc.querySelectorAll('input[type="file"]')].map((el) => el.files?.length || 0);

    const fields = await PortalEngine.scrape();
    check(fields.length >= 3, `${fx.key}: scraped ${fields.length} fields`);

    const n = filledCount(await PortalEngine.inject(fx.inject));
    check(n >= 2, `${fx.key}: inject filled ${n}`);

    if (typeof fx.afterInject === 'function') {
      check(!!fx.afterInject(doc), `${fx.key}: afterInject assertions`);
    }

    const filesAfter = [...doc.querySelectorAll('input[type="file"]')].map((el) => el.files?.length || 0);
    check(
      filesBefore.every((c, i) => c === filesAfter[i]),
      `${fx.key}: file inputs untouched`,
    );

    // Submit / Continue must not be auto-clicked
    check(
      ![...doc.querySelectorAll('button[type="submit"], #submit-btn, #btn-submit')].some((b) => b.dataset.clicked),
      `${fx.key}: submit not clicked`,
    );
  }

  if (failed) {
    console.error(`\n${failed} kitchen-sink check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll kitchen-sink coverage checks passed');
}

run();
