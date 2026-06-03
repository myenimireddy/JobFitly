/**
 * Safe JSON parser utility for LLM responses
 * Strips markdown fences and parses safely
 */

/**
 * Clean LLM response by removing markdown fences
 * @param {string} raw - Raw LLM response
 * @returns {string} Cleaned JSON string
 */
function stripMarkdownFences(raw) {
  if (!raw || typeof raw !== 'string') {
    return '';
  }

  // Remove markdown code fences
  let cleaned = raw.trim();
  
  // Remove ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  
  return cleaned.trim();
}

/**
 * Safely parse JSON from LLM response
 * @param {string} raw - Raw LLM response
 * @returns {Object} Parsed JSON object
 * @throws {Error} If parsing fails
 */
function safeParseJson(raw) {
  try {
    const cleaned = stripMarkdownFences(raw);
    
    if (!cleaned) {
      throw new Error('Empty response from LLM');
    }

    return JSON.parse(cleaned);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('JSON parse error. Raw response:', raw);
      throw new Error(`Invalid JSON from LLM: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse with fallback - returns null on failure instead of throwing
 * @param {string} raw - Raw LLM response
 * @returns {Object|null} Parsed JSON or null
 */
function tryParseJson(raw) {
  try {
    return safeParseJson(raw);
  } catch (error) {
    console.warn('Failed to parse JSON:', error.message);
    return null;
  }
}

module.exports = {
  stripMarkdownFences,
  safeParseJson,
  tryParseJson,
};
