'use strict';

const mockParseJobWithLLM = jest.fn();
const mockPrisma = {
  job: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

jest.mock('../../lib/prisma', () => ({ prisma: mockPrisma }));
jest.mock('../../lib/llmJobParser', () => ({ parseJobWithLLM: mockParseJobWithLLM }));

const jobService = require('./service');

describe('job analysis feature', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.job.create.mockImplementation(async ({ data }) => ({
      id: 'job-1',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...data,
    }));
  });

  test('persists structured AI analysis and returns parsed JSON', async () => {
    mockParseJobWithLLM.mockResolvedValue({
      title: 'Platform Engineer',
      company: 'Example Corp',
      requiredSkills: ['Node.js', 'AWS'],
      preferredSkills: ['PostgreSQL'],
      blockers: [],
      pros: ['Remote'],
    });

    const job = await jobService.extractAndParse(
      'https://jobs.example.test/platform-engineer',
      'Platform Engineer at Example Corp. Node.js and AWS required.',
    );

    expect(job.parsedData.title).toBe('Platform Engineer');
    expect(job.parsedData._parseMethod).toBe('llm');
    expect(mockPrisma.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        url: 'https://jobs.example.test/platform-engineer',
        parsedData: expect.stringContaining('Platform Engineer'),
      }),
    });
  });

  test('falls back safely when AI analysis is unavailable', async () => {
    mockParseJobWithLLM.mockResolvedValue(null);

    const job = await jobService.extractAndParse(
      'https://jobs.example.test/backend-engineer',
      'Backend Engineer\nExample Corp\nFull-time role requiring 5 years of experience.',
    );

    expect(job.parsedData._parseMethod).toBe('regex');
    expect(job.parsedData).toEqual(expect.objectContaining({
      blockers: expect.any(Array),
      pros: expect.any(Array),
    }));
    expect(mockPrisma.job.create).toHaveBeenCalledTimes(1);
  });
});
