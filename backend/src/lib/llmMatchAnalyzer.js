'use strict';

/**
 * LLM-based profile vs job match analyzer.
 * Returns a rich result with score, blockers, pros, skill gaps, and recommendations.
 * Falls back to null if LLM unavailable — callers use the regex engine.
 */

const LLMFactory = require('../llm/factory');
const { sanitizeProfile } = require('./piiSanitizer');
const safeLogger = require('./safeLogger');

const SYSTEM_PROMPT = `You are an expert technical recruiter and career advisor analyzing a candidate's fit for a job.

=== PRIVACY RULES ===
- Do NOT store, log, or retain any information after this request.
- Use the data only to produce the JSON output below.

=== OUTPUT RULES ===
Return ONLY a single valid JSON object — no markdown fences, no explanation.

Required JSON structure:
{
  "score": 0-100,
  "scoreReasoning": "1-2 sentence explanation of the score",
  "matchingSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "partialSkills": [{ "jobRequires": "string", "candidateHas": "string", "note": "string" }],
  "blockers": [
    {
      "type": "visa_sponsorship | clearance | experience_gap | education | relocation | employment_gap | skill_critical | other",
      "severity": "high | medium | low",
      "message": "Clear explanation of why this is a blocker",
      "detail": "exact text from job/profile that triggered this"
    }
  ],
  "pros": [
    {
      "type": "skill_match | experience_level | education | location | culture | growth | other",
      "message": "Why this is a positive signal"
    }
  ],
  "experienceAssessment": {
    "required": number or null,
    "candidate": number or null,
    "verdict": "exceeds | meets | below | unknown"
  },
  "recommendations": ["actionable suggestion 1", "actionable suggestion 2"],
  "coverLetterTips": ["tip 1", "tip 2"]
}

=== SCORING RULES ===
Start at 50. Apply adjustments:
- Each required skill matched: +3 (max +30)
- Each required skill missing: -4 (max -25)
- Experience meets/exceeds: +10
- Experience below required: -15
- Sponsorship blocker (job doesn't sponsor, candidate needs it): -40 (hard blocker)
- Clearance required but candidate has none: -35
- Education requirement not met: -10
- Strong culture/values match signals: +5
- Preferred skills matched: +2 each (max +10)
Clamp final score to 0-100.

=== BLOCKER DETECTION RULES ===
ALWAYS check and explicitly flag these if applicable:
1. VISA SPONSORSHIP: If job says "no sponsorship" / "must be authorized to work" AND profile indicates needs sponsorship → severity HIGH
2. SECURITY CLEARANCE: If job requires clearance and profile doesn't mention it → severity HIGH  
3. EXPERIENCE GAP: If job requires X years and candidate has significantly less → severity MEDIUM/HIGH
4. EDUCATION: ONLY if the job explicitly requires a specific degree/major (e.g. "BS in CS required")
   AND the candidate's listed education clearly does not meet it → severity MEDIUM.
   Do NOT flag education as a blocker when:
   - the profile simply has empty/missing education (parse gap — not a hard no), OR
   - the job only says "Bachelor's preferred" / nice-to-have, OR
   - the job has no education requirement.
5. LOCATION: If job is onsite in a specific city and candidate is in a different location with no relocation mention → severity LOW/MEDIUM

=== IMPORTANT ===
- Be honest. If the candidate is under-qualified, reflect it in the score.
- Blockers must be specific — reference actual text from the job or profile.
- Do not invent skills or experience the candidate doesn't have.
- Recommendations should be actionable and specific to THIS job.
- ALWAYS fill missingSkills with concrete tech/tool gaps from the job's required/preferred
  skills (e.g. React, GraphQL, ads platforms). Visa, clearance, and education go in blockers —
  they must NOT leave missingSkills empty when the JD lists hard skills the candidate lacks.
- ALWAYS fill matchingSkills with skills the candidate clearly has that the job wants.
- Empty profile.education is NOT a blocker — at most mention it in recommendations as "add education to profile".
- If the Education section lists a school or degree (e.g. University of Cincinnati, Master's),
  the candidate HAS education. Never claim education is missing/unspecified in that case.`;

async function analyzeMatchWithLLM(profile, job) {
  let llm;
  try {
    llm = LLMFactory.create();
  } catch (err) {
    console.warn(`[llmMatchAnalyzer] LLM not available: ${err.message}`);
    return null;
  }

  // Never send contact PII to the LLM (esp. Groq). Skills / roles / education stay.
  const { sanitized } = sanitizeProfile(profile);
  const profileSummary = buildProfileSummary(sanitized);
  const jobSummary = buildJobSummary(job);

  const userPrompt = `Analyze this candidate's fit for the job below.

=== CANDIDATE PROFILE ===
${profileSummary}

=== JOB DESCRIPTION ===
${jobSummary}

Produce the match analysis JSON.`;

  try {
    const raw = await llm.extract(SYSTEM_PROMPT, userPrompt);
    const clean = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const result = JSON.parse(clean);

    // Accept both matchingSkills and older matchedSkills key from prompts.
    result.matchingSkills = toStringArray(result.matchingSkills || result.matchedSkills);
    result.missingSkills  = toStringArray(result.missingSkills || result.missing);
    result.recommendations = toStringArray(result.recommendations);
    result.coverLetterTips = toStringArray(result.coverLetterTips);
    result.pros     = Array.isArray(result.pros)     ? result.pros     : [];
    result.blockers = Array.isArray(result.blockers) ? result.blockers : [];
    result.partialSkills = Array.isArray(result.partialSkills)
      ? result.partialSkills
      : (Array.isArray(result.partialMatches) ? result.partialMatches : []);

    // Drop false education blockers when profile already has school/degree (or empty ≠ fail).
    const hasEducation = Array.isArray(profile.education) && profile.education.some((e) =>
      e && (e.school || e.degree || e.field),
    );
    result.blockers = result.blockers.filter((b) => !isFalseEducationBlocker(b, hasEducation));

    result.score = Math.max(0, Math.min(100, Number(result.score) || 0));

    console.log('\n━━━ [llmMatchAnalyzer] RESULT ━━━');
    console.log(`  score      : ${result.score}`);
    console.log(`  reasoning  : ${result.scoreReasoning ? 'present' : 'missing'}`);
    console.log(`  matched    : [${result.matchingSkills.length}]`);
    console.log(`  missing    : [${result.missingSkills.length}]`);
    console.log(`  blockers   : [${result.blockers.length}]`);
    safeLogger.content('match blockers', result.blockers);
    console.log(`  pros       : [${result.pros.length}]`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return result;
  } catch (err) {
    console.error(`[llmMatchAnalyzer] Failed: ${err.message}`);
    return null;
  }
}

/**
 * Drop education blockers that are parse noise only:
 * - profile already lists school/degree AND model said education was "not specified" / missing from profile
 * Do NOT drop real gaps like "does not have the required CS degree".
 */
function isFalseEducationBlocker(blocker, hasEducation) {
  if (!blocker || typeof blocker !== 'object') return false;
  const type = String(blocker.type || '').toLowerCase();
  const msg = String(blocker.message || blocker.detail || '').toLowerCase();
  const aboutEdu = type === 'education' || /education|degree|bachelor|master|phd|university|college/.test(msg);
  if (!aboutEdu) return false;

  // Only "missing from profile / not listed" noise — not "does not have required X".
  const claimsMissingFromProfile = /not specified|not listed|missing from (the )?profile|no education (listed|on|in)|education (section )?is (not|missing)|unspecified|absent from (the )?profile/.test(msg);
  if (hasEducation && claimsMissingFromProfile) return true;

  // Soft: empty profile education ≠ hard degree failure unless job requirement language is clear
  if (!hasEducation && claimsMissingFromProfile && !/requires .{0,60}(degree|bachelor|master|phd|bs\b|ba\b|ms\b|mba)/i.test(msg)) {
    return true;
  }
  return false;
}

function formatEducationLine(e) {
  if (!e || typeof e !== 'object') return null;
  const degree = String(e.degree || '').trim();
  const field = String(e.field || '').trim();
  const school = String(e.school || '').trim();
  const when = [e.startDate, e.endDate].filter(Boolean).join(' – ') || 'dates not listed';
  const gpa = e.gpa ? `; GPA ${e.gpa}` : '';
  if (!degree && !school) return null;
  // Explicit so models don't miss Masters when endDate is null.
  const parts = [];
  if (degree) parts.push(degree);
  if (field && !degree.toLowerCase().includes(field.toLowerCase())) parts.push(`field: ${field}`);
  if (school) parts.push(`school: ${school}`);
  parts.push(`(${when}${gpa})`);
  return `- ${parts.join(' | ')}`;
}

function buildProfileSummary(profile) {
  // Expect a sanitized profile (placeholders for name/email/phone/location).
  const pi = profile.personalInfo || {};
  const exp = (profile.workExperience || []).map(w =>
    `- ${w.title} at ${w.company} (${w.startDate || '?'} – ${w.endDate || 'Present'})`
  ).join('\n');
  const eduLines = (profile.education || []).map(formatEducationLine).filter(Boolean);
  const eduBlock = eduLines.length
    ? `${eduLines.join('\n')}\n(Education IS present on this profile — do not say it is missing.)`
    : 'None listed';

  const totalYears = estimateYearsOfExperience(profile.workExperience || []);

  return [
    // Location is placeholder when sanitized — enough for remote/onsite fit, not street address.
    `Location: ${pi.location || 'Not specified'}`,
    `Summary: ${pi.summary || profile.summary || 'Not provided'}`,
    `Total experience: ~${totalYears} years`,
    `Skills: ${(profile.skills || []).join(', ') || 'None listed'}`,
    `Work Experience:\n${exp || 'None listed'}`,
    `Education:\n${eduBlock}`,
    `Certifications: ${(profile.certifications || []).join(', ') || 'None'}`,
    `Sponsorship needed: ${profile.sponsorshipRequired ? 'Yes' : profile.sponsorshipRequired === false ? 'No' : 'Not specified'}`,
    `Security clearance: ${profile.clearance || 'None mentioned'}`,
  ].join('\n');
}

function buildJobSummary(job) {
  const lines = [];
  if (job.title)        lines.push(`Title: ${job.title}`);
  if (job.company)      lines.push(`Company: ${job.company}`);
  if (job.location)     lines.push(`Location: ${job.location} (${job.locationType || 'not specified'})`);
  if (job.employmentType) lines.push(`Type: ${job.employmentType}`);
  if (job.yearsOfExperience?.min != null) {
    lines.push(`Experience required: ${job.yearsOfExperience.min}${job.yearsOfExperience.max ? `–${job.yearsOfExperience.max}` : '+'} years`);
  }
  if (job.sponsorship?.offered === false) lines.push(`Sponsorship: NOT offered — "${job.sponsorship.note}"`);
  else if (job.sponsorship?.offered === true) lines.push(`Sponsorship: Offered — "${job.sponsorship.note}"`);
  else lines.push('Sponsorship: Not mentioned');
  if (job.clearanceRequired) lines.push(`Security clearance required: YES (${job.clearanceLevel || 'level not specified'})`);
  if (job.requiredEducation) lines.push(`Education required: ${job.requiredEducation}`);
  if (job.requiredSkills?.length) lines.push(`Required skills: ${job.requiredSkills.join(', ')}`);
  if (job.preferredSkills?.length) lines.push(`Preferred skills: ${job.preferredSkills.join(', ')}`);
  if (job.salary?.min) lines.push(`Salary: ${job.salary.currency || '$'}${job.salary.min}–${job.salary.max || '?'} per ${job.salary.period || 'year'}`);
  if (job.responsibilities?.length) lines.push(`Responsibilities:\n${job.responsibilities.slice(0, 8).map(r => `- ${r}`).join('\n')}`);
  if (job.requirements?.length) lines.push(`Requirements:\n${job.requirements.slice(0, 8).map(r => `- ${r}`).join('\n')}`);
  return lines.join('\n');
}

function estimateYearsOfExperience(workExperience) {
  let total = 0;
  const currentYear = new Date().getFullYear();
  for (const w of workExperience) {
    const start = parseYear(w.startDate);
    const end = w.endDate === 'Present' || !w.endDate ? currentYear : parseYear(w.endDate);
    if (start && end && end >= start) total += end - start;
  }
  return total || null;
}

function parseYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/\d{4}/);
  return m ? parseInt(m[0]) : null;
}

function toStringArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

module.exports = { analyzeMatchWithLLM };
