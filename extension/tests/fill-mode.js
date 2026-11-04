import assert from 'node:assert/strict';
import { FILL_MODES, requiredStatusOf, selectFieldsForMode } from '../src/lib/fillMode.js';

const fields = [
  { label: 'Email', requiredStatus: 'required', requiredEvidence: ['native-required'] },
  { label: 'GitHub URL', requiredStatus: 'optional', requiredEvidence: ['lever-rendered-optional'] },
  { label: 'Custom question', requiredStatus: 'unknown' },
];

const requiredOnly = selectFieldsForMode(fields, FILL_MODES.REQUIRED_ONLY);
assert.deepEqual(requiredOnly.fields.map((field) => field.label), ['Email', 'Custom question']);
assert.equal(requiredOnly.stats.optionalSkipped, 1);
assert.equal(requiredOnly.stats.unknown, 1);

const all = selectFieldsForMode(fields, FILL_MODES.ALL);
assert.equal(all.fields.length, 3);
assert.equal(all.stats.optionalSkipped, 0);

assert.equal(requiredStatusOf({ required: true }), 'required');
assert.equal(requiredStatusOf({ required: false }), 'unknown');
console.log('fill mode tests passed');
