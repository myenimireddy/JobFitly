'use strict';

/**
 * LLM-based resume parser.
 * Sends raw resume text to the configured LLM and gets back a fully
 * structured JSON object matching the parsedData schema.
 *
 * Falls back gracefully to null if LLM is unavailable — callers should
 * then fall back to the regex parser.
 */

const LLMFactory = require('../llm/factory');
const { resolveLlmRuntime } = require('./llmSettings');
const { scrubContactStrings, restoreScrubbedContacts } = require('./piiSanitizer');

const PARSE_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Same provider as Analyze / Ask AI (Settings + resolveLlmRuntime).
 * Cloud parse scrubs emails/phones before the prompt.
 */
function createParseLlm() {
  const runtime = resolveLlmRuntime();
  const cloud = runtime.provider === 'groq';
  console.log(`[llmParser] Using ${runtime.provider} for resume parse${cloud ? ' (contacts scrubbed)' : ''}`);
  return { llm: LLMFactory.create(), cloud };
}

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured information from the raw resume text provided.

=== PRIVACY RULES (MANDATORY — follow without exception) ===
- You are a stateless parser. You have NO memory and will NOT retain, store, log, or reproduce any personal information (names, emails, phone numbers, addresses, URLs, or any identifiers) beyond this single response.
- Your ONLY job is to convert the resume text into the JSON structure below. After producing the JSON, discard everything.
- Never echo back raw personal data outside the designated JSON fields.
- If this response is reviewed by a human, personal fields will be redacted — do not reference them in any explanation.

=== OUTPUT RULES ===
Return ONLY a single valid JSON object — no markdown fences, no explanation, no extra text before or after.

Required JSON structure:
{
  "personalInfo": {
    "fullName": "string or null",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedin": "string or null",
    "website": "string or null",
    "summary": "string or null"
  },
  "skills": ["skill1", "skill2"],
  "workExperience": [
    {
      "title": "string",
      "company": "string",
      "startDate": "string or null",
      "endDate": "string or null",
      "location": "string or null",
      "achievements": ["bullet point 1", "bullet point 2"],
      "description": "string or null",
      "skills": ["skill1", "skill2"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "school": "string",
      "field": "string or null",
      "startDate": "string or null",
      "endDate": "string or null",
      "gpa": "string or null"
    }
  ],
  "certifications": ["cert1", "cert2"],
  "projects": [
    {
      "name": "string",
      "description": "string or null",
      "technologies": ["tech1"],
      "url": "string or null"
    }
  ],
  "languages": ["Language (Proficiency)"],
  "achievements": ["achievement1"],
  "volunteer": ["org or description"],
  "publications": ["title or description"],
  "parseConfidence": {
    "score": 0-100,
    "note": "brief explanation of confidence level and any sections that were unclear or missing"
  }
}

=== EXTRACTION RULES ===
- Extract ALL work experience entries, not just recent ones.
- Put school under education[] only. Never use educationalQualifications.
- Current job endDate must be "Present", not null.
- Per-job tech list goes in workExperience[].skills, not environments.
- Skills must be individual items — never comma-separated strings inside one element.
- If a section is absent from the resume, use [] for arrays or null for strings.
- Do not invent, assume, or hallucinate any information not explicitly present in the text.
- parseConfidence.score: 100 = all sections clearly present; deduct points for missing name/email (−20 each), missing work exp (−30), missing skills (−20), unclear dates (−5 each).

=== DATE FORMAT (apply to ALL date fields: startDate, endDate, graduationDate) ===
Normalise every date to one of these formats in order of precision available:
  - Full month + year  →  "MMM YYYY"     e.g. "Jan 2020", "Mar 2023"
  - Year only          →  "YYYY"         e.g. "2019"
  - Still ongoing      →  "Present"
  - Unknown/missing    →  null
Never use slashes (01/2020), never use full dates (January 15 2020), never use ordinals.
Examples of correct normalisation:
  "January 2020"  →  "Jan 2020"
  "2020-01"       →  "Jan 2020"
  "01/2020"       →  "Jan 2020"
  "Current"       →  "Present"
  "Now"           →  "Present"
  "Ongoing"       →  "Present"

=== LOCATION FORMAT (apply to ALL location fields: personalInfo.location, workExperience[].location) ===
Normalise every location to one of these templates in order of available detail:
  - City + State (US)        →  "City, ST"           e.g. "Austin, TX"
  - City + Country (non-US)  →  "City, Country"      e.g. "London, UK"
  - City only                →  "City"               e.g. "Berlin"
  - Remote                   →  "Remote"
  - Remote with base         →  "Remote (City, ST)"  e.g. "Remote (Austin, TX)"
  - Unknown/missing          →  null
Use standard 2-letter US state abbreviations. Use standard country names, not codes.
Never include zip/postal codes, street addresses, or building names.
Examples:
  "New York, New York"     →  "New York, NY"
  "San Francisco, CA USA"  →  "San Francisco, CA"
  "London, England"        →  "London, UK"
  "Hyderabad, Telangana"   →  "Hyderabad, India"
  "Remote - Austin TX"     →  "Remote (Austin, TX)"
  "Work from home"         →  "Remote"`;

/**
 * Parse a resume using the LLM.
 *
 * @param {string} rawText - Plain text extracted from the PDF
 * @returns {Promise<Object|null>} Parsed data object, or null if LLM unavailable/failed
 */
function coerceArrays(parsed) {
  parsed.skills          = toStringArray(parsed.skills);
  parsed.certifications  = toStringArray(parsed.certifications);
  parsed.languages       = toStringArray(parsed.languages);
  parsed.achievements    = toStringArray(parsed.achievements);
  parsed.volunteer       = toStringArray(parsed.volunteer);
  parsed.publications    = toStringArray(parsed.publications);
  parsed.workExperience  = Array.isArray(parsed.workExperience) ? parsed.workExperience : [];
  parsed.education       = Array.isArray(parsed.education) ? parsed.education : [];
  parsed.projects        = Array.isArray(parsed.projects) ? parsed.projects : [];
}

function isCompleteParse(parsed) {
  if (!parsed?.personalInfo?.fullName) return false;
  const jobs = (parsed.workExperience || []).filter((j) => j && (j.title || j.company));
  const titled = jobs.filter((j) => j.title && j.company);
  const bullets = jobs.filter((j) => Array.isArray(j.achievements) && j.achievements.length > 0);
  // One titled job is enough (early-career / single-role resumes).
  if (titled.length < 1) return false;
  if (jobs.length >= 3 && bullets.length === 0) return false;
  return true;
}

async function parseResumeWithLLM(rawText) {
  let llm;
  let cloud = false;
  try {
    ({ llm, cloud } = createParseLlm());
  } catch (err) {
    console.warn(`[llmParser] LLM not available: ${err.message}`);
    return null;
  }

  try {
    async function onePass() {
      // Cloud path: strip emails/phones. Name/school may still appear (needed to fill local profile).
      const textForLlm = cloud
        ? scrubContactStrings(String(rawText).slice(0, 12000))
        : String(rawText).slice(0, 12000);
      const raw = await llm.extract(
        SYSTEM_PROMPT,
        `Parse this entire resume into the JSON structure. Include every job (title AND company), every bullet, school, and skill.\n\n${textForLlm}`,
        PARSE_TIMEOUT_MS,
      );
      const parsed = JSON.parse(
        String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(),
      );
      coerceArrays(parsed);
      normalizeParsedResume(parsed);
      parsed.parseConfidence = parsed.parseConfidence && typeof parsed.parseConfidence.score === 'number'
        ? parsed.parseConfidence
        : computeConfidence(parsed);
      return parsed;
    }

    let parsed = restoreScrubbedContacts(await onePass(), rawText);
    console.log('\n━━━ [llmParser] PARSED OUTPUT ━━━');
    console.log('  personalInfo :', JSON.stringify(parsed.personalInfo));
    console.log(`  skills       : [${parsed.skills.length}]`, parsed.skills.slice(0, 8));
    console.log(`  workExp      : ${parsed.workExperience.length} entries`);
    console.log(`  education    : ${parsed.education.length} entries`);
    console.log(`  parseConfidence: ${parsed.parseConfidence.score}% — ${parsed.parseConfidence.note}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (!isCompleteParse(parsed)) {
      console.warn('[llmParser] First pass incomplete — running full parse again');
      const retry = await onePass();
      if (isCompleteParse(retry) || (retry.workExperience || []).length >= (parsed.workExperience || []).length) {
        parsed = restoreScrubbedContacts(retry, rawText);
      }
    }
    if (!isCompleteParse(parsed)) return null;
    return parsed;
  } catch (err) {
    console.error(`[llmParser] Failed to parse LLM response: ${err.message}`);
    return null;
  }
}

/**
 * Fix common model drift so we always store the designed shape.
 */
function normalizeParsedResume(parsed) {
  if ((!parsed.education || parsed.education.length === 0) && parsed.educationalQualifications) {
    const e = parsed.educationalQualifications;
    parsed.education = Array.isArray(e)
      ? e
      : [{
          degree: e.degree || null,
          school: e.university || e.school || null,
          field: e.field || null,
          startDate: e.startDate || null,
          endDate: e.endDate || e.graduationDate || null,
          gpa: e.gpa || null,
        }];
  }
  delete parsed.educationalQualifications;

  parsed.education = (parsed.education || []).map((e) => ({
    degree: e.degree || null,
    school: e.school || e.university || null,
    field: e.field || null,
    startDate: e.startDate || null,
    endDate: e.endDate || e.graduationDate || null,
    gpa: e.gpa || null,
  }));

  parsed.workExperience = (parsed.workExperience || []).map((w, i) => {
    const skills = toStringArray(w.skills && w.skills.length ? w.skills : w.environments);
    let endDate = w.endDate;
    if (!endDate && i === 0 && w.startDate) endDate = 'Present';
    return {
      title: w.title || null,
      company: w.company || null,
      startDate: w.startDate || null,
      endDate: endDate || null,
      location: w.location || null,
      achievements: toStringArray(w.achievements),
      description: w.description || null,
      skills,
    };
  });
}

function toStringArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

/**
 * Compute a confidence score locally if the LLM didn't return one.
 * Mirrors the scoring rules in the system prompt.
 */
function computeConfidence(parsed) {
  let score = 100;
  const missing = [];

  const pi = parsed.personalInfo || {};
  if (!pi.fullName)  { score -= 20; missing.push('name'); }
  if (!pi.email)     { score -= 20; missing.push('email'); }
  if (!parsed.workExperience?.length) { score -= 30; missing.push('work experience'); }
  if (!parsed.skills?.length)         { score -= 20; missing.push('skills'); }
  if (!parsed.education?.length)      { score -= 5;  missing.push('education'); }

  // Deduct for work entries missing dates
  (parsed.workExperience || []).forEach(w => {
    if (!w.startDate) score -= 3;
  });

  score = Math.max(0, Math.min(100, score));

  const note = missing.length
    ? `Missing or unclear: ${missing.join(', ')}`
    : 'All key sections found';

  return { score, note };
}

module.exports = {
  parseResumeWithLLM,
  computeConfidence,
  normalizeParsedResume,
  isCompleteParse,
  createParseLlm,
};
