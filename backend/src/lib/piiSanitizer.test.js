'use strict';

const {
  restoreScrubbedContacts,
  isContactPlaceholder,
  scrubContactStrings,
} = require('./piiSanitizer');

describe('piiSanitizer contact restore', () => {
  test('detects cloud placeholders', () => {
    expect(isContactPlaceholder('[CANDIDATE_EMAIL]')).toBe(true);
    expect(isContactPlaceholder('[CANDIDATE_PHONE]')).toBe(true);
    expect(isContactPlaceholder('ada@example.com')).toBe(false);
  });

  test('restores email and phone from the original resume text', () => {
    const parsed = restoreScrubbedContacts(
      {
        personalInfo: {
          fullName: 'Ada Lovelace',
          email: '[CANDIDATE_EMAIL]',
          phone: '[CANDIDATE_PHONE]',
        },
      },
      'Ada Lovelace\nada@example.com\n+1 (555) 123-4567\nEngineer',
    );
    expect(parsed.personalInfo.email).toBe('ada@example.com');
    expect(String(parsed.personalInfo.phone)).toMatch(/555/);
  });

  test('leaves a real email alone', () => {
    const parsed = restoreScrubbedContacts(
      { personalInfo: { email: 'keep@example.com' } },
      'other@example.com',
    );
    expect(parsed.personalInfo.email).toBe('keep@example.com');
  });

  test('scrubContactStrings replaces contacts before a cloud parse', () => {
    const scrubbed = scrubContactStrings('Reach me at ada@example.com or 555-123-4567');
    expect(scrubbed).toContain('[CANDIDATE_EMAIL]');
    expect(scrubbed).toContain('[CANDIDATE_PHONE]');
    expect(scrubbed).not.toContain('ada@example.com');
  });
});
