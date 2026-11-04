/**
 * Edge cases for Side Panel session rules:
 * job fit follows the job-tab URL, and Application details does not reopen on tab change.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import assert from 'node:assert/strict';
import {
  jobKey,
  navigateJobFit,
  storeJobFitResult,
  clearJobFitUrl,
  emptyJobFitView,
} from '../src/lib/jobFitSession.js';
import { nextShowCapture } from '../src/lib/captureSession.js';
import { profileSummaryLabel } from '../src/lib/profileSummary.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const REDDIT = 'https://job-boards.greenhouse.io/reddit/jobs/8194576';
const LEVER = 'https://jobs.lever.co/leverdemo/58db3f8e-b108-47d1-9e6e-87a1712497cd/apply';

function redditView() {
  return {
    ...emptyJobFitView(),
    status: 'done',
    jobTitle: 'Frontend Engineer, Ads',
    company: 'Reddit',
    pageUrl: REDDIT,
    score: 62,
    matched: ['Typescript'],
    missing: ['Design Patterns'],
  };
}

function test(name, fn) {
  try {
    fn();
    console.log('  ok', name);
  } catch (err) {
    console.error('  FAIL', name);
    throw err;
  }
}

console.log('panel edges');

test('job key ignores hash and trailing slash, keeps query', () => {
  assert.equal(jobKey(`${REDDIT}/#apply`), jobKey(REDDIT));
  assert.equal(jobKey(`${REDDIT}?utm=1`), jobKey(`${REDDIT}/?utm=1#x`));
  assert.notEqual(jobKey(`${REDDIT}?gh_jid=1`), jobKey(`${REDDIT}?gh_jid=2`));
  assert.equal(jobKey(''), '');
  assert.equal(jobKey('not a url#frag'), 'not a url');
});

test('a different job URL does not show the previous score', () => {
  const cache = new Map([[jobKey(REDDIT), redditView()]]);
  const moved = navigateJobFit({
    cache,
    jobUrl: LEVER,
    previousKey: jobKey(REDDIT),
    profileId: 'p1',
    previousProfileId: 'p1',
  });
  assert.equal(moved.changed, true);
  assert.equal(moved.view.status, 'idle');
  assert.equal(moved.view.score, null);
  assert.equal(moved.view.jobTitle, '');
  assert.equal(moved.cache.get(jobKey(REDDIT)).score, 62);
});

test('returning to the same job URL restores that score', () => {
  const cache = new Map([[jobKey(REDDIT), redditView()]]);
  const back = navigateJobFit({
    cache,
    jobUrl: `${REDDIT}#form`,
    previousKey: jobKey(LEVER),
    profileId: 'p1',
    previousProfileId: 'p1',
  });
  assert.equal(back.view.score, 62);
  assert.equal(back.view.company, 'Reddit');
});

test('same URL does not reset an in-flight analyze', () => {
  const same = navigateJobFit({
    cache: new Map(),
    jobUrl: REDDIT,
    previousKey: jobKey(REDDIT),
    profileId: 'p1',
    previousProfileId: 'p1',
  });
  assert.equal(same.changed, false);
  assert.equal(same.view, null);
});

test('empty URL does not fall back to a cached job', () => {
  const cache = new Map([[jobKey(REDDIT), redditView()]]);
  const blank = navigateJobFit({
    cache,
    jobUrl: '',
    previousKey: jobKey(REDDIT),
    profileId: 'p1',
    previousProfileId: 'p1',
  });
  assert.equal(blank.view.status, 'idle');
  assert.equal(blank.view.score, null);
});

test('a late result for the previous URL is stored but not shown', () => {
  const stored = storeJobFitResult({
    cache: new Map(),
    activeKey: jobKey(LEVER),
    scoredUrl: REDDIT,
    view: redditView(),
  });
  assert.equal(stored.show, false);
  assert.equal(stored.cache.get(jobKey(REDDIT)).score, 62);
  const shown = storeJobFitResult({
    cache: stored.cache,
    activeKey: jobKey(REDDIT),
    scoredUrl: `${REDDIT}/`,
    view: redditView(),
  });
  assert.equal(shown.show, true);
  assert.equal(shown.view.score, 62);
});

test('clear removes only the open job', () => {
  const cache = new Map([
    [jobKey(REDDIT), redditView()],
    [jobKey(LEVER), { ...redditView(), company: 'Lever', score: 40, pageUrl: LEVER }],
  ]);
  const cleared = clearJobFitUrl({ cache, activeKey: jobKey(REDDIT) });
  assert.equal(cleared.view.score, null);
  assert.equal(cleared.cache.has(jobKey(REDDIT)), false);
  assert.equal(cleared.cache.get(jobKey(LEVER)).score, 40);
});

test('switching profile drops every cached score', () => {
  const cache = new Map([[jobKey(REDDIT), redditView()]]);
  const swapped = navigateJobFit({
    cache,
    jobUrl: REDDIT,
    previousKey: jobKey(REDDIT),
    profileId: 'p2',
    previousProfileId: 'p1',
  });
  assert.equal(swapped.view.status, 'idle');
  assert.equal(swapped.cache.size, 0);
});

test('application details stays as the user left it when the job tab changes', () => {
  assert.equal(nextShowCapture('tab-changed', { showCapture: false }), false);
  assert.equal(nextShowCapture('tab-changed', { showCapture: true, captureComplete: false }), true);
  assert.equal(nextShowCapture('saved', { showCapture: true, captureComplete: false }), false);
  assert.equal(nextShowCapture('later', { showCapture: true }), false);
  assert.equal(nextShowCapture('cleared', { showCapture: true }), false);
  assert.equal(nextShowCapture('edit', { showCapture: false, captureComplete: true }), true);
  assert.equal(nextShowCapture('profile-loaded', { captureComplete: false }), true);
  assert.equal(nextShowCapture('profile-loaded', { captureComplete: true }), false);
  assert.equal(nextShowCapture('resume-uploaded', { captureComplete: true }), true);
});

test('saved profile labels disambiguate duplicate names', () => {
  const first = profileSummaryLabel({ id: 'cm123456789', name: 'Alex Chen', captureComplete: true });
  const second = profileSummaryLabel({ id: 'cm987654321', name: 'Alex Chen', captureComplete: false });
  assert.equal(first, 'Alex Chen · cm123456 · ready');
  assert.equal(second, 'Alex Chen · cm987654 · details needed');
  assert.notEqual(first, second);
});

test('panel source keeps those rules wired', () => {
  const panel = read('src/sidepanel/Panel.jsx');
  const match = read('src/popup/MatchSection.jsx');
  const profileUi = read('src/popup/ProfileSection.jsx');
  const captureUi = read('src/popup/ApplicationProfileCapture.jsx');
  const autofillUi = read('src/popup/AutofillSection.jsx');
  const loadOnce = panel.match(/Load once per panel session[\s\S]{0,900}\}, \[\]\);/);
  assert.ok(loadOnce, 'profile load effect must run once per panel session');
  assert.equal(/\[refreshActiveTab/.test(loadOnce[0]), false);
  assert.equal(panel.includes("nextShowCapture('saved')"), true);
  assert.equal(panel.includes("nextShowCapture('tab-changed')"), false);
  assert.equal(match.includes('navigateJobFit'), true);
  assert.equal(match.includes('jobUrl={tabInfo.url}') || panel.includes('jobUrl={tabInfo.url}'), true);
  assert.equal(profileUi.includes('Switch profile'), true);
  assert.equal(profileUi.includes('data-testid="profile-selector"'), true);
  assert.equal(panel.includes('onSelectProfile={handleSelectProfile}'), true);
  assert.equal(panel.includes('applyProfile(data, { syncPage: false })'), true);
  assert.equal(captureUi.includes("title: 'Preferences'"), false);
  assert.equal(captureUi.includes('How did you hear'), false);
  assert.equal(autofillUi.includes('data-testid="fill-mode-required-only"'), true);
  assert.equal(autofillUi.includes('data-testid="fill-mode-all"'), true);
  assert.equal(autofillUi.includes('selectFieldsForMode(scraped.fields, fillMode)'), true);
  assert.equal(autofillUi.includes('freshFields'), true);
  assert.equal(autofillUi.includes('setProgressTotal(queue.length)'), true);
});

console.log('panel edges passed');
