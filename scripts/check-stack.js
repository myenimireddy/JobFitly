'use strict';

/**
 * Fast structural guard for the monorepo.
 * Fails if dead entry files return, renamed UI pieces reappear under old names,
 * or Makefile / hook wiring drifts. Run via `make test-fast` / pre-commit.
 * See scripts/README.md.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function assert(cond, msg) {
  if (cond) console.log('  ok ', msg);
  else {
    console.error('  FAIL', msg);
    failed += 1;
  }
}

console.log('Stack checks');

assert(!fs.existsSync(path.join(root, 'backend/src/app.js')), 'dead backend/src/app.js is gone');
assert(!fs.existsSync(path.join(root, 'extension/src/popup.js')), 'dead extension/src/popup.js is gone');
assert(!fs.existsSync(path.join(root, 'extension/src/parsers/index.js')), 'unused parsers/ folder is gone');
assert(!fs.existsSync(path.join(root, 'extension/src/popup/AnalyzeSection.jsx')), 'old AnalyzeSection name stays gone (use MatchSection)');
assert(!fs.existsSync(path.join(root, 'extension/src/popup/DocumentsSection.jsx')), 'DocumentsSection removed from extension');
assert(fs.existsSync(path.join(root, 'extension/src/popup/MatchSection.jsx')), 'MatchSection exists for apply/skip scoring');

const makefile = read('Makefile');
assert(!/docker-up/.test(makefile), 'Makefile does not advertise docker-up');
assert(!/PostgreSQL/.test(makefile), 'Makefile does not advertise Postgres');

let injectMentions = 0;
let generateInjections = 0;
for (const file of walk(path.join(root, 'backend/src'))) {
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('generateInjections')) generateInjections += 1;
  if (text.includes('/autofill/inject')) injectMentions += 1;
}
assert(generateInjections === 0, 'no generateInjections in backend');
assert(injectMentions === 0, 'no /autofill/inject route');

const extFiles = walk(path.join(root, 'extension/src')).filter((f) => /\.(js|jsx)$/.test(f));
const extText = extFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
assert(!extText.includes('/api/documents'), 'extension does not call /api/documents');

const autofillUi = read('extension/src/popup/AutofillSection.jsx');
// HITL contract: Fill Form orchestrates; inject only via injectOne; LLM drafts pause.
assert(autofillUi.includes('handleFillForm'), 'Fill Form entrypoint exists');
assert(autofillUi.includes('async function injectOne'), 'inject is isolated in injectOne');
assert(autofillUi.includes("action: 'injectAutofill'"), 'inject still happens via injectAutofill');
assert(autofillUi.includes('needsReview'), 'ask/llm fields pause for human review');
assert(autofillUi.includes('startOver'), 'Start over control exists');
assert(autofillUi.includes('isPageValueComplete'), 'already-filled fields can be skipped');
assert(!autofillUi.includes('/api/match'), 'Fill path does not call /api/match');

const matchUi = read('extension/src/popup/MatchSection.jsx');
assert(matchUi.includes('/job/extract'), 'MatchSection extracts job from page');
assert(matchUi.includes('/match'), 'MatchSection calls match API');
assert(matchUi.includes('navigateJobFit'), 'MatchSection scopes scores by job URL');
assert(!matchUi.includes('injectAutofill'), 'MatchSection never injects into the form');

const panel = read('extension/src/sidepanel/Panel.jsx');
assert(panel.includes('AutofillSection'), 'Side Panel hosts AutofillSection');
assert(panel.includes('MatchSection'), 'Side Panel hosts MatchSection');
assert(panel.includes('activeTabId'), 'Side Panel passes active tab id');
assert(panel.includes('jobUrl={tabInfo.url}'), 'Side Panel binds Job fit to the job tab URL');
assert(panel.includes('nextShowCapture'), 'Side Panel uses capture session rules');
assert(panel.includes("nextShowCapture('saved')"), 'Save closes Application details');

assert(fs.existsSync(path.join(root, 'extension/src/lib/jobFitSession.js')), 'jobFitSession helper exists');
assert(fs.existsSync(path.join(root, 'extension/src/lib/captureSession.js')), 'captureSession helper exists');
assert(fs.existsSync(path.join(root, 'extension/tests/panel-edges.js')), 'panel edge tests exist');

const profileUi = read('extension/src/popup/ProfileSection.jsx');
assert(!profileUi.includes('Switch profile'), 'profile switcher stays out of the Side Panel');
const captureUi = read('extension/src/popup/ApplicationProfileCapture.jsx');
assert(!captureUi.includes("title: 'Preferences'"), 'Preferences group removed from capture');
assert(!captureUi.includes('How did you hear'), 'how-you-heard is not a saved capture field');

const portalEngine = read('extension/src/portalEngine.js');
assert(portalEngine.includes('isWorkdayStreetLine'), 'Workday Address Line stays a text control');

const saved = read('frontend/src/pages/SavedAnswers.jsx');
assert(!saved.includes('cmplb50cy'), 'no hardcoded Saved Answers profile id');

process.exit(failed ? 1 : 0);
