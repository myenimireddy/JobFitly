'use strict';

const { prisma } = require('../../lib/prisma');
const { generateTailoredResume, generateCoverLetter } = require('../../lib/llmDocumentGenerator');

class DocumentsService {
  /**
   * Generate tailored resume bullets + cover letter for a profile+job pair
   * @param {string} profileId
   * @param {string} jobId
   * @param {'resume'|'cover_letter'|'both'} type
   * @returns {Promise<Object>}
   */
  async generate(profileId, jobId, type = 'both') {
    const [profileRow, jobRow] = await Promise.all([
      prisma.profile.findUnique({ where: { id: profileId } }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);

    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
    if (!jobRow)     throw Object.assign(new Error('Job not found'),     { statusCode: 404 });

    const profile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData) : profileRow.parsedData;
    const job = typeof jobRow.parsedData === 'string'
      ? JSON.parse(jobRow.parsedData) : jobRow.parsedData;

    const result = { profileId, jobId, type };

    if (type === 'resume' || type === 'both') {
      const resume = await generateTailoredResume(profile, job);
      result.resume = resume || { error: 'LLM unavailable — start Ollama to generate tailored resume bullets' };
    }

    if (type === 'cover_letter' || type === 'both') {
      const cover = await generateCoverLetter(profile, job);
      result.coverLetter = cover || { error: 'LLM unavailable — start Ollama to generate cover letter' };
    }

    return result;
  }
}

module.exports = new DocumentsService();
