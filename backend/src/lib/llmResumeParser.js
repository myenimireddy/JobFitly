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
async function parseResumeWithLLM(rawText) {
  let llm;
  try {
    llm = LLMFactory.create();
  } catch (err) {
    console.warn(`[llmParser] LLM not available: ${err.message}`);
    return null;
  }

  const userPrompt = `Parse the following resume text into the required JSON structure:\n\n${rawText.slice(0, 12000)}`;

  try {
    const raw = await llm.extract(SYSTEM_PROMPT, userPrompt);

    // Strip markdown code fences if present
    const clean = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(clean);

    // Normalise arrays to ensure correct types
    parsed.skills          = toStringArray(parsed.skills);
    parsed.certifications  = toStringArray(parsed.certifications);
    parsed.languages       = toStringArray(parsed.languages);
    parsed.achievements    = toStringArray(parsed.achievements);
    parsed.volunteer       = toStringArray(parsed.volunteer);
    parsed.publications    = toStringArray(parsed.publications);
    parsed.workExperience  = Array.isArray(parsed.workExperience) ? parsed.workExperience : [];
    parsed.education       = Array.isArray(parsed.education) ? parsed.education : [];
    parsed.projects        = Array.isArray(parsed.projects) ? parsed.projects : [];

    // If LLM didn't return parseConfidence, compute a basic one ourselves
    if (!parsed.parseConfidence || typeof parsed.parseConfidence.score !== 'number') {
      parsed.parseConfidence = computeConfidence(parsed);
    }

    console.log('\n━━━ [llmParser] PARSED OUTPUT ━━━');
    console.log('  personalInfo :', JSON.stringify(parsed.personalInfo));
    console.log(`  skills       : [${parsed.skills.length}]`, parsed.skills.slice(0, 8));
    console.log(`  workExp      : ${parsed.workExperience.length} entries`);
    console.log(`  education    : ${parsed.education.length} entries`);
    console.log(`  projects     : ${parsed.projects.length} entries`);
    console.log(`  certifications: ${parsed.certifications.length}`);
    console.log(`  parseConfidence: ${parsed.parseConfidence.score}% — ${parsed.parseConfidence.note}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return parsed;
  } catch (err) {
    console.error(`[llmParser] Failed to parse LLM response: ${err.message}`);
    return null;
  }
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

module.exports = { parseResumeWithLLM, computeConfidence };
