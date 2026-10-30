'use strict';

const {
  canonicalKey,
  lookupStored,
  resolveFromProfile,
  planField,
  applyLlmAnswer,
  parseLlmList,
  isFactOnlyField,
} = require('./logic');

const thinProfile = {
  personalInfo: { fullName: 'Ada Lovelace', email: 'ada@example.com' },
  workExperience: [],
};

describe('canonicalKey', () => {
  test('treats work-auth questions as the same', () => {
    expect(canonicalKey('Authorized to work in the US?')).toBe(
      canonicalKey('Are you eligible to work in the United States?'),
    );
  });
});

describe('lookupStored', () => {
  test('reuses a saved answer when the label is paraphrased', () => {
    const extra = { [canonicalKey('Authorized to work in the US?')]: 'Yes' };
    expect(lookupStored(extra, 'Are you eligible to work in the United States?')).toBe('Yes');
  });
});

describe('resolveFromProfile — no guessing', () => {
  test('fills email from the profile', () => {
    expect(resolveFromProfile('Email', thinProfile)).toBe('ada@example.com');
  });

  test('does not invent visa, salary, start date, or on-site', () => {
    expect(resolveFromProfile('Do you require visa sponsorship?', thinProfile)).toBeNull();
    expect(resolveFromProfile('Salary expectations', thinProfile)).toBeNull();
    expect(resolveFromProfile('Start date', thinProfile)).toBeNull();
    expect(resolveFromProfile('Are you able to work onsite?', thinProfile)).toBeNull();
  });

  test('uses sponsorshipRequired only when it is set', () => {
    const p = { ...thinProfile, sponsorshipRequired: false };
    expect(resolveFromProfile('Do you require visa sponsorship?', p)).toBe('No');
    expect(resolveFromProfile('Are you authorized to work in the US?', p)).toBe('Yes');
  });
});

describe('planField buckets', () => {
  test('email is known from profile', () => {
    const plan = planField({ label: 'Email' }, thinProfile, {});
    expect(plan.bucket).toBe('known');
    expect(plan.source).toBe('profile');
    expect(plan.needsLLM).toBeFalsy();
  });

  test('saved answer is known/stored', () => {
    const extra = { [canonicalKey('Authorized to work')]: 'Yes' };
    const plan = planField({ label: 'Are you eligible to work in the United States?' }, thinProfile, extra);
    expect(plan.bucket).toBe('known');
    expect(plan.source).toBe('stored');
    expect(plan.answer).toBe('Yes');
  });

  test('salary stays missing and is not sent to the LLM', () => {
    expect(isFactOnlyField('Desired salary')).toBe(true);
    const plan = planField({ label: 'Desired salary' }, thinProfile, {});
    expect(plan.bucket).toBe('missing');
    expect(plan.needsLLM).toBeFalsy();
  });

  test('open text without a story needs the LLM', () => {
    const plan = planField({ label: 'Why do you want to work here?' }, thinProfile, {});
    expect(plan.needsLLM).toBe(true);
  });
});

describe('applyLlmAnswer', () => {
  test('LLM drafts are ask, never known', () => {
    const plan = planField({ label: 'Why this company?' }, thinProfile, {});
    const next = applyLlmAnswer(plan, { answer: 'I like the mission.' });
    expect(next.bucket).toBe('ask');
    expect(next.source).toBe('llm');
  });

  test('numeric or empty LLM answers become missing', () => {
    const plan = planField({ label: 'Why this company?' }, thinProfile, {});
    expect(applyLlmAnswer(plan, { answer: 3 }).bucket).toBe('missing');
    expect(applyLlmAnswer(plan, { answer: '5' }).bucket).toBe('missing');
    expect(applyLlmAnswer(plan, { answer: null }).bucket).toBe('missing');
  });
});

describe('parseLlmList', () => {
  test('parses raw JSON and markdown fences', () => {
    expect(parseLlmList('[{"label":"Email","answer":"a"}]')).toHaveLength(1);
    expect(parseLlmList('```json\n[{"label":"Email","answer":"a"}]\n```')[0].label).toBe('Email');
  });

  test('rejects a non-array', () => {
    expect(() => parseLlmList('{"label":"Email"}')).toThrow(/array/);
  });
});
