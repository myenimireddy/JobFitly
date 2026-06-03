'use strict';

/**
 * Job analysis utilities.
 * Ported from career-ai-platform/apps/api/src/modules/job-analysis/job-analysis.service.ts
 * Pure JS, no external dependencies.
 */

const BLOCKER_PATTERNS = [
  { pattern: /no\s+visa\s+sponsorship|cannot\s+sponsor|will\s+not\s+sponsor|unable\s+to\s+sponsor|sponsorship\s+not\s+available/i, type: 'visa_sponsorship', severity: 'high', message: 'This employer does not offer visa sponsorship.' },
  { pattern: /us\s+citizen(?:ship)?\s+required|must\s+be\s+(a\s+)?us\s+citizen|citizens\s+only/i, type: 'citizenship', severity: 'high', message: 'US citizenship is required.' },
  { pattern: /active\s+secret\s+clearance|ts\/sci|top\s+secret\s+clearance|security\s+clearance\s+required/i, type: 'security_clearance', severity: 'high', message: 'Security clearance is required.' },
  { pattern: /no\s+relocation|relocation\s+not\s+available|will\s+not\s+relocate/i, type: 'relocation', severity: 'low', message: 'Relocation is not offered.' },
];

const PRO_PATTERNS = [
  { pattern: /will\s+(?:consider\s+)?sponsor|willing\s+to\s+sponsor|sponsorship\s+(?:is\s+)?available|consider\s+sponsoring|can\s+sponsor/i, type: 'sponsorship_offered', message: 'This employer may offer visa sponsorship.' },
  { pattern: /fully\s+remote|100%\s+remote|work\s+from\s+(?:home|anywhere)|remote[- ]first/i, type: 'remote_friendly', message: 'This position supports remote work.' },
  { pattern: /relocation\s+(?:assistance|package|support|bonus)|relocation\s+(?:is\s+)?provided/i, type: 'relocation_offered', message: 'Relocation assistance may be available.' },
];

/**
 * Detect blocker signals in job text
 * @param {string} text
 * @returns {Array<{type, severity, message, matchedText}>}
 */
function detectBlockers(text) {
  const results = [];
  for (const rule of BLOCKER_PATTERNS) {
    const match = text.match(rule.pattern);
    if (match) results.push({ type: rule.type, severity: rule.severity, message: rule.message, matchedText: match[0] });
  }
  return results;
}

/**
 * Detect positive signals in job text
 * @param {string} text
 * @returns {Array<{type, message, matchedText}>}
 */
function detectPros(text) {
  const results = [];
  for (const rule of PRO_PATTERNS) {
    const match = text.match(rule.pattern);
    if (match) results.push({ type: rule.type, message: rule.message, matchedText: match[0] });
  }
  return results;
}

/**
 * Extract basic job facts using regex
 * @param {string} text
 */
function extractBasicJobFacts(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // --- Title: try labelled first, then first line if it looks like a job title ---
  const JOB_TITLE_WORDS = /\b(Engineer|Manager|Developer|Designer|Analyst|Director|Lead|Senior|Staff|Principal|Architect|Consultant|Head|VP|CTO|CEO|Intern|Coordinator|Specialist|Scientist)\b/i;
  let title = null;
  const labelledTitle = text.match(/(?:^|\n)(?:job title|position|role|title)[:\s]+([^\n]{3,80})/im);
  if (labelledTitle) {
    title = labelledTitle[1].trim();
  } else {
    // First line that looks like a job title (contains title words, < 120 chars)
    for (const line of lines.slice(0, 6)) {
      if (JOB_TITLE_WORDS.test(line) && line.length < 120 && !line.includes('http')) {
        title = line.replace(/\s*[|\-–].*$/, '').trim(); // strip company suffix after separator
        break;
      }
    }
  }

  // --- Company: labelled OR well-known pattern "at CompanyName" / first proper noun near title ---
  let company = null;
  const labelledCompany = text.match(/(?:^|\n)(?:company|employer|organization)[:\s]+([A-Z][A-Za-z0-9 .,&'-]{2,60})/im);
  if (labelledCompany) {
    company = labelledCompany[1].trim();
  } else {
    // "at CompanyName" or "Company: X" patterns
    const atMatch = text.match(/(?:joining|working at|team at|careers? at|jobs? at)\s+([A-Z][A-Za-z0-9 &.,']{2,50})/i);
    if (atMatch) {
      company = atMatch[1].trim();
    } else {
      // Look for a company name right after the title in first few lines
      for (const line of lines.slice(0, 8)) {
        if (!JOB_TITLE_WORDS.test(line) && /^[A-Z][A-Za-z0-9 &.,'-]{3,50}$/.test(line) && !line.includes('@') && !line.match(/^(Apply|Share|Team|City|State|Remote|Hybrid)$/i)) {
          company = line.trim();
          break;
        }
      }
    }
  }

  const yearsMatch = text.match(/(\d+)\+?\s*years?\s+(?:of\s+)?experience/i);
  const locationMatch = text.match(/(?:^|\n)(?:location|office|city)[:\s]+([^\n]{3,60})/im)
    || text.match(/(remote|hybrid|onsite|on-site)/i);
  const employmentMatch = text.match(/(full[- ]time|part[- ]time|contract|internship|temporary)/i);

  return {
    title,
    company,
    skills: [],
    yearsOfExperience: yearsMatch ? Number(yearsMatch[1]) : null,
    sponsorshipRequired: /visa\s+sponsor|work\s+authoriz/i.test(text)
      ? /will\s+(not|unable)|cannot|no\s+sponsor/i.test(text) ? false : true
      : null,
    clearanceRequired: /security\s+clearance|ts\/sci|top\s+secret/i.test(text),
    locationConstraints: locationMatch?.[1]?.trim() || null,
    employmentType: employmentMatch?.[1]?.trim() || null,
  };
}

/**
 * Calculate skill overlap between profile skills and job skills
 * @param {string[]} profileSkills
 * @param {string[]} jobSkills
 * @returns {{ matched: string[], missing: string[] }}
 */
function calculateSkillMatch(profileSkills, jobSkills) {
  const profileLower = profileSkills.map((s) => (s || '').toLowerCase()).filter(Boolean);
  const jobLower = jobSkills.map((s) => (s || '').toLowerCase()).filter(Boolean);

  const matched = [];
  const missing = [];

  for (const jobSkill of jobLower) {
    const isMatch = profileLower.some(
      (ps) => ps.includes(jobSkill) || jobSkill.includes(ps) || ps.replace(/[^a-z]/g, '') === jobSkill.replace(/[^a-z]/g, '')
    );
    if (isMatch) matched.push(jobSkill);
    else missing.push(jobSkill);
  }

  return { matched, missing };
}

/**
 * Calculate fit score 0-100
 * @param {object} analysis - { blockers }
 * @param {{ skills: string[], sponsorshipRequired?: boolean }} profile
 * @param {{ matched: string[], missing: string[] }} skillMatch
 * @returns {number}
 */
function calculateFitScore(analysis, profile, skillMatch) {
  let score = 50;

  const total = skillMatch.matched.length + skillMatch.missing.length;
  if (total > 0) {
    score += Math.round((skillMatch.matched.length / total) * 50);
  }

  for (const blocker of (analysis.blockers || [])) {
    if (blocker.type === 'visa_sponsorship' && profile.sponsorshipRequired) score -= 30;
    else if (blocker.severity === 'high') score -= 15;
    else if (blocker.severity === 'medium') score -= 10;
    else score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Full job analysis — extract facts, blockers, pros from raw description
 * @param {string} rawDescription
 * @returns {{ parsed, blockers, pros }}
 */
function analyzeJobText(rawDescription) {
  const parsed = extractBasicJobFacts(rawDescription);
  const blockers = detectBlockers(rawDescription);
  const pros = detectPros(rawDescription);
  return { parsed, blockers, pros };
}

module.exports = {
  analyzeJobText,
  calculateSkillMatch,
  calculateFitScore,
  detectBlockers,
  detectPros,
};
