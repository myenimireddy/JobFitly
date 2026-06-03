/**
 * LLM Prompts for JobFitly
 * All prompts return { systemPrompt, userPrompt } objects
 */

/**
 * Prompt 1: Parse resume text into structured JSON
 * @param {string} rawText - Raw text extracted from PDF resume
 * @returns {Object} { systemPrompt, userPrompt }
 * 
 * Example:
 * Input: "John Doe\nSoftware Engineer\njohn@email.com\nSkills: JavaScript, React\nWorked at TechCorp 2020-2022 building web apps"
 * Output: {
 *   "name": "John Doe",
 *   "email": "john@email.com",
 *   "phone": "",
 *   "summary": "Software Engineer",
 *   "skills": ["javascript", "react"],
 *   "experience": [{
 *     "title": "Software Engineer",
 *     "company": "TechCorp",
 *     "years": 2,
 *     "description": "building web apps"
 *   }],
 *   "education": []
 * }
 */
function parseResume(rawText) {
  const systemPrompt = `You are an expert resume parser. Extract structured data from resume text.
Return ONLY a valid JSON object with no markdown, no explanation.

Output schema:
{
  "name": string,
  "email": string,
  "phone": string,
  "summary": string,
  "skills": string[],
  "experience": [{ "title": string, "company": string, "years": number, "description": string }],
  "education": [{ "degree": string, "institution": string, "year": number }]
}

Requirements:
- Infer skills from experience descriptions if not explicitly listed
- Return empty arrays not null for missing array fields
- Normalize skills to lowercase (e.g., "React" -> "react")`;

  return {
    systemPrompt,
    userPrompt: rawText,
  };
}

/**
 * Prompt 2: Extract job description into structured JSON
 * @param {string} rawText - Raw text from job posting HTML/page
 * @returns {Object} { systemPrompt, userPrompt }
 * 
 * Example:
 * Input: "Senior Frontend Engineer at Stripe\nLocation: San Francisco\n5+ years experience with React and TypeScript required. Nice to have: GraphQL, AWS. You'll build payment UIs."
 * Output: {
 *   "title": "Senior Frontend Engineer",
 *   "company": "Stripe",
 *   "location": "San Francisco",
 *   "seniority": "Senior",
 *   "experienceYears": 5,
 *   "requiredSkills": ["react", "typescript"],
 *   "niceToHaveSkills": ["graphql", "aws"],
 *   "responsibilities": ["build payment UIs"]
 * }
 */
function extractJob(rawText) {
  const systemPrompt = `You are an expert at parsing job descriptions. Extract structured data.
Return ONLY a valid JSON object with no markdown, no explanation.

Output schema:
{
  "title": string,
  "company": string,
  "location": string,
  "seniority": string,
  "experienceYears": number,
  "requiredSkills": string[],
  "niceToHaveSkills": string[],
  "responsibilities": string[]
}

Requirements:
- Distinguish required vs nice-to-have even when JD doesn't label them (required = must-have for role, nice-to-have = bonus)
- Infer seniority from title and requirements if not stated explicitly (Junior/Mid/Senior/Staff)
- Normalize skills to lowercase
- experienceYears: extract minimum years required, or 0 if not specified`;

  return {
    systemPrompt,
    userPrompt: rawText,
  };
}

/**
 * Prompt 3: Analyze match between profile and job
 * @param {Object} profileJson - Parsed profile from parseResume
 * @param {Object} jobJson - Parsed job from extractJob
 * @returns {Object} { systemPrompt, userPrompt }
 * 
 * Example:
 * Input profile: { "skills": ["react", "javascript"], "experience": [{"title": "Frontend Dev", "years": 3}] }
 * Input job: { "title": "Senior Frontend", "requiredSkills": ["react", "typescript", "graphql"], "experienceYears": 5 }
 * Output: {
 *   "matchScore": 60,
 *   "matchedSkills": ["react"],
 *   "missingSkills": ["graphql"],
 *   "partialMatches": [{ "skill": "typescript", "youHave": "javascript", "theyWant": "typescript" }],
 *   "recommendations": [
 *     { "gap": "Need 2 more years of experience for senior role", "suggestion": "Highlight leadership experience in current role" },
 *     { "gap": "Missing TypeScript", "suggestion": "Add TypeScript to your skills and mention any JS-to-TS migration work" }
 *   ],
 *   "summary": "You're a solid fit with strong React experience. Adding TypeScript and emphasizing leadership will boost your candidacy for this senior role."
 * }
 */
function analyzeMatch(profileJson, jobJson) {
  const systemPrompt = `You are a career coach analyzing candidate fit for a job role.
Return ONLY a valid JSON object with no markdown, no explanation.

Output schema:
{
  "matchScore": number (0-100),
  "matchedSkills": string[],
  "missingSkills": string[],
  "partialMatches": [{ "skill": string, "youHave": string, "theyWant": string }],
  "recommendations": [{ "gap": string, "suggestion": string }],
  "summary": string
}

Requirements:
- matchScore must be deterministic: count matchedSkills / total required skills * 100, then adjust for experience fit
- recommendations must be specific and actionable based on actual gaps, not generic advice
- partialMatches: when candidate has related skill but not exact match (e.g., has "javascript" job wants "typescript")
- summary must be encouraging and under 3 sentences, acknowledging strengths before gaps`;

  const userPrompt = `CANDIDATE PROFILE:
${JSON.stringify(profileJson, null, 2)}

JOB REQUIREMENTS:
${JSON.stringify(jobJson, null, 2)}`;

  return {
    systemPrompt,
    userPrompt,
  };
}

module.exports = {
  parseResume,
  extractJob,
  analyzeMatch,
};
