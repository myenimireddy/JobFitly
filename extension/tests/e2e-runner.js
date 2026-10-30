/**
 * Real scrape + inject tests against mock portal HTML.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { PortalEngine, isSubmitControl } from '../src/portalEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TESTS = {
  greenhouse: {
    file: 'mock-greenhouse.html',
    url: 'https://boards.greenhouse.io/acme/jobs/1',
    fill: { Email: 'ada@example.com' },
  },
  lever: {
    file: 'mock-lever.html',
    url: 'https://jobs.lever.co/acme/abc',
    fill: { Email: 'ada@example.com' },
  },
  workday: {
    file: 'mock-workday.html',
    url: 'https://acme.myworkdayjobs.com/en-US/job/1',
    fill: { Email: 'ada@example.com' },
  },
  ashby: {
    file: 'mock-ashby.html',
    url: 'https://jobs.ashbyhq.com/acme',
    fill: { Email: 'ada@example.com' },
  },
};

function load(file, url) {
  const html = readFileSync(join(__dirname, file), 'utf8');
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  PortalEngine._window = dom.window;
  PortalEngine._document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  return dom;
}

function findByLabel(doc, label) {
  const needle = label.toLowerCase();
  return [...doc.querySelectorAll('input, textarea, select')].find((el) => {
    const lab = el.id && doc.querySelector(`label[for="${el.id}"]`);
    const text = (lab ? lab.textContent : '') + ' ' + (el.placeholder || '') + ' ' + (el.name || '');
    return text.toLowerCase().includes(needle);
  });
}

let failed = 0;
function check(ok, msg) {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed += 1;
}

for (const [name, cfg] of Object.entries(TESTS)) {
  console.log(`\n== ${name} ==`);
  const dom = load(cfg.file, cfg.url);
  const doc = dom.window.document;

  const fields = PortalEngine.scrape();
  check(fields.length > 0, `${name}: scraped ${fields.length} fields`);

  const emailField = fields.find((f) => /email/i.test(f.label));
  check(!!emailField, `${name}: found an Email field`);

  const emailEl = findByLabel(doc, 'email');
  if (emailEl) {
    check(!emailEl.value, `${name}: email empty before inject (review-then-inject)`);
  }

  const answers = fields
    .filter((f) => /email/i.test(f.label))
    .map((f) => ({ label: f.label, answer: 'ada@example.com' }));
  const filled = PortalEngine.inject(answers);
  check(filled > 0, `${name}: inject filled ${filled} field(s)`);

  const after = findByLabel(doc, 'email');
  if (after) {
    check(after.value === 'ada@example.com', `${name}: email is filled after inject`);
  }

  const submits = [...doc.querySelectorAll('button, input[type="submit"]')];
  check(submits.every((el) => !el.dataset.clicked), `${name}: Submit was not clicked`);
  submits.forEach((el) => {
    check(isSubmitControl(el) || el.tagName === 'BUTTON' || el.type === 'submit', `${name}: submit control detected or is a button`);
  });
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll portal scrape/inject checks passed');
