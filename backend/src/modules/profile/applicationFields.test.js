'use strict';

const {
  normalizePhone,
  draftApplicationProfile,
  mergeApplicationProfile,
  missingApplicationFields,
} = require('./applicationFields');

describe('normalizePhone', () => {
  test('splits E.164-ish US string into dial + national', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toEqual({
      country: 'United States',
      countryCode: '+1',
      nationalNumber: '5551234567',
    });
  });

  test('keeps object shape', () => {
    expect(normalizePhone({
      country: 'United States',
      countryCode: '+1',
      nationalNumber: '5551234567',
    }).nationalNumber).toBe('5551234567');
  });

  test('does not treat +1 alone as a full phone', () => {
    const p = normalizePhone('+1');
    expect(p.nationalNumber.length).toBeLessThan(10);
  });
});

describe('application capture', () => {
  test('draft prefills from resume personalInfo', () => {
    const draft = draftApplicationProfile({
      personalInfo: {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '15551234567',
        location: 'Austin, TX',
        linkedin: 'https://linkedin.com/in/ada',
      },
      workExperience: [{ company: 'Analytical Engines', title: 'Engineer' }],
    });
    expect(draft.city).toBe('Austin');
    expect(draft.phone.countryCode).toBe('+1');
    expect(draft.phone.nationalNumber).toBe('5551234567');
    expect(draft.linkedin).toContain('linkedin.com');
  });

  test('merge marks captureComplete when required fields set', () => {
    const merged = mergeApplicationProfile(
      { personalInfo: { fullName: 'Ada Lovelace', email: 'ada@example.com' } },
      {
        preferredName: 'Ada',
        phone: { country: 'United States', countryCode: '+1', nationalNumber: '5551234567' },
        country: 'United States',
        city: 'Austin',
        location: 'Austin, TX',
        linkedin: 'https://linkedin.com/in/ada',
        workAuthUS: 'Yes',
        sponsorshipRequired: 'No',
        age18Plus: 'Yes',
        hearAbout: 'LinkedIn',
      },
    );
    expect(missingApplicationFields(merged.applicationProfile)).toEqual([]);
    expect(merged.applicationProfile.captureComplete).toBe(true);
    expect(merged.sponsorshipRequired).toBe(false);
    expect(merged.personalInfo.phone).toBe('5551234567');
    expect(merged.applicationProfile.phone).toEqual({
      country: 'United States',
      countryCode: '+1',
      nationalNumber: '5551234567',
    });
  });
});
