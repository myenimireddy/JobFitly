'use strict';

/**
 * PII Sanitizer — replaces personal identifiers in profile data with
 * generic placeholders before sending to any LLM.
 * After the LLM responds, the caller substitutes placeholders back
 * using the returned `restore` map.
 *
 * Why: Ollama is local so risk is low, but Groq / any cloud LLM
 * would receive raw PII otherwise. Anonymizing costs nothing.
 */

const PLACEHOLDER = {
  fullName:  '[CANDIDATE_NAME]',
  email:     '[CANDIDATE_EMAIL]',
  phone:     '[CANDIDATE_PHONE]',
  linkedin:  '[CANDIDATE_LINKEDIN]',
  website:   '[CANDIDATE_WEBSITE]',
  location:  '[CANDIDATE_LOCATION]',
};

/**
 * Sanitize a parsedProfile object for LLM consumption.
 *
 * @param {Object} parsedProfile  - Full parsedData from DB
 * @returns {{ sanitized: Object, restore: Map<string,string> }}
 *   sanitized — copy of profile with PII replaced by placeholders
 *   restore   — Map<placeholder, realValue> to re-substitute after LLM
 */
function sanitizeProfile(parsedProfile) {
  const restore = new Map();
  const pi = parsedProfile.personalInfo || {};

  /**
   * Register a PII value → placeholder mapping.
   * If the value is empty, returns the placeholder anyway (LLM will get
   * the placeholder token and just say "missing").
   */
  function reg(placeholder, realValue) {
    if (realValue) restore.set(placeholder, realValue);
    return placeholder;
  }

  const sanitizedPersonalInfo = {
    fullName:  reg(PLACEHOLDER.fullName,  pi.fullName),
    email:     reg(PLACEHOLDER.email,     pi.email),
    phone:     reg(PLACEHOLDER.phone,     pi.phone),
    linkedin:  reg(PLACEHOLDER.linkedin,  pi.linkedin),
    website:   reg(PLACEHOLDER.website,   pi.website),
    location:  reg(PLACEHOLDER.location,  pi.location),
  };

  // Work experience: keep titles/companies (not PII) but scrub achievements
  // of any email/phone patterns that might appear inline
  const sanitizedWork = (parsedProfile.workExperience || []).map(w => ({
    title:      w.title,
    company:    w.company,
    startDate:  w.startDate,
    endDate:    w.endDate,
    achievements: (w.achievements || [])
      .slice(0, 3)
      .map(a => scrubInlineContacts(a, restore)),
  }));

  return {
    sanitized: {
      personalInfo:   sanitizedPersonalInfo,
      skills:         parsedProfile.skills || [],
      workExperience: sanitizedWork,
      education:      parsedProfile.education || [],
      summary:        parsedProfile.summary
        ? scrubInlineContacts(parsedProfile.summary, restore)
        : undefined,
    },
    restore,
  };
}

/**
 * Replace any email addresses or phone numbers inside a free-text string
 * with their placeholders and record the mapping.
 */
function scrubInlineContacts(text, restore) {
  if (!text) return text;

  return text
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, (match) => {
      const ph = `[EMAIL_${restore.size}]`;
      restore.set(ph, match);
      return ph;
    })
    .replace(/(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g, (match) => {
      const ph = `[PHONE_${restore.size}]`;
      restore.set(ph, match);
      return ph;
    });
}

/**
 * Restore PII placeholders in an array of LLM answer objects.
 *
 * @param {Array<{label, answer, missing}>} answers
 * @param {Map<string,string>} restore
 * @returns {Array<{label, answer, missing}>}
 */
function restoreAnswers(answers, restore, originalProfile) {
  if (!restore.size && !originalProfile) return answers;

  return answers.map(a => {
    if (!a.answer) return a;
    let answer = a.answer;
    
    // Restore from explicit restore map
    for (const [placeholder, real] of restore) {
      answer = answer.split(placeholder).join(real);
    }
    
    // Fallback: if placeholder still present but not in restore map,
    // try to get value from original profile
    if (originalProfile?.personalInfo) {
      const pi = originalProfile.personalInfo;
      answer = answer.split(PLACEHOLDER.fullName).join(pi.fullName || '');
      answer = answer.split(PLACEHOLDER.email).join(pi.email || '');
      answer = answer.split(PLACEHOLDER.phone).join(pi.phone || '');
      answer = answer.split(PLACEHOLDER.linkedin).join(pi.linkedin || '');
      answer = answer.split(PLACEHOLDER.website).join(pi.website || '');
      answer = answer.split(PLACEHOLDER.location).join(pi.location || '');
    }
    
    return { ...a, answer };
  });
}

/**
 * Returns true when the configured LLM provider sends data off-device.
 * Used to decide whether to warn the user.
 */
function isCloudProvider(config) {
  const provider = (config.llmProvider || 'ollama').toLowerCase();
  return provider !== 'ollama';
}

module.exports = { sanitizeProfile, restoreAnswers, isCloudProvider };
