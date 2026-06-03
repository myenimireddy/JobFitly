'use strict';

/**
 * LLM-based job description parser.
 * Returns null if LLM unavailable — callers fall back to jobAnalyzer regex.
 */

const LLMFactory = require('../llm/factory');

const SYSTEM_PROMPT = `You are an expert job description parser. Extract structured information from the raw job posting text.

=== PRIVACY RULES ===
- Do NOT store, log, or retain any information after this request.
- Use the text only to produce the JSON output below.

=== OUTPUT RULES ===
Return ONLY a single valid JSON object — no markdown fences, no explanation.

Required JSON structure:
{
  "title": "string or null",
  "company": "string or null",
  "location": "string or null",
  "locationType": "remote | hybrid | onsite | null",
  "employmentType": "full-time | part-time | contract | internship | null",
  "salary": {
    "min": number or null,
    "max": number or null,
    "currency": "USD | GBP | EUR | etc or null",
    "period": "year | month | hour | null"
  },
  "yearsOfExperience": { "min": number or null, "max": number or null },
  "requiredSkills": ["skill1", "skill2"],
  "preferredSkills": ["skill1", "skill2"],
  "requiredEducation": "string or null",
  "sponsorship": {
    "offered": true | false | null,
    "note": "exact phrase from JD or null"
  },
  "clearanceRequired": true | false,
  "clearanceLevel": "string or null",
  "remotePercent": number or null,
  "travelRequired": true | false | null,
  "responsibilities": ["bullet 1", "bullet 2"],
  "requirements": ["bullet 1", "bullet 2"],
  "benefits": ["benefit 1"],
  "teamSize": "string or null",
  "industry": "string or null"
}

=== EXTRACTION RULES ===
- requiredSkills: only explicitly listed as required/must-have
- preferredSkills: listed as nice-to-have, preferred, or bonus
- sponsorship.offered: true = company sponsors visas, false = company does NOT sponsor, null = not mentioned
- If salary range is given as "$120k-$150k", set min:120000 max:150000 period:"year"
- Skills must be individual items, not comma-separated strings
- Do not invent information not present in the text`;

async function parseJobWithLLM(rawText) {
  let llm;
  try {
    llm = LLMFactory.create();
  } catch (err) {
    console.warn(`[llmJobParser] LLM not available: ${err.message}`);
    return null;
  }

  const userPrompt = `Parse the following job description into the required JSON structure:\n\n${rawText.slice(0, 8000)}`;

  try {
    const raw = await llm.extract(SYSTEM_PROMPT, userPrompt);
    const clean = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(clean);

    parsed.requiredSkills  = toStringArray(parsed.requiredSkills);
    parsed.preferredSkills = toStringArray(parsed.preferredSkills);
    parsed.responsibilities = toStringArray(parsed.responsibilities);
    parsed.requirements    = toStringArray(parsed.requirements);
    parsed.benefits        = toStringArray(parsed.benefits);

    console.log('\n━━━ [llmJobParser] PARSED ━━━');
    console.log(`  title        : ${parsed.title}`);
    console.log(`  company      : ${parsed.company}`);
    console.log(`  location     : ${parsed.location} (${parsed.locationType})`);
    console.log(`  sponsorship  : offered=${parsed.sponsorship?.offered} — "${parsed.sponsorship?.note}"`);
    console.log(`  clearance    : ${parsed.clearanceRequired} (${parsed.clearanceLevel})`);
    console.log(`  reqSkills    : [${parsed.requiredSkills.length}]`, parsed.requiredSkills.slice(0, 8));
    console.log(`  prefSkills   : [${parsed.preferredSkills.length}]`);
    console.log(`  salary       : ${JSON.stringify(parsed.salary)}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return parsed;
  } catch (err) {
    console.error(`[llmJobParser] Failed: ${err.message}`);
    return null;
  }
}

function toStringArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

module.exports = { parseJobWithLLM };
