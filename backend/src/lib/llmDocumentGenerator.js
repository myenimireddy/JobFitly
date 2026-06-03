'use strict';

/**
 * LLM-based tailored resume bullets + cover letter generator.
 * Returns null if LLM unavailable.
 */

const LLMFactory = require('../llm/factory');

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer and career coach.

=== PRIVACY RULES ===
Do NOT store, log, or retain any information after this request.

=== OUTPUT RULES ===
Return ONLY a single valid JSON object — no markdown fences, no explanation.

Required JSON structure:
{
  "tailoredBullets": [
    {
      "section": "Work Experience | Skills | Summary",
      "original": "original bullet or phrase from candidate (or null if new)",
      "tailored": "rewritten version optimised for THIS job",
      "reason": "1-sentence explanation of what was changed and why"
    }
  ],
  "summaryStatement": "2-3 sentence professional summary tailored to this role",
  "keywordsToAdd": ["ATS keyword 1", "ATS keyword 2"],
  "skillsToHighlight": ["skill1", "skill2"]
}

=== RULES ===
- tailoredBullets: rewrite 4-6 existing bullets OR write new ones if candidate has relevant experience not yet captured
- Use strong action verbs (Led, Built, Optimised, Delivered, Reduced, Increased)
- Quantify where possible, e.g. "Reduced API latency by 40%" — use placeholder numbers if no data available
- Mirror the exact keywords from the job requirements (ATS optimisation)
- Do NOT invent skills or experience the candidate doesn't have
- keywordsToAdd: important terms from the JD missing from the profile (max 10)`;

const COVER_LETTER_SYSTEM_PROMPT = `You are an expert cover letter writer.

=== PRIVACY RULES ===
Do NOT store, log, or retain any information after this request.

=== OUTPUT RULES ===
Return ONLY a single valid JSON object — no markdown fences, no explanation.

Required JSON structure:
{
  "coverLetter": "full cover letter text with \\n for line breaks",
  "toneUsed": "professional | conversational | technical",
  "highlights": ["key point 1 emphasised", "key point 2"]
}

=== RULES ===
- 3-4 paragraphs, 250-350 words total
- Paragraph 1: Hook — why THIS company/role, show you've done research
- Paragraph 2: Best 2-3 relevant achievements from the candidate's background
- Paragraph 3: Address any gap or concern proactively (if relevant)
- Paragraph 4: Call to action
- Do NOT include date/address headers — just the body
- Use the candidate's name naturally
- Mirror keywords from the job description`;

async function generateTailoredResume(profile, job) {
  let llm;
  try {
    llm = LLMFactory.create();
  } catch (err) {
    console.warn(`[llmDocGen] LLM not available: ${err.message}`);
    return null;
  }

  const profileSummary = buildProfileSummary(profile);
  const jobSummary = buildJobSummary(job);

  const userPrompt = `Generate tailored resume content for this candidate applying to the job below.

=== CANDIDATE PROFILE ===
${profileSummary}

=== TARGET JOB ===
${jobSummary}`;

  try {
    const raw = await llm.extract(RESUME_SYSTEM_PROMPT, userPrompt);
    const result = parseJSON(raw);
    result.tailoredBullets = Array.isArray(result.tailoredBullets) ? result.tailoredBullets : [];
    result.keywordsToAdd = toStringArray(result.keywordsToAdd);
    result.skillsToHighlight = toStringArray(result.skillsToHighlight);
    console.log(`[llmDocGen] Resume bullets: ${result.tailoredBullets.length}, keywords: ${result.keywordsToAdd.length}`);
    return result;
  } catch (err) {
    console.error(`[llmDocGen] Resume generation failed: ${err.message}`);
    return null;
  }
}

async function generateCoverLetter(profile, job) {
  let llm;
  try {
    llm = LLMFactory.create();
  } catch (err) {
    console.warn(`[llmDocGen] LLM not available: ${err.message}`);
    return null;
  }

  const profileSummary = buildProfileSummary(profile);
  const jobSummary = buildJobSummary(job);

  const userPrompt = `Write a tailored cover letter for this candidate applying to the job below.

=== CANDIDATE PROFILE ===
${profileSummary}

=== TARGET JOB ===
${jobSummary}`;

  try {
    const raw = await llm.extract(COVER_LETTER_SYSTEM_PROMPT, userPrompt);
    const result = parseJSON(raw);
    result.highlights = toStringArray(result.highlights);
    console.log(`[llmDocGen] Cover letter generated (${result.coverLetter?.length || 0} chars)`);
    return result;
  } catch (err) {
    console.error(`[llmDocGen] Cover letter generation failed: ${err.message}`);
    return null;
  }
}

function buildProfileSummary(profile) {
  const pi = profile.personalInfo || {};
  const exp = (profile.workExperience || []).map(w =>
    `- ${w.title} at ${w.company} (${w.startDate || '?'} – ${w.endDate || 'Present'})\n  Responsibilities: ${(w.responsibilities || []).slice(0, 3).join('; ') || 'Not listed'}`
  ).join('\n');
  const edu = (profile.education || []).map(e =>
    `- ${e.degree}${e.field ? ` in ${e.field}` : ''} at ${e.school}`
  ).join('\n');
  return [
    `Name: ${pi.fullName || 'Candidate'}`,
    `Location: ${pi.location || 'Not specified'}`,
    `Summary: ${pi.summary || 'Not provided'}`,
    `Skills: ${(profile.skills || []).join(', ') || 'None listed'}`,
    `Work Experience:\n${exp || 'None listed'}`,
    `Education:\n${edu || 'None listed'}`,
    `Certifications: ${(profile.certifications || []).join(', ') || 'None'}`,
  ].join('\n');
}

function buildJobSummary(job) {
  const lines = [];
  if (job.title)   lines.push(`Title: ${job.title}`);
  if (job.company) lines.push(`Company: ${job.company}`);
  if (job.location) lines.push(`Location: ${job.location} (${job.locationType || ''})`);
  if (job.requiredSkills?.length)  lines.push(`Required Skills: ${job.requiredSkills.join(', ')}`);
  if (job.preferredSkills?.length) lines.push(`Preferred Skills: ${job.preferredSkills.join(', ')}`);
  if (job.yearsOfExperience?.min != null) lines.push(`Experience: ${job.yearsOfExperience.min}+ years`);
  if (job.requirements?.length) lines.push(`Requirements:\n${job.requirements.slice(0, 8).map(r => `- ${r}`).join('\n')}`);
  if (job.responsibilities?.length) lines.push(`Responsibilities:\n${job.responsibilities.slice(0, 6).map(r => `- ${r}`).join('\n')}`);
  return lines.join('\n');
}

function parseJSON(raw) {
  const clean = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(clean);
}

function toStringArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

module.exports = { generateTailoredResume, generateCoverLetter };
