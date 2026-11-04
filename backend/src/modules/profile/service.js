const pdfParse = require('pdf-parse');
const { prisma } = require('../../lib/prisma');
const { parseResumeWithLLM, normalizeParsedResume, computeConfidence, isCompleteParse } = require('../../lib/llmResumeParser');
const { restoreScrubbedContacts } = require('../../lib/piiSanitizer');
const safeLogger = require('../../lib/safeLogger');
const {
  draftApplicationProfile,
  getCaptureQuestionnaire,
  mergeApplicationProfile,
} = require('./applicationFields');

/**
 * Serialize a profile row from DB (parsedData is stored as JSON string)
 */
function foldText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function emailsIn(text) {
  return [...new Set((foldText(text).toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) || []))];
}

function parsedOf(row) {
  const data = typeof row.parsedData === 'string' ? JSON.parse(row.parsedData) : row.parsedData;
  return data || {};
}

function isLlmParse(row) {
  return parsedOf(row)._parseAudit?.parseMethod === 'llm';
}

function sameResume(rawText, row) {
  const a = foldText(rawText);
  const b = foldText(row.rawText);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.slice(0, 100) === b.slice(0, 100) && Math.abs(a.length - b.length) < 800) return true;
  const emails = emailsIn(rawText);
  const bLower = b.toLowerCase();
  return emails.length > 0
    && emails.every((email) => bLower.includes(email))
    && Math.abs(a.length - b.length) < 2000;
}

function findReusableProfile(rawText, rows) {
  const matches = rows.filter((row) => sameResume(rawText, row));
  return matches.find(isLlmParse) || matches[0] || null;
}

function serializeProfile(profile) {
  const parsedData = typeof profile.parsedData === 'string'
    ? JSON.parse(profile.parsedData)
    : profile.parsedData;
  if (parsedData) restoreScrubbedContacts(parsedData, profile.rawText);
  return { ...profile, parsedData };
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

    const recent = await prisma.profile.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const existing = findReusableProfile(rawText, recent);
    if (existing && isCompleteParse(parsedOf(existing))) {
      const parsed = parsedOf(existing);
      const before = JSON.stringify(parsed);
      normalizeParsedResume(parsed);
      if (JSON.stringify(parsed) !== before) {
        parsed.parseConfidence = computeConfidence(parsed);
        await prisma.profile.update({
          where: { id: existing.id },
          data: { parsedData: JSON.stringify(parsed) },
        });
        existing.parsedData = JSON.stringify(parsed);
        console.log(`[profile] Reusing complete profile ${existing.id} — skipping Ollama`);
      } else {
        console.log(`[profile] Reusing complete profile ${existing.id} — skipping Ollama`);
      }
      return serializeProfile(existing);
    }
    if (existing) {
      console.log(`[profile] ${existing.id} is incomplete — re-parsing full resume`);
    }

    console.log('\n━━━ [profile] PDF TEXT EXTRACTED ━━━');
    console.log(`  chars : ${rawText.length}`);
    console.log(`  lines : ${rawText.split('\n').filter(l => l.trim()).length}`);
    safeLogger.content('profile PDF text sample', rawText.slice(0, 300));

    const parsedData = await parseResumeWithLLM(rawText);

    if (!parsedData || !isCompleteParse(parsedData)) {
      const again = recent.find((row) => sameResume(rawText, row) && isCompleteParse(parsedOf(row)));
      if (again) {
        console.warn(`[profile] Parse incomplete — keeping earlier complete profile ${again.id}`);
        return serializeProfile(again);
      }
      throw new Error('Resume parse did not finish. Keep Ollama running and upload again — wait up to 10 minutes.');
    }

    // Attach parse metadata for frontend to surface
    parsedData._parseAudit = {
      parseMethod: 'llm',
      needsReview: false,
      message: 'Resume parsed by AI — please review and correct any mistakes',
    };
    // Seed applicationProfile draft so post-parse capture has resume defaults
    // (phone as {country, countryCode, nationalNumber}).
    parsedData.applicationProfile = draftApplicationProfile(parsedData);

    if (existing) {
      const profile = await prisma.profile.update({
        where: { id: existing.id },
        data: { rawText, parsedData: JSON.stringify(parsedData) },
      });
      console.log(`[profile] Updated ${profile.id} with full parse`);
      return serializeProfile(profile);
    }

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

  async getLatest() {
    const rows = await prisma.profile.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (rows.length === 0) return null;
    const complete = rows.find((row) => isCompleteParse(parsedOf(row)));
    return serializeProfile(complete || rows[0]);
  }

  /**
   * Lightweight list for Side Panel / web profile switcher (no rawText).
   * @returns {Promise<Array<{ id: string, name: string, createdAt: Date, captureComplete: boolean }>>}
   */
  async listSummaries() {
    const rows = await prisma.profile.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => {
      const data = parsedOf(row);
      const name =
        data?.personalInfo?.fullName
        || data?.applicationProfile?.displayName
        || 'Untitled profile';
      return {
        id: row.id,
        name: String(name).trim() || 'Untitled profile',
        createdAt: row.createdAt,
        captureComplete: !!data?.applicationProfile?.captureComplete,
      };
    });
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
   * Questionnaire for ATS fields not reliably on the resume.
   */
  async getApplicationCapture(id) {
    const profile = await this.getById(id);
    if (!profile) return null;
    return getCaptureQuestionnaire(profile.parsedData || {});
  }

  /**
   * Save consolidated applicationProfile answers after resume parse.
   */
  async saveApplicationProfile(id, applicationUpdates) {
    const profile = await this.getById(id);
    if (!profile) {
      const err = new Error('Profile not found');
      err.statusCode = 404;
      throw err;
    }
    const merged = mergeApplicationProfile(profile.parsedData || {}, applicationUpdates || {});
    return this.updateParsedData(id, merged);
  }

  /**
   * Create / upsert a named test profile (e.g. "Test Customer 1") with full capture.
   */
  async upsertNamedProfile({ displayName, rawText, parsedData }) {
    const recent = await prisma.profile.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const existing = recent.find((row) => {
      const data = parsedOf(row);
      return data.applicationProfile?.displayName === displayName;
    });

    const withCapture = mergeApplicationProfile(parsedData, {
      ...(parsedData.applicationProfile || {}),
      displayName,
      captureComplete: true,
      capturedAt: new Date().toISOString(),
    });

    if (existing) {
      return this.updateParsedData(existing.id, withCapture);
    }
    const profile = await prisma.profile.create({
      data: {
        rawText: rawText || `Synthetic profile: ${displayName}`,
        parsedData: JSON.stringify(withCapture),
      },
    });
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
   * Extract text from PDF buffer (pdf-parse).
   * Unsupported / corrupt PDFs surface a clear message — no alternate parser.
   * @param {Buffer} pdfBuffer
   * @returns {Promise<string>}
   * @private
   */
  async extractTextFromPDF(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer);
      const text = (data.text || '').trim();
      if (!text) {
        throw new Error(
          'This PDF has no readable text (it may be a scan or image-only). Export a text PDF from Word/Google Docs and try again.',
        );
      }
      return text;
    } catch (err) {
      if (err?.message && /no readable text|scan or image/i.test(err.message)) throw err;
      throw new Error(
        'This PDF is not supported or could not be read. Please upload a standard text resume PDF (export from Word or Google Docs).',
      );
    }
  }
}

module.exports = new ProfileService();
