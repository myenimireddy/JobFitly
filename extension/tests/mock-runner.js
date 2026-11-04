/**
 * Offline portal scrape + inject against mock HTML (jsdom).
 * Live ATS sites live under ../e2e — do not mix them here.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { PortalEngine } from '../src/portalEngine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function load(file, url) {
  const html = readFileSync(join(__dirname, 'mocks', file), 'utf8');
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  // PortalEngine scrolls after scraping in browsers; jsdom leaves it unimplemented.
  dom.window.scrollTo = () => {};
  PortalEngine._window = dom.window;
  PortalEngine._document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  globalThis.Event = dom.window.Event;
  globalThis.MouseEvent = dom.window.MouseEvent;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent;
  return dom;
}

function filledCount(result) {
  if (typeof result === 'number') return result;
  if (result && typeof result.filled === 'number') return result.filled;
  return 0;
}

function findByLabel(doc, label) {
  const needle = label.toLowerCase();
  return [...doc.querySelectorAll('input, textarea, select')].find((el) => {
    const lab = el.id && doc.querySelector(`label[for="${el.id}"]`);
    const near = el.closest('.application-question, [data-automation-id], [data-field-path]');
    const nearLabel = near?.querySelector('.application-label, label, .ashby-application-form-question-title');
    const text = [
      lab ? lab.textContent : '',
      nearLabel ? nearLabel.textContent : '',
      el.placeholder || '',
      el.name || '',
      el.id || '',
    ].join(' ');
    return text.toLowerCase().includes(needle);
  });
}

let failed = 0;
function check(ok, msg) {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed += 1;
}

async function run() {
  // ── Classic Greenhouse (native <select>, not Job Board React-Select) ──
  {
    console.log('\n== greenhouse (classic mock) ==');
    const dom = load('greenhouse.html', 'https://boards.greenhouse.io/acme/jobs/1');
    const doc = dom.window.document;
    const fields = await PortalEngine.scrape();
    check(fields.length > 0, `greenhouse: scraped ${fields.length} fields`);
    check(!!fields.find((f) => /email/i.test(f.label)), 'greenhouse: found Email');

    const n = filledCount(await PortalEngine.inject([
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'First Name', answer: 'Ada' },
      { label: 'Phone', answer: '5550000000' },
      { label: 'Are you able to work onsite?', answer: 'Yes' },
      { label: 'Gender', answer: 'Female' },
    ]));
    check(n >= 3, `greenhouse: inject filled ${n}`);
    check(findByLabel(doc, 'email')?.value === 'ada@example.com', 'greenhouse: email filled');
    check(doc.querySelector('#question_1')?.value === 'Yes' || /yes/i.test(doc.querySelector('#question_1')?.selectedOptions?.[0]?.text || ''), 'greenhouse: onsite select');
    check(doc.querySelector('#gender')?.selectedOptions?.[0]?.text === 'Female' || doc.querySelector('#gender')?.value === 'Female', 'greenhouse: gender select');
    check([...doc.querySelectorAll('button')].every((el) => !el.dataset.clicked), 'greenhouse: submit not clicked');
  }

  // ── Lever ──
  {
    console.log('\n== lever ==');
    const dom = load('lever.html', 'https://jobs.lever.co/acme/abc');
    const doc = dom.window.document;
    const fields = await PortalEngine.scrape();
    check(fields.length > 0, `lever: scraped ${fields.length} fields`);
    check(!!fields.find((f) => /email/i.test(f.label)), 'lever: found Email');

    const n = filledCount(await PortalEngine.inject([
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Name', answer: 'Ada Lovelace' },
      { label: 'Phone', answer: '0000001111' },
      { label: 'How did you hear about us?', answer: 'LinkedIn' },
      { label: 'Are you authorized to work in the US?', answer: 'Yes' },
    ]));
    check(!!fields.find((f) => /^pronouns$/i.test(f.label)), 'lever: found Pronouns');
    check(
      !!fields.find((f) => /^pronouns$/i.test(f.label) && (f.options || []).includes('She/her')),
      'lever: pronouns options include She/her',
    );
    const pronounsN = filledCount(await PortalEngine.inject([
      { label: 'Pronouns', answer: 'She/her' },
    ]));
    check(pronounsN >= 1, 'lever: pronouns inject filled');
    check(!!doc.querySelector('input[name="pronouns"][value="She/her"]:checked'), 'lever: She/her checked');

    check(n >= 4, `lever: inject filled ${n}`);
    check(doc.querySelector('input[name="email"]')?.value === 'ada@example.com', 'lever: email');
    check(doc.querySelector('input[name="name"]')?.value === 'Ada Lovelace', 'lever: name');
    check(doc.querySelector('input[name="phone"]')?.value === '0000001111', 'lever: phone');
    check(/linkedin/i.test(doc.querySelector('select[name="source"]')?.selectedOptions?.[0]?.text || ''), 'lever: source select');
    check(!!doc.querySelector('input[name="workAuth"][value="yes"]:checked'), 'lever: work-auth radio');
  }

  // ── Workday ──
  {
    console.log('\n== workday ==');
    const dom = load('workday.html', 'https://acme.myworkdayjobs.com/en-US/job/1');
    const doc = dom.window.document;
    const fields = await PortalEngine.scrape();
    check(fields.length > 0, `workday: scraped ${fields.length} fields`);
    check(!!fields.find((f) => /email/i.test(f.label)), 'workday: found Email');
    const jobTitles = fields.filter((f) => /^job title$/i.test(String(f.label || '').replace(/\*$/, '').trim()));
    check(jobTitles.length >= 2, `workday: both Job Title rows scraped (${jobTitles.length})`);
    check(jobTitles[0]?.experienceIndex === 0 && jobTitles[1]?.experienceIndex === 1, 'workday: experienceIndex 0/1');

    const n = filledCount(await PortalEngine.inject([
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Full Name', answer: 'Ada Lovelace' },
      { label: 'Phone Number', answer: '0000002222' },
      { label: 'LinkedIn URL', answer: 'https://linkedin.com/in/ada' },
    ]));
    check(n >= 3, `workday: inject filled ${n}`);
    check(
      (doc.querySelector('#emailAddress--emailAddress') || doc.querySelector('#email'))?.value === 'ada@example.com',
      'workday: email',
    );
    check(doc.querySelector('#fullName')?.value === 'Ada Lovelace', 'workday: name');
    check(doc.querySelector('#phone')?.value === '0000002222', 'workday: phone');
    check(doc.querySelector('#linkedin')?.value.includes('linkedin.com'), 'workday: linkedin');
    const line1 = fields.find((f) => /address line 1/i.test(f.label));
    check(line1 && line1.type !== 'select' && !line1.options, 'workday: Address Line 1 stays a text field');
    const lineFilled = filledCount(await PortalEngine.inject([
      { label: 'Address Line 1', answer: '123 Main Street' },
    ]));
    check(lineFilled >= 1, 'workday: Address Line 1 inject counted');
    check(doc.querySelector('#address-line-1')?.value === '123 Main Street', 'workday: saved street typed into Address Line 1');
  }

  // ── Ashby ──
  {
    console.log('\n== ashby ==');
    const dom = load('ashby.html', 'https://jobs.ashbyhq.com/acme');
    const doc = dom.window.document;

    const fields = await PortalEngine.scrape();
    check(fields.length > 0, `ashby: scraped ${fields.length} fields`);
    check(!!fields.find((f) => /email/i.test(f.label)), 'ashby: found Email');

    const n = filledCount(await PortalEngine.inject([
      { label: 'Email', answer: 'ada@example.com' },
      { label: 'Full Name', answer: 'Ada Lovelace' },
      { label: 'Are you authorized to work in the US?', answer: 'Yes' },
      { label: 'Cover Letter', answer: 'I love building products.' },
    ]));
    check(n >= 3, `ashby: inject filled ${n}`);
    const emailInput = doc.querySelector('[data-field-path="email"] input');
    const nameInput = doc.querySelector('[data-field-path="fullName"] input');
    const cover = doc.querySelector('[data-field-path="coverLetter"] textarea');
    check(emailInput?.value === 'ada@example.com', 'ashby: email');
    check(nameInput?.value === 'Ada Lovelace', 'ashby: name');
    check(cover?.value.includes('building'), 'ashby: cover letter');
  }

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll offline mock portal checks passed');
}

run();
