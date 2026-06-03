const { prisma } = require('../../lib/prisma');
const { analyzeJobText } = require('../../lib/fallback');
const { parseJobWithLLM } = require('../../lib/llmJobParser');

function serializeJob(job) {
  return {
    ...job,
    parsedData: typeof job.parsedData === 'string'
      ? JSON.parse(job.parsedData)
      : job.parsedData,
  };
}

/**
 * Job service for job description extraction and retrieval
 */
class JobService {
  /**
   * Extract and parse job description from raw text/HTML
   * @param {string} url - Job posting URL
   * @param {string} rawText - Raw job text content
   * @returns {Promise<Object>} Parsed job with id, url, rawHtml, parsedData
   */
  async extractAndParse(url, rawText) {
    console.log('\n━━━ [job] RAW TEXT RECEIVED ━━━');
    console.log(`  url   : ${url}`);
    console.log(`  chars : ${rawText.length}`);
    console.log('  first 300 chars:');
    console.log(' ', rawText.slice(0, 300).replace(/\n/g, '\n  '));

    // Try LLM parser first, fall back to regex
    let parsedData = await parseJobWithLLM(rawText);
    let parseMethod = 'llm';

    if (!parsedData) {
      console.warn('[job] LLM unavailable — falling back to regex jobAnalyzer');
      const analysis = analyzeJobText(rawText);
      parsedData = {
        title: analysis.parsed.title,
        company: analysis.parsed.company,
        employmentType: analysis.parsed.employmentType,
        location: analysis.parsed.locationConstraints,
        locationType: null,
        yearsOfExperience: { min: analysis.parsed.yearsOfExperience, max: null },
        requiredSkills: [],
        preferredSkills: [],
        sponsorship: { offered: analysis.parsed.sponsorshipRequired, note: null },
        clearanceRequired: analysis.parsed.clearanceRequired,
        blockers: analysis.blockers,
        pros: analysis.pros,
      };
      parseMethod = 'regex';
    }

    parsedData._parseMethod = parseMethod;

    const job = await prisma.job.create({
      data: {
        url,
        rawHtml: rawText.slice(0, 10000),
        parsedData: JSON.stringify(parsedData),
      },
    });

    console.log(`[job] Saved to DB → id: ${job.id}`);
    return serializeJob(job);
  }

  /**
   * Get job by ID
   * @param {string} id - Job CUID
   * @returns {Promise<Object|null>} Job object or null if not found
   */
  async getById(id) {
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return null;
    return serializeJob(job);
  }

  /**
   * Analyze job HTML and extract form fields for autofill
   * @param {string} url - Job posting URL
   * @param {string} html - Full page HTML
   * @param {string} profileId - Profile ID for context
   * @returns {Promise<Object>} { jobId, title, fields }
   */
  async analyzeAndExtractFields(url, html, profileId) {
    console.log('\n━━━ [job] ANALYZE HTML ━━━');
    console.log(`  url      : ${url}`);
    console.log(`  html len : ${html.length}`);
    console.log(`  profileId: ${profileId}`);

    // First, extract job info
    const job = await this.extractAndParse(url, html);
    const jobTitle = job.parsedData?.title || 'Unknown Job';

    // Extract form fields using LLM
    const LLMFactory = require('../../llm/factory');
    const llm = LLMFactory.create();

    const systemPrompt = `You are an expert at extracting form fields from job application HTML pages.

Extract ALL form fields that a user would need to fill out, including:
- Text inputs (First Name, Last Name, Email, Phone, etc.)
- Textareas (Cover letter, motivation, additional info)
- Select dropdowns (Country, State, Role, etc.)
- Radio buttons (Gender, Veteran status, Disability status, Yes/No questions)
- Checkboxes

For each field, return:
- label: The visible label text the user sees
- type: "text", "textarea", "select", "radio", "checkbox"
- required: true if the field is marked as required (has *, required attribute, etc.)
- options: For select/radio/checkbox, list all available options
- placeholder: Any placeholder text if present

Return ONLY a valid JSON array. No markdown, no explanation.

Output format:
[
  { "label": "First Name", "type": "text", "required": true, "options": null, "placeholder": null },
  { "label": "Country", "type": "select", "required": true, "options": ["United States", "Canada", ...], "placeholder": null },
  ...
]`;

    const userPrompt = `Extract all form fields from this job application HTML.

URL: ${url}
Job Title: ${jobTitle}

HTML (truncated to 20000 chars for context):
${html.slice(0, 20000)}

Return a JSON array of all form fields.`;

    console.log('[job] Sending HTML to LLM for field extraction...');
    const raw = await llm.extract(systemPrompt, userPrompt);
    
    // Parse LLM response
    const cleaned = raw.trim();
    const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : cleaned;
    const fields = JSON.parse(jsonStr);

    console.log(`[job] Extracted ${fields.length} form fields`);

    return {
      jobId: job.id,
      title: jobTitle,
      fields,
    };
  }
}

module.exports = new JobService();
