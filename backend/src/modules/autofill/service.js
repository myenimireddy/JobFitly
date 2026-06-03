const { prisma } = require('../../lib/prisma');
const LLMFactory = require('../../llm/factory');
const { sanitizeProfile, restoreAnswers, isCloudProvider } = require('../../lib/piiSanitizer');
const config = require('../../config');

/**
 * Build a system prompt for the autofill LLM
 */
function buildSystemPrompt() {
  return `You are an expert job application assistant. Given a candidate's resume profile and a list of form fields from a job application page, provide the best possible answer for each field.

PRIVACY RULES (mandatory):
- The profile contains placeholder tokens like [CANDIDATE_NAME], [CANDIDATE_EMAIL], [CANDIDATE_PHONE], [CANDIDATE_LOCATION], [CANDIDATE_LINKEDIN].
- These tokens represent the candidate's REAL values. Use them AS-IS in your answers — copy the exact token string into the answer field.
- Do NOT substitute, invent, or modify these tokens. They will be replaced with real values after you respond.
- Use profile data only to generate answers — discard it immediately after.

Answer rules:
- Use only information from the provided profile. Do not invent details.
- If a field cannot be answered from the profile, set "answer" to null and "missing" to true.
- For name fields: use [CANDIDATE_NAME]
- For email fields: use [CANDIDATE_EMAIL]
- For phone fields: use [CANDIDATE_PHONE]
- For location/city fields: use [CANDIDATE_LOCATION]
- For LinkedIn fields: use [CANDIDATE_LINKEDIN]
- For cover letter / motivation / "why interested" fields: write a concise, professional 2-3 sentence response using the candidate's skills and experience from the profile.
- For "how do your skills align" fields: write 2-3 sentences referencing the candidate's specific skills listed in the profile.
- For salary fields: suggest a reasonable range based on seniority if mentioned, e.g. "$150,000 - $180,000".
- For fields with type "yesno", "radio", or "select": the "options" array lists valid choices — your answer MUST be one of those exact strings.
- For work authorization fields ("authorized to work", "right to work"): answer "Yes" unless profile says sponsorshipRequired=true.
- For sponsorship fields ("require sponsorship", "visa sponsorship"): answer "No" unless profile says sponsorshipRequired=true.
- For office/in-person attendance fields: answer "Yes" by default.
- For "percentage of time coding" or similar preference fields: use any value from the profile, or estimate based on role (e.g. "70%" for engineers).
- For "years of experience" fields: calculate from the candidate's work history in the profile.
- For "technical domain" or "area of expertise" radio fields: pick the option that best matches the candidate's most recent role and skills.
- For "additional information" / open text fields: write 2-3 professional sentences summarising the candidate's fit.
- Answer values must ALWAYS be strings. Never return a number as an answer.
- Return ONLY a valid JSON array. No markdown, no explanation.

Output format:
[
  { "label": "<field label>", "answer": "<string value or null>", "missing": false },
  ...
]`;
}

/**
 * Build the user prompt with SANITIZED profile + fields
 * @param {Object} sanitizedProfile - PII-scrubbed profile
 */
function buildUserPrompt(sanitizedProfile, fields, pageContext) {
  const profileSummary = JSON.stringify(sanitizedProfile, null, 2);

  const fieldList = JSON.stringify(fields.map(f => ({
    label: f.label,
    type: f.type === 'ashby-yesno' ? 'yesno' : f.type,
    required: f.required,
    options: f.options || undefined,
    placeholder: f.placeholder || undefined,
  })), null, 2);

  return `## Candidate Profile
${profileSummary}

## Job Page Context
URL: ${pageContext.url || 'unknown'}
Title: ${pageContext.title || 'unknown'}

## Form Fields to Fill
${fieldList}

Return a JSON array with an answer for each field.`;
}

/**
 * Parse LLM response — handle markdown code blocks and coerce answer types
 */
function parseLLMResponse(raw) {
  const cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : cleaned;
  const parsed = JSON.parse(jsonStr);

  // Coerce and filter: answers must be non-empty strings, not bare numbers or placeholders
  return parsed.map(item => {
    let answer = item.answer;

    // If LLM returned a number (e.g. an array index), treat as missing
    if (typeof answer === 'number') {
      console.warn(`[autofill] LLM returned numeric answer ${answer} for "${item.label}" — treating as missing`);
      return { ...item, answer: null, missing: true };
    }

    // Coerce to string
    if (answer !== null && answer !== undefined) {
      answer = String(answer).trim();
    }

    // Reject truly empty answers
    if (!answer || answer.length === 0) return { ...item, answer: null, missing: true };
    // Reject single bare digit (LLM hallucination: array index leak)
    if (/^\d$/.test(answer)) {
      console.warn(`[autofill] LLM returned single digit "${answer}" for "${item.label}" — treating as missing`);
      return { ...item, answer: null, missing: true };
    }
    // Keep valid placeholder tokens — restoreAnswers will expand them
    // (do NOT reject [CANDIDATE_*] tokens here)

    return { ...item, answer };
  });
}

/**
 * Deterministically resolve fields that map directly to parsed profile data.
 * Returns a string answer or null. No LLM needed for these.
 */
function resolveFromProfile(label, parsedProfile) {
  const l = label.toLowerCase().trim();
  const pi = parsedProfile.personalInfo || {};
  const work = parsedProfile.workExperience || [];
  const currentJob = work[0] || {};

  // Name
  if (/(^|\b)(full ?name|your name|first.*last|name)($|\b)/i.test(l) && !l.includes('company'))
    return pi.fullName || null;

  // Email
  if (/\bemail\b/i.test(l))
    return pi.email || null;

  // Phone
  if (/\b(phone|mobile|cell|telephone|contact number)\b/i.test(l))
    return pi.phone || null;

  // Location / city (exclude timezone fields)
  if (/\b(location|city|where (are|do) you (live|reside|currently located|based))\b/i.test(l) && 
      !l.includes('time') && !l.includes('timezone') && !l.includes('timezone'))
    return pi.location || null;

  // Timezone
  if (/\b(timezone|time zone|current timezone|located in)\b/i.test(l))
    return pi.location ? `${pi.location} (Local Time)` : 'Eastern Time';

  // Start date
  if (/\b(when can you start|start date|available to start|earliest start|notice period)\b/i.test(l))
    return parsedProfile.availableFrom || 'Immediately';

  // Current company
  if (/\b(current company|current employer|employer|company you work|where (do you|are you) work)\b/i.test(l))
    return currentJob.company || null;

  // LinkedIn
  if (/\blinkedin\b/i.test(l))
    return pi.linkedin || null;

  // Website / portfolio
  if (/\b(website|portfolio|github|personal site)\b/i.test(l))
    return pi.website || null;

  // Work authorisation / right to work
  if (/\b(authorized|authorised|right to work|eligible to work|work in the (us|uk|country|location))\b/i.test(l))
    return parsedProfile.sponsorshipRequired ? 'No' : 'Yes';
  // Sponsorship needed
  if (/\b(require sponsorship|need sponsorship|visa sponsorship|sponsorship.*future|future.*sponsorship)\b/i.test(l))
    return parsedProfile.sponsorshipRequired ? 'Yes' : 'No';
  // In-office / hybrid attendance
  if (/\b(work from (our|the) (office|hq|headquarters)|days? per week|in.?person|on.?site)\b/i.test(l))
    return 'Yes';
  // US / Canada residency
  if (/\b(living in the us|currently in us|us or canada|reside in the us)\b/i.test(l))
    return 'Yes';

  // Years of experience — compute from work history
  if (/\b(years? of (industry |professional |work )?experience|how (many|long).*(work|experience|industry))\b/i.test(l)) {
    const jobs = parsedProfile.workExperience || [];
    if (jobs.length > 0) {
      const earliest = jobs.reduce((min, j) => {
        const yr = parseInt((j.startDate || '').split(/[\s,-]/)[0]);
        return (!isNaN(yr) && yr < min) ? yr : min;
      }, new Date().getFullYear());
      const yrs = new Date().getFullYear() - earliest;
      if (yrs > 0 && yrs < 50) return `${yrs}`;
    }
  }

  return null;
}

// Labels that should never be stored or served — scraper artifacts
const BAD_LABEL_PATTERNS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // bare UUID
  /^(start typing|pick date|type here|search|enter)(\.\.\.)?$/i,     // placeholders
  /i acknowledge that i have opened|i confirm i have read/i,            // legal checkbox text
  /^(front end|full stack|back end|infrastructure|database operations|low.level systems|distributed systems|operations \/ sre)$/i, // stale radio options
];
function isBadLabel(label) {
  return BAD_LABEL_PATTERNS.some(p => p.test((label || '').trim()));
}

/**
 * Build a map of deterministic field values from profile (no LLM needed)
 */
function buildDirectMap(parsedProfile) {
  const pi = parsedProfile.personalInfo || {};
  const work = parsedProfile.workExperience || [];
  const currentJob = work[0] || {};
  const extra = parsedProfile.extraAnswers || {};

  return {
    firstName: pi.firstName || (pi.fullName || '').split(' ')[0] || null,
    lastName: pi.lastName || (pi.fullName || '').split(' ').slice(1).join(' ') || null,
    fullName: pi.fullName || null,
    email: pi.email || null,
    phone: pi.phone || null,
    location: pi.location || null,
    linkedin: pi.linkedin || null,
    website: pi.website || null,
    currentCompany: currentJob.company || null,
    currentTitle: currentJob.title || null,
    ...extra,
  };
}

/**
 * System prompt for injection instruction generation
 */
function buildInjectionSystemPrompt() {
  return `You are a form autofill assistant. Find all fillable form fields in the HTML and output how to fill them.

Look for: <input>, <textarea>, <select>, radio buttons, checkboxes.

For each field, output a JSON object with these EXACT keys:
- selector: CSS selector (use #id, [name="field"], or data attributes)
- value: The value to set
- type: "input", "textarea", "select", "radio", or "checkbox"
- label: The field's label text

IMPORTANT:
- The selector MUST be a valid CSS selector that finds the element
- The value MUST be the actual value to fill (use pre-resolved values when available)
- Include ALL fields: name, email, phone, address, education, experience, etc.
- For select/radio: value must match an option in the HTML
- Skip file upload fields

Example output:
[
  {"selector":"#first_name","value":"John","type":"input","label":"First Name"},
  {"selector":"#email","value":"john@example.com","type":"input","label":"Email"},
  {"selector":"select#country","value":"United States","type":"select","label":"Country"}
]

Return ONLY the JSON array. No explanation, no markdown code blocks.`;
}

/**
 * User prompt with profile + HTML
 */
function buildInjectionUserPrompt(sanitizedProfile, directValues, url, html) {
  return `## Pre-resolved Values (use these directly, do NOT override with LLM guesses)
${JSON.stringify(directValues, null, 2)}

## Candidate Profile
${JSON.stringify(sanitizedProfile, null, 2)}

## Page URL
${url}

## Page HTML
${html}

Analyze the HTML above. Find every form field and output injection instructions as a JSON array.`;
}

/**
 * Parse LLM injection response and restore PII placeholders
 */
function parseInjectionResponse(raw, restore) {
  const cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : cleaned;
  let parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error('LLM returned non-array response');
  }

  // Restore PII tokens → real values
  parsed = parsed.map(inj => {
    let value = inj.value;
    if (typeof value === 'string') {
      for (const [token, real] of restore.entries()) {
        value = value.replace(token, real);
      }
    }
    return { ...inj, value };
  });

  // Filter out entries with missing selector or value
  return parsed.filter(inj => inj.selector && inj.value !== null && inj.value !== undefined && inj.value !== '');
}

/**
 * Extract form fields from HTML using regex (deterministic, no LLM)
 * Returns array of { selector, label, type, element }
 */
function extractFieldsFromHtml(html) {
  const fields = [];

  // Match input elements with id or name attributes
  const inputRegex = /<input[^>]*(?:id=["']([^"']+)["']|name=["']([^"']+)["'])[^>]*>/gi;
  const selectRegex = /<select[^>]*(?:id=["']([^"']+)["']|name=["']([^"']+)["'])[^>]*>/gi;
  const textareaRegex = /<textarea[^>]*(?:id=["']([^"']+)["']|name=["']([^"']+)["'])[^>]*>/gi;

  // Find all inputs
  let match;
  while ((match = inputRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const id = match[1];
    const name = match[2];
    const selector = id ? `#${id}` : `[name="${name}"]`;

    // Determine type from input type attribute
    const typeMatch = fullTag.match(/type=["']([^"']+)["']/i);
    const inputType = typeMatch ? typeMatch[1].toLowerCase() : 'text';

    // Skip hidden, submit, button, file
    if (['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(inputType)) continue;

    // Find associated label
    let label = '';
    if (id) {
      const labelRegex = new RegExp(`<label[^>]*for=["']${id}["'][^>]*>([^<]*)</label>`, 'i');
      const labelMatch = html.match(labelRegex);
      if (labelMatch) label = labelMatch[1].trim();
    }
    // Also check aria-label
    if (!label) {
      const ariaMatch = fullTag.match(/aria-label=["']([^"']+)["']/i);
      if (ariaMatch) label = ariaMatch[1].trim();
    }
    // Check placeholder
    if (!label) {
      const placeholderMatch = fullTag.match(/placeholder=["']([^"']+)["']/i);
      if (placeholderMatch) label = placeholderMatch[1].trim();
    }

    // Determine field type category
    let type = 'input';
    if (inputType === 'checkbox') type = 'checkbox';
    else if (inputType === 'radio') type = 'radio';

    fields.push({ selector, label: label || name || id, type, inputType, element: 'input' });
  }

  // Find all selects
  while ((match = selectRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const id = match[1];
    const name = match[2];
    const selector = id ? `#${id}` : `[name="${name}"]`;

    let label = '';
    if (id) {
      const labelRegex = new RegExp(`<label[^>]*for=["']${id}["'][^>]*>([^<]*)</label>`, 'i');
      const labelMatch = html.match(labelRegex);
      if (labelMatch) label = labelMatch[1].trim();
    }
    if (!label) {
      const ariaMatch = fullTag.match(/aria-label=["']([^"']+)["']/i);
      if (ariaMatch) label = ariaMatch[1].trim();
    }

    fields.push({ selector, label: label || name || id, type: 'select', element: 'select' });
  }

  // Find all textareas
  while ((match = textareaRegex.exec(html)) !== null) {
    const fullTag = match[0];
    const id = match[1];
    const name = match[2];
    const selector = id ? `#${id}` : `[name="${name}"]`;

    let label = '';
    if (id) {
      const labelRegex = new RegExp(`<label[^>]*for=["']${id}["'][^>]*>([^<]*)</label>`, 'i');
      const labelMatch = html.match(labelRegex);
      if (labelMatch) label = labelMatch[1].trim();
    }
    if (!label) {
      const ariaMatch = fullTag.match(/aria-label=["']([^"']+)["']/i);
      if (ariaMatch) label = ariaMatch[1].trim();
    }

    fields.push({ selector, label: label || name || id, type: 'textarea', element: 'textarea' });
  }

  console.log(`[autofill/extract] Found ${fields.length} form fields deterministically`);
  fields.slice(0, 5).forEach((f, i) => console.log(`  ${i + 1}. ${f.type}: ${f.label} (${f.selector})`));
  if (fields.length > 5) console.log(`  ... and ${fields.length - 5} more`);

  return fields;
}

/**
 * Use local LLM to semantically match field labels to profile values
 * Much more robust than keyword matching for edge cases
 */
async function matchFieldsWithLLM(fields, directMap) {
  const mapped = [];
  const needsGeneration = [];

  // Build prompt for semantic matching
  const profileKeys = Object.entries(directMap)
    .filter(([k, v]) => v)
    .map(([k, v]) => `- ${k}: ${String(v).slice(0, 40)}`)
    .join('\n');

  const fieldsList = fields
    .map((f, i) => `${i}. "${f.label}" (${f.type}, selector: ${f.selector})`)
    .join('\n');

  const prompt = `Match each form field to the correct profile value.

Profile Values:
${profileKeys}

Form Fields:
${fieldsList}

For each field, respond with ONLY the profile key that matches, or "GENERATE" if it needs custom text (like motivation, cover letter).

Format: field_index -> profile_key_or_GENERATE

Example:
0 -> fullName
1 -> email
2 -> GENERATE`;

  try {
    const llm = LLMFactory.create();
    console.log(`[autofill/match] Asking local LLM to match ${fields.length} fields...`);
    const raw = await llm.extract('', prompt);

    // Parse the matching results
    const lines = raw.split('\n').filter(l => l.includes('->'));

    for (const line of lines) {
      const match = line.match(/(\d+)\s*->\s*(\w+|GENERATE)/i);
      if (match) {
        const fieldIdx = parseInt(match[1]);
        const profileKey = match[2].toLowerCase();
        const field = fields[fieldIdx];

        if (field && profileKey === 'generate') {
          needsGeneration.push(field);
        } else if (field && directMap[profileKey]) {
          mapped.push({
            selector: field.selector,
            value: directMap[profileKey],
            type: field.type,
            label: field.label,
            source: 'profile'
          });
        }
      }
    }
  } catch (err) {
    console.log('[autofill/match] LLM matching failed, using fallback:', err.message);
    // Fallback: all fields need generation
    needsGeneration.push(...fields);
  }

  console.log(`[autofill/match] ${mapped.length} fields matched by LLM, ${needsGeneration.length} need text generation`);

  return { mapped, needsGeneration };
}

class AutofillService {
  /**
   * Generate injection instructions from raw HTML + profile
   * This is the new v2 architecture: AI sees the HTML and outputs
   * CSS selectors + values + types for the content script executor.
   *
   * @param {string} profileId
   * @param {string} url
   * @param {string} html - full page HTML
   * @returns {{ injections: Array<{selector, value, type, label}> }}
   */
  async generateInjections(profileId, url, html) {
    console.log('\n━━━ [autofill/inject] LOCAL MODE - Data stays on your machine ━━━');
    console.log('[autofill/inject] profileId:', profileId);
    console.log('[autofill/inject] url:', url);
    console.log('[autofill/inject] html length:', html.length, 'chars');

    const profileRow = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

    const parsedProfile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData)
      : profileRow.parsedData;

    // Pre-resolve deterministic fields (name, email, phone, etc.)
    const directMap = buildDirectMap(parsedProfile);
    console.log('\n┌── PROFILE VALUES ──');
    Object.entries(directMap).forEach(([k, v]) => {
      if (v) console.log(`│  ${k}: ${String(v).slice(0, 50)}`);
    });
    console.log('└─────────────────────');

    // Step 1: Extract fields deterministically from HTML (no LLM)
    const fields = extractFieldsFromHtml(html);

    if (fields.length === 0) {
      console.log('[autofill/inject] No form fields found in HTML');
      return { injections: [] };
    }

    // Step 2: Use local LLM to semantically match fields to profile values
    const { mapped, needsGeneration } = await matchFieldsWithLLM(fields, directMap);

    // Step 3: Use local LLM for text generation fields (motivation, cover letter, etc.)
    let llmInjections = [];
    if (needsGeneration.length > 0) {
      console.log(`[autofill/inject] Using local LLM for ${needsGeneration.length} text fields`);
      llmInjections = await this.generateTextInjections(needsGeneration, parsedProfile, url);
    }

    const allInjections = [...mapped, ...llmInjections];

    console.log(`\n┌── INJECTIONS (${allInjections.length} total) ━━`);
    allInjections.slice(0, 10).forEach((inj, i) => {
      console.log(`│ ${i + 1}. [${inj.type}] "${inj.label}" (${inj.source || 'llm'})`);
      console.log(`│    selector: ${inj.selector}`);
      console.log(`│    value:    ${String(inj.value).slice(0, 50)}${String(inj.value).length > 50 ? '...' : ''}`);
    });
    if (allInjections.length > 10) console.log(`│ ... and ${allInjections.length - 10} more`);
    console.log('└────────────────────────────────────────────');
    console.log('━━━ [autofill/inject] DONE - All data stayed local ━━━\n');

    return { injections: allInjections };
  }

  /**
   * Generate text content using local LLM (only for complex fields like motivation, cover letter)
   * Small, focused prompt - much more likely to succeed
   */
  async generateTextInjections(fields, parsedProfile, url) {
    const companyName = url.match(/greenhouse\.io\/([^\/]+)/)?.[1] || 'the company';
    const jobTitle = parsedProfile.workExperience?.[0]?.title || 'Software Engineer';

    // Build a simple, focused prompt
    const prompt = `Write brief professional responses for a job application.

Applicant: ${parsedProfile.personalInfo?.fullName || ''}
Role: ${jobTitle}
Skills: ${(parsedProfile.skills || []).slice(0, 5).join(', ')}
Company: ${companyName}

Fields:
${fields.map((f, i) => `${i + 1}. ${f.label} (2-3 sentences)`).join('\n')}

Write concise, professional responses. Return as JSON:
[
  {"selector": "${fields[0]?.selector || ''}", "value": "response text", "type": "${fields[0]?.type || 'textarea'}", "label": "${fields[0]?.label || ''}"}
]`;

    try {
      const llm = LLMFactory.create();
      console.log('[autofill/text] Sending focused prompt to local LLM...');
      const raw = await llm.extract('', prompt);

      // Try to extract JSON
      let jsonStr = raw;
      const codeBlockMatch = raw.match(/```json\s*([\s\S]*?)```/);
      if (codeBlockMatch) jsonStr = codeBlockMatch[1];

      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed.map((p, i) => ({
          selector: p.selector || fields[i]?.selector,
          value: p.value,
          type: p.type || fields[i]?.type || 'textarea',
          label: p.label || fields[i]?.label,
          source: 'llm'
        }));
      }
    } catch (err) {
      console.log('[autofill/text] LLM generation failed, using fallback:', err.message);
    }

    // Fallback: use generic responses
    return fields.map(f => ({
      selector: f.selector,
      value: `I am excited about this opportunity and believe my experience aligns well with the requirements.`,
      type: f.type,
      label: f.label,
      source: 'fallback'
    }));
  }

  /**
   * Generate autofill answers for a set of form fields
   * @param {string} profileId
   * @param {Array} fields - Scraped form fields
   * @param {{ url: string, title: string }} pageContext
   */
  async generateAnswers(profileId, fields, pageContext) {
    const profileRow = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

    const parsedProfile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData)
      : profileRow.parsedData;

    const storedExtras = parsedProfile.extraAnswers || {};

    // Priority: 1) stored answers from previous sessions, 2) direct profile lookup, 3) LLM
    const enrichedFields = fields
      .map(f => {
      // Normalize key: lowercase, trim, remove special chars like *
      const key = f.label.toLowerCase().trim().replace(/[*\s]+/g, ' ').trim();
      // Stored answer wins first — always serve cached answers regardless of isBadLabel
      if (storedExtras[key]) return { ...f, _storedAnswer: storedExtras[key], _source: 'stored' };
      // Drop bad labels before profile lookup or LLM
      if (isBadLabel(f.label)) return { ...f, _skip: true };
      // Try direct profile resolution
      const direct = resolveFromProfile(f.label, parsedProfile);
      if (direct) return { ...f, _storedAnswer: direct, _source: 'profile' };
      return f;
    })
    .filter(f => !f._skip || f._storedAnswer);

    const preAnswered = enrichedFields
      .filter(f => f._storedAnswer)
      .map(f => ({ label: f.label, answer: f._storedAnswer, missing: false, source: f._source }));

    // Fields that need LLM
    const needsLLM = enrichedFields.filter(f => !f._storedAnswer);
    console.log(`[autofill] ${preAnswered.length} pre-filled (${preAnswered.filter(a=>a.source==='profile').length} from profile, ${preAnswered.filter(a=>a.source==='stored').length} from cache), ${needsLLM.length} need LLM`);
    console.log('[autofill] pre-answered fields:', preAnswered.map(f => `${f.label.slice(0,40)} → ${f.answer}`));
    console.log('[autofill] needs-LLM fields:', needsLLM.map(f => f.label.slice(0,40)));

    // Sanitize PII before sending to LLM
    const { sanitized, restore } = sanitizeProfile(parsedProfile);
    const cloud = isCloudProvider(config);
    console.log(`[autofill] Privacy mode: ${cloud ? '⚠ CLOUD provider — PII replaced with placeholders' : '✓ local Ollama — data stays on device'}`);
    console.log(`[autofill] Restore map has ${restore.size} PII substitutions`);

    let llmAnswers = [];
    if (needsLLM.length > 0) {
      const llm = LLMFactory.create();
      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(sanitized, needsLLM, pageContext);

      console.log(`[autofill] Sending ${needsLLM.length} fields to LLM for profile ${profileId}`);
      const raw = await llm.extract(systemPrompt, userPrompt);
      const rawAnswers = parseLLMResponse(raw);
      // Restore real PII values in answers (placeholders → actual values)
      llmAnswers = restoreAnswers(rawAnswers, restore);
    }

    const allAnswers = [...preAnswered, ...llmAnswers];

    // Find missing fields
    const missingFields = allAnswers
      .filter(a => a.missing || !a.answer)
      .map(a => ({ label: a.label, answer: null }));

    console.log(`[autofill] ${allAnswers.length - missingFields.length} answered, ${missingFields.length} missing`);

    return {
      answers: allAnswers,
      missingFields,
      privacyMode: cloud ? 'cloud' : 'local',
    };
  }

  /**
   * Save user-provided answers for missing fields into the profile's extraAnswers
   * @param {string} profileId
   * @param {Array<{label: string, answer: string}>} userAnswers
   */
  async saveMissingAnswers(profileId, userAnswers) {
    const profileRow = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

    const parsedProfile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData)
      : profileRow.parsedData;

    const extraAnswers = parsedProfile.extraAnswers || {};
    let saved = 0;
    userAnswers.forEach(({ label, answer }) => {
      if (!label || !answer) return;
      if (isBadLabel(label)) return;  // never store EEOC/placeholder/UUID labels
      const val = String(answer).trim();
      // Reject garbage: single char/digit, placeholder tokens, or suspiciously short non-name values
      if (val.length <= 1) return;
      if (/^\d+$/.test(val) && val.length < 3) return;  // bare digits like "5", "7"
      if (/^\[.*\]$/.test(val)) return;                  // placeholder tokens like [CANDIDATE_NAME]
      extraAnswers[label.toLowerCase().trim()] = val;
      saved++;
    });

    const updated = { ...parsedProfile, extraAnswers };
    await prisma.profile.update({
      where: { id: profileId },
      data: { parsedData: JSON.stringify(updated) },
    });

    console.log(`[autofill] Saved ${saved}/${userAnswers.length} extra answers for profile ${profileId}`);
    return { saved };
  }

  /**
   * Get all saved extra answers for a profile
   */
  async getSavedAnswers(profileId) {
    console.log('[getSavedAnswers] Looking up profile:', profileId);
    
    // Handle 'current' as special case to get latest profile
    let actualProfileId = profileId;
    if (profileId === 'current') {
      const latest = await prisma.profile.findFirst({ orderBy: { createdAt: 'desc' } });
      if (!latest) throw Object.assign(new Error('No profiles found'), { statusCode: 404 });
      actualProfileId = latest.id;
      console.log('[getSavedAnswers] Using latest profile:', actualProfileId);
    }
    
    const profileRow = await prisma.profile.findUnique({ where: { id: actualProfileId } });
    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

    const parsedProfile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData)
      : profileRow.parsedData;

    const extraAnswers = parsedProfile.extraAnswers || {};
    console.log('[getSavedAnswers] Found extraAnswers:', Object.keys(extraAnswers));
    
    // Convert to array format with metadata
    const answers = Object.entries(extraAnswers).map(([label, answer], index) => ({
      id: index,
      label,
      answer,
      portal: 'generic',
      createdAt: profileRow.updatedAt || new Date(),
    }));

    console.log('[getSavedAnswers] Returning', answers.length, 'answers');
    return { answers, count: answers.length, profileId: actualProfileId };
  }

  /**
   * Clear all stored extra answers for a profile (allows fresh LLM generation)
   */
  async clearSavedAnswers(profileId) {
    console.log('[clearSavedAnswers] Clearing for profile:', profileId);
    
    // Handle 'current' as special case to get latest profile
    let actualProfileId = profileId;
    if (profileId === 'current') {
      const latest = await prisma.profile.findFirst({ orderBy: { createdAt: 'desc' } });
      if (!latest) throw Object.assign(new Error('No profiles found'), { statusCode: 404 });
      actualProfileId = latest.id;
      console.log('[clearSavedAnswers] Using latest profile:', actualProfileId);
    }
    
    const profileRow = await prisma.profile.findUnique({ where: { id: actualProfileId } });
    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

    const parsedProfile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData)
      : profileRow.parsedData;

    const { extraAnswers: _, ...rest } = parsedProfile;
    await prisma.profile.update({
      where: { id: actualProfileId },
      data: { parsedData: JSON.stringify(rest) },
    });

    console.log(`[autofill] Cleared all saved answers for profile ${actualProfileId}`);
    return { cleared: true };
  }

  /**
   * Delete a single saved answer by label
   */
  async deleteSavedAnswer(profileId, label) {
    console.log('[deleteSavedAnswer] Deleting for profile:', profileId, 'label:', label);
    
    // Handle 'current' as special case to get latest profile
    let actualProfileId = profileId;
    if (profileId === 'current') {
      const latest = await prisma.profile.findFirst({ orderBy: { createdAt: 'desc' } });
      if (!latest) throw Object.assign(new Error('No profiles found'), { statusCode: 404 });
      actualProfileId = latest.id;
      console.log('[deleteSavedAnswer] Using latest profile:', actualProfileId);
    }
    
    const profileRow = await prisma.profile.findUnique({ where: { id: actualProfileId } });
    if (!profileRow) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

    const parsedProfile = typeof profileRow.parsedData === 'string'
      ? JSON.parse(profileRow.parsedData)
      : profileRow.parsedData;

    const extraAnswers = parsedProfile.extraAnswers || {};
    delete extraAnswers[label.toLowerCase().trim()];
    
    await prisma.profile.update({
      where: { id: actualProfileId },
      data: { parsedData: JSON.stringify({ ...parsedProfile, extraAnswers }) },
    });

    console.log(`[autofill] Deleted answer "${label}" for profile ${actualProfileId}`);
    return { deleted: true };
  }
}

module.exports = new AutofillService();
