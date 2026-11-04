'use strict';

const mockProfiles = new Map();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    profile: {
      findUnique: jest.fn(async ({ where }) => mockProfiles.get(where.id) || null),
      findFirst: jest.fn(async () => [...mockProfiles.values()]
        .sort((a, b) => b.createdAt - a.createdAt)[0] || null),
      update: jest.fn(async ({ where, data }) => {
        const row = mockProfiles.get(where.id);
        if (!row) throw Object.assign(new Error('Profile not found'), { code: 'P2025' });
        const updated = { ...row, ...data, updatedAt: new Date() };
        mockProfiles.set(where.id, updated);
        return updated;
      }),
    },
  },
}));

jest.mock('../../llm/factory', () => ({
  create: jest.fn(() => ({
    extract: jest.fn(async () => { throw new Error('LLM should not be used for stored answers'); }),
  })),
}));

const service = require('./service');

function addProfile(id, parsedData = {}, createdAt = new Date()) {
  mockProfiles.set(id, {
    id,
    rawText: 'Candidate Example\ncandidate@example.com',
    parsedData: JSON.stringify(parsedData),
    createdAt,
    updatedAt: createdAt,
  });
}

describe('AutofillService saved-answer loop', () => {
  beforeEach(() => {
    mockProfiles.clear();
    jest.clearAllMocks();
  });

  test('saves a confirmed answer and reuses it for equivalent wording', async () => {
    addProfile('profile-a', { personalInfo: { fullName: 'Candidate Example' } });

    await service.saveMissingAnswers('profile-a', [{
      label: 'Are you authorized to work in the US?',
      answer: 'Yes',
    }]);

    const generated = await service.generateAnswers('profile-a', [{
      label: 'Are you eligible to work in the United States?',
      type: 'radio',
      options: ['Yes', 'No'],
    }], {});

    expect(generated.answers).toEqual(expect.arrayContaining([
      expect.objectContaining({ answer: 'Yes', source: 'stored', bucket: 'known' }),
    ]));
  });

  test('current resolves the newest profile and returns its id', async () => {
    addProfile('older', { extraAnswers: { sponsorship: 'Yes' } }, new Date('2026-01-01'));
    addProfile('newer', { extraAnswers: { sponsorship: 'No' } }, new Date('2026-02-01'));

    const result = await service.getSavedAnswers('current');

    expect(result.profileId).toBe('newer');
    expect(result.answers).toEqual([
      expect.objectContaining({ label: 'sponsorship', answer: 'No' }),
    ]);
  });

  test('deletes one canonical answer without affecting another profile', async () => {
    addProfile('profile-a', { extraAnswers: { sponsorship: 'No', country: 'Canada' } });
    addProfile('profile-b', { extraAnswers: { sponsorship: 'Yes' } });

    await service.deleteSavedAnswer('profile-a', 'Sponsorship*');

    const first = await service.getSavedAnswers('profile-a');
    const second = await service.getSavedAnswers('profile-b');
    expect(first.answers).toEqual([
      expect.objectContaining({ label: 'country', answer: 'Canada' }),
    ]);
    expect(second.answers).toEqual([
      expect.objectContaining({ label: 'sponsorship', answer: 'Yes' }),
    ]);
  });

  test('clear removes only saved answers and preserves parsed resume data', async () => {
    addProfile('profile-a', {
      skills: ['JavaScript'],
      extraAnswers: { sponsorship: 'No' },
    });

    await service.clearSavedAnswers('profile-a');

    const stored = JSON.parse(mockProfiles.get('profile-a').parsedData);
    expect(stored.skills).toEqual(['JavaScript']);
    expect(stored).not.toHaveProperty('extraAnswers');
  });

  test('required-only skips confirmed optional fields but retains unknown fields', async () => {
    addProfile('profile-a', {
      personalInfo: { fullName: 'Candidate Example', email: 'candidate@example.com' },
    });

    const generated = await service.generateAnswers('profile-a', [
      { label: 'Email', requiredStatus: 'required', required: true },
      { label: 'GitHub URL', requiredStatus: 'optional', required: false },
      { label: 'Custom employer question', requiredStatus: 'unknown', required: false },
    ], {}, 'required-only');

    expect(generated.answers.map((answer) => answer.label)).toEqual([
      'Email',
      'Custom employer question',
    ]);
    expect(generated.requirementStats).toEqual(expect.objectContaining({
      optionalSkipped: 1,
      unknownReviewed: 1,
    }));
  });

  test('all mode retains optional fields', async () => {
    addProfile('profile-a', { personalInfo: { fullName: 'Candidate Example' } });

    const generated = await service.generateAnswers('profile-a', [
      { label: 'GitHub URL', requiredStatus: 'optional', required: false },
    ], {}, 'all');

    expect(generated.answers).toEqual([
      expect.objectContaining({ label: 'GitHub URL', requiredStatus: 'optional' }),
    ]);
    expect(generated.requirementStats.optionalSkipped).toBe(0);
  });
});
