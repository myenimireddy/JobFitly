'use strict';

const { normalizeParsedResume, computeConfidence, isCompleteParse } = require('./llmResumeParser');

describe('normalizeParsedResume', () => {
  test('moves educationalQualifications into education[]', () => {
    const parsed = {
      education: [],
      workExperience: [],
      educationalQualifications: {
        university: 'University of Cincinnati, Ohio, USA',
        degree: "Master's in engineering",
        gpa: '3.7/4',
      },
    };
    normalizeParsedResume(parsed);
    expect(parsed.educationalQualifications).toBeUndefined();
    expect(parsed.education).toHaveLength(1);
    expect(parsed.education[0].school).toBe('University of Cincinnati, Ohio, USA');
    expect(parsed.education[0].degree).toBe("Master's in engineering");
    expect(computeConfidence(parsed).note).not.toMatch(/education/);
  });

  test('maps environments to skills and current job endDate to Present', () => {
    const parsed = {
      education: [],
      workExperience: [{
        title: 'Engineer',
        company: 'Acme Corp',
        startDate: 'Sep 2025',
        endDate: null,
        environments: ['React', 'TypeScript'],
      }],
    };
    normalizeParsedResume(parsed);
    expect(parsed.workExperience[0].endDate).toBe('Present');
    expect(parsed.workExperience[0].skills).toEqual(['React', 'TypeScript']);
    expect(parsed.workExperience[0].environments).toBeUndefined();
  });
});

describe('isCompleteParse', () => {
  test('rejects jobs with no titles or bullets', () => {
    expect(isCompleteParse({
      personalInfo: { fullName: 'Ada' },
      workExperience: [
        { title: null, company: 'JPMorgan Chase, Columbus, Ohio.', achievements: [] },
        { title: null, company: 'GoDaddy, Austin, TX.', achievements: [] },
        { title: null, company: null, achievements: [] },
      ],
    })).toBe(false);
  });

  test('accepts titled jobs with bullets', () => {
    expect(isCompleteParse({
      personalInfo: { fullName: 'Ada' },
      workExperience: [
        { title: 'Engineer', company: 'Acme Corp', achievements: ['Shipped X'] },
        { title: 'Developer', company: 'GoDaddy', achievements: ['Built Y'] },
      ],
    })).toBe(true);
  });

  test('accepts a single titled job (early-career resume)', () => {
    expect(isCompleteParse({
      personalInfo: { fullName: 'Ada' },
      workExperience: [
        { title: 'Engineer', company: 'Acme Corp', achievements: ['Shipped X'] },
      ],
    })).toBe(true);
  });
});
