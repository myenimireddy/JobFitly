'use strict';

const mockPdfParse = jest.fn();
const mockParseResumeWithLLM = jest.fn();
const mockPrisma = {
  profile: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('pdf-parse', () => mockPdfParse);
jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/llmResumeParser', () => {
  const actual = jest.requireActual('../../lib/llmResumeParser');
  return { ...actual, parseResumeWithLLM: mockParseResumeWithLLM };
});

const profileService = require('./service');

const resumeText = [
  'Alex Chen',
  'alex@example.com',
  'Software Engineer at Acme',
  'Built reliable Node.js services.',
].join('\n');

function completeParsedResume() {
  return {
    personalInfo: {
      fullName: 'Alex Chen',
      email: 'alex@example.com',
      phone: '5551234567',
      location: 'Austin, TX',
    },
    workExperience: [{
      title: 'Software Engineer',
      company: 'Acme',
      startDate: '2022-01',
      endDate: 'Present',
      achievements: ['Built reliable Node.js services'],
    }],
    skills: ['Node.js', 'PostgreSQL'],
    education: [],
  };
}

describe('profile upload feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPdfParse.mockResolvedValue({ text: resumeText });
    mockPrisma.profile.findMany.mockResolvedValue([]);
  });

  test('extracts, parses, seeds application details, and persists a new profile', async () => {
    mockParseResumeWithLLM.mockResolvedValue(completeParsedResume());
    mockPrisma.profile.create.mockImplementation(async ({ data }) => ({
      id: 'profile-new',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...data,
    }));

    const profile = await profileService.uploadAndParse(Buffer.from('fictional-pdf'));

    expect(mockPdfParse).toHaveBeenCalledWith(expect.any(Buffer));
    expect(mockParseResumeWithLLM).toHaveBeenCalledWith(resumeText);
    expect(mockPrisma.profile.create).toHaveBeenCalledTimes(1);
    expect(profile.id).toBe('profile-new');
    expect(profile.parsedData._parseAudit.parseMethod).toBe('llm');
    expect(profile.parsedData.personalInfo.fullName).toBe('Alex Chen');
    expect(profile.parsedData.applicationProfile.preferredName).toBe('Alex');
    expect(profile.parsedData.applicationProfile.phone.nationalNumber).toBe('5551234567');
  });

  test('reuses an existing complete upload instead of parsing or duplicating it', async () => {
    const parsedData = {
      ...completeParsedResume(),
      _parseAudit: { parseMethod: 'llm', needsReview: false },
    };
    mockPrisma.profile.findMany.mockResolvedValue([{
      id: 'profile-existing',
      rawText: resumeText,
      parsedData: JSON.stringify(parsedData),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }]);

    const profile = await profileService.uploadAndParse(Buffer.from('same-fictional-pdf'));

    expect(profile.id).toBe('profile-existing');
    expect(mockParseResumeWithLLM).not.toHaveBeenCalled();
    expect(mockPrisma.profile.create).not.toHaveBeenCalled();
  });

  test('rejects an incomplete parse without saving a broken profile', async () => {
    mockParseResumeWithLLM.mockResolvedValue({
      personalInfo: { fullName: 'Alex Chen' },
      workExperience: [],
    });

    await expect(profileService.uploadAndParse(Buffer.from('incomplete-fictional-pdf')))
      .rejects.toThrow('Resume parse did not finish');
    expect(mockPrisma.profile.create).not.toHaveBeenCalled();
  });
});
