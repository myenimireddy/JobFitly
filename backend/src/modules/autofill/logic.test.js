'use strict';

const {
  canonicalKey,
  storageKeyForAnswer,
  classifyIntent,
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

describe('classifyIntent', () => {
  test('maps different wordings to the same intent', () => {
    expect(classifyIntent('Country*').id).toBe('country');
    expect(classifyIntent('Location (City)*').id).toBe('city');
    expect(classifyIntent('Where do you plan on working from (for payroll tax purposes)?').id).toBe('city');
    expect(classifyIntent('Please provide the name of your current (or most recent) company*').id).toBe('current_company');
    expect(classifyIntent('Why do you want to work here?').id).toBe('open');
    expect(classifyIntent('What gender identity do you most closely identify with?').id).toBe('gender');
  });

  test('does not map bare "Job title" to current_title', () => {
    expect(classifyIntent('Job title').id).toBe('open');
    expect(classifyIntent('Desired job title').id).toBe('open');
    expect(classifyIntent('Current job title').id).toBe('current_title');
  });
});

describe('bay area / prior employer facts', () => {
  test('infers bay area from city; never invents prior employer', () => {
    const { buildFacts } = require('./logic');
    const dallas = buildFacts({
      ...thinProfile,
      personalInfo: { ...thinProfile.personalInfo, location: 'Austin, TX' },
      applicationProfile: { city: 'Austin' },
    });
    expect(dallas.inBayArea).toBe('No');
    expect(dallas.previouslyEmployed).toBeNull();
    expect(planField({ label: 'Have you been employed by Adobe in the past?' }, {
      ...thinProfile,
      applicationProfile: { city: 'Austin' },
    }, {}).answer).toBeNull();
  });

  test('fills prior employer only when explicitly stored', () => {
    const p = {
      ...thinProfile,
      applicationProfile: { previouslyEmployed: 'No', city: 'Austin' },
    };
    expect(planField({ label: 'Have you been employed by Adobe in the past?' }, p, {}).answer).toBe('No');
  });
});

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

  test('does not let dial-code country poison address Country', () => {
    const extra = { phone_country: 'United States +1' };
    expect(lookupStored(extra, 'Country*')).toBeNull();
    expect(lookupStored(extra, 'Country*', ['United States +1', 'Canada +1'])).toBe('United States +1');
  });

  test('ignores legacy dial codes stored under country for address Country', () => {
    const extra = { country: 'United States +1' };
    expect(lookupStored(extra, 'Country of residence')).toBeNull();
  });
});

describe('storageKeyForAnswer', () => {
  test('routes dial Country* answers to phone_country', () => {
    expect(storageKeyForAnswer('Country*', 'United States +1')).toBe('phone_country');
    expect(storageKeyForAnswer('Country*', 'United States', ['United States +1', 'Canada +1']))
      .toBe('phone_country');
  });

  test('keeps plain address country on country', () => {
    expect(storageKeyForAnswer('Country*', 'United States')).toBe('country');
  });
});

describe('resolveFromProfile — no guessing', () => {
  test('fills email from the profile', () => {
    expect(resolveFromProfile('Email', thinProfile)).toBe('ada@example.com');
  });

  test('strips location from current company and nationalizes US phone', () => {
    const p = {
      ...thinProfile,
      personalInfo: { ...thinProfile.personalInfo, phone: '1 (555) 123-4567' },
      workExperience: [{ company: 'Acme Corp', title: 'Engineer' }],
    };
    expect(resolveFromProfile('Phone', p)).toBe('5551234567');
    expect(resolveFromProfile('current company', p)).toBe('Acme Corp');
  });

  test('phone object separates dial code from national number', () => {
    const { buildFacts } = require('./logic');
    const p = {
      ...thinProfile,
      applicationProfile: {
        phone: { country: 'United States', countryCode: '+1', nationalNumber: '5551234567' },
        country: 'United States',
        city: 'Austin',
        hearAbout: 'LinkedIn',
        workAuthUS: 'Yes',
        sponsorshipRequired: 'Yes',
        ethnicity: 'South Asian',
        phoneDeviceType: 'Mobile',
      },
    };
    const facts = buildFacts(p);
    expect(facts.phone).toBe('5551234567');
    expect(facts.phoneCountryLabel).toMatch(/United States/);
    expect(facts.phoneCountryLabel).toMatch(/\+1/);
    expect(resolveFromProfile('Phone Number', p)).toBe('5551234567');
    expect(resolveFromProfile('Country Phone Code', p)).toMatch(/United States/);
    expect(resolveFromProfile('How did you hear about this job?', p)).toBe('LinkedIn');
  });

  test('does not guess East Asian when South Asian is also an option', () => {
    const { snapToOption } = require('./logic');
    const opts = ['East Asian', 'South Asian', 'White', "I don't wish to answer"];
    expect(snapToOption('asian', opts)).toBe('asian');
    expect(snapToOption('South Asian', opts)).toBe('South Asian');
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

  test('country and city come from job location when personal location is empty', () => {
    const p = {
      personalInfo: {},
      workExperience: [{ title: 'Eng', company: 'Acme Corp', location: 'Austin, TX' }],
    };
    expect(resolveFromProfile('Country', p)).toBe('United States');
    expect(resolveFromProfile('Location (City)*', p)).toBe('Austin');
    expect(resolveFromProfile('Please provide the name of your current (or most recent) company*', p)).toBe('Acme Corp');
  });

  test('dropdown choices come from the page, not a hardcoded list', () => {
    const fromPage = ['Man', 'Woman', 'Decline to self-identify'];
    const plan = planField(
      { label: 'What gender identity do you most closely identify with?', options: fromPage },
      thinProfile,
      {},
    );
    expect(plan.options).toEqual(fromPage);
    expect(planField({ label: 'What gender identity do you most closely identify with?' }, thinProfile, {}).options).toBeNull();
  });

  test('EEO and I-agree are never sent to the LLM', () => {
    const plan = planField({ label: 'What gender identity do you most closely identify with?' }, thinProfile, {});
    expect(plan.needsLLM).toBeFalsy();
    expect(plan.bucket).toBe('missing');
    expect(planField({ label: 'By selecting "I agree," I understand that the information' }, thinProfile, {}).needsLLM).toBeFalsy();
  });

  test('veteran answers do not overwrite gender, and reuse across wordings', () => {
    expect(classifyIntent('Are you a veteran/have you served in the military?').id).toBe('veteran');
    expect(classifyIntent('What gender identity do you most closely identify with?').id).toBe('gender');
    expect(canonicalKey('Are you a veteran?')).toBe(canonicalKey('Have you served in the military?'));
    const extra = { [canonicalKey('Are you a veteran?')]: 'No' };
    const plan = planField({ label: 'Are you a veteran/have you served in the military?', options: ['Yes', 'No'] }, thinProfile, extra);
    expect(plan.answer).toBe('No');
    expect(plan.source).toBe('stored');
  });

  test('snaps a typed answer onto a dropdown option', () => {
    const { snapToOption } = require('./logic');
    expect(snapToOption('no', ['Yes', 'No', 'Prefer not to say'])).toBe('No');
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

  test('wraps a single answer object', () => {
    expect(parseLlmList('{"label":"Why this job?","answer":"Because","missing":false}')).toEqual([
      { label: 'Why this job?', answer: 'Because', missing: false },
    ]);
  });

  test('rejects unrelated JSON', () => {
    expect(() => parseLlmList('{"foo":1}')).toThrow(/array/);
  });

  test('skips phone extension so it is not filled with the phone number', () => {
    const plan = planField({ label: 'Phone Extension' }, thinProfile, {});
    expect(plan.intent).toBe('phone_extension');
    expect(plan.skip).toBe(true);
    expect(plan.answer).toBeNull();
  });

  test('Country with dial-code options maps to phone_country', () => {
    const plan = planField({
      label: 'Country*',
      type: 'select',
      options: ['United States +1', 'Canada +1', 'India +91'],
    }, thinProfile, {});
    expect(plan.intent).toBe('phone_country');
  });
});
