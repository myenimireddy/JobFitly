'use strict';

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
assert(!fs.existsSync(path.join(root, 'extension/src/popup/AnalyzeSection.jsx')), 'AnalyzeSection removed from extension');
assert(!fs.existsSync(path.join(root, 'extension/src/popup/DocumentsSection.jsx')), 'DocumentsSection removed from extension');

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
assert(!extText.includes('/api/match'), 'extension does not call /api/match');
assert(!extText.includes('/api/documents'), 'extension does not call /api/documents');

const autofillUi = read('extension/src/popup/AutofillSection.jsx');
const generateFn = autofillUi.split('const handleAutofill')[1].split('const handleInject')[0];
assert(!generateFn.includes('injectAutofill'), 'generate does not auto-inject');
assert(autofillUi.includes("action: 'injectAutofill'"), 'inject still happens on Fill Form Now');
assert(autofillUi.includes("AUTO_INJECT_ON_GENERATE = false"), 'AUTO_INJECT_ON_GENERATE is false');

const saved = read('frontend/src/pages/SavedAnswers.jsx');
assert(!saved.includes('cmplb50cy'), 'no hardcoded Saved Answers profile id');

process.exit(failed ? 1 : 0);
