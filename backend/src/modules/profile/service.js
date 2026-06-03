const pdfParse = require('pdf-parse');
const { prisma } = require('../../lib/prisma');
const { parseResumeWithLLM } = require('../../lib/llmResumeParser');
const { parseResumeWithRegex } = require('../../lib/fallback');

/**
 * Serialize a profile row from DB (parsedData is stored as JSON string)
 */
function serializeProfile(profile) {
  return {
    ...profile,
    parsedData: typeof profile.parsedData === 'string'
      ? JSON.parse(profile.parsedData)
      : profile.parsedData,
  };
}

/**
 * Profile service for resume upload and retrieval
 */
class ProfileService {
  /**
   * Upload and parse a PDF resume
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @returns {Promise<Object>} Parsed profile with id, rawText, parsedData
   */
  async uploadAndParse(pdfBuffer) {
    const rawText = await this.extractTextFromPDF(pdfBuffer);

    console.log('\n━━━ [profile] PDF TEXT EXTRACTED ━━━');
    console.log(`  chars : ${rawText.length}`);
    console.log(`  lines : ${rawText.split('\n').filter(l => l.trim()).length}`);
    console.log('  first 300 chars:');
    console.log(' ', rawText.slice(0, 300).replace(/\n/g, '\n  '));

    // ── Try LLM parser first, fall back to regex if LLM is unavailable ─────────
    let parsedData = await parseResumeWithLLM(rawText);
    let parseMethod = 'llm';

    if (!parsedData) {
      console.warn('[profile] LLM unavailable — falling back to regex parser');
      parsedData = parseResumeWithRegex(rawText);
      parseMethod = 'regex';
    }

    // Attach parse metadata for frontend to surface
    parsedData._parseAudit = {
      parseMethod,
      needsReview: parseMethod === 'regex',
      message: parseMethod === 'llm'
        ? 'Resume parsed by AI — please review and correct any mistakes'
        : 'AI unavailable — parsed with basic regex, accuracy may be lower. Please review carefully.',
    };

    const profile = await prisma.profile.create({
      data: {
        rawText,
        parsedData: JSON.stringify(parsedData),
      },
    });

    console.log(`[profile] Saved to DB → id: ${profile.id}`);
    return serializeProfile(profile);
  }

  /**
   * Get profile by ID
   * @param {string} id - Profile CUID
   * @returns {Promise<Object|null>} Profile object or null if not found
   */
  async getById(id) {
    const profile = await prisma.profile.findUnique({ where: { id } });
    if (!profile) return null;
    return serializeProfile(profile);
  }

  /**
   * Update the parsedData for a profile (user edits)
   * @param {string} id - Profile CUID
   * @param {Object} parsedData - Full updated parsedData object
   * @returns {Promise<Object>} Updated profile
   */
  async updateParsedData(id, parsedData) {
    const profile = await prisma.profile.update({
      where: { id },
      data: { parsedData: JSON.stringify(parsedData) },
    });
    console.log(`[profile] Updated parsedData → id: ${id}`);
    return serializeProfile(profile);
  }

  /**
   * Delete a profile and all related matches
   * @param {string} id - Profile CUID
   * @returns {Promise<void>}
   */
  async deleteProfile(id) {
    await prisma.match.deleteMany({ where: { profileId: id } });
    await prisma.profile.delete({ where: { id } });
    console.log(`[profile] Deleted profile → id: ${id}`);
  }

  /**
   * Extract text from PDF buffer using pdf-parse
   * @param {Buffer} pdfBuffer
   * @returns {Promise<string>}
   * @private
   */
  async extractTextFromPDF(pdfBuffer) {
    const data = await pdfParse(pdfBuffer);
    return data.text || '';
  }
}

module.exports = new ProfileService();
