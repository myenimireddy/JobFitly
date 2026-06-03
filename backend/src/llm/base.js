/**
 * Base class for LLM providers
 * All LLM implementations must extend this class
 */
class BaseLLM {
  /**
   * Extract structured data using LLM
   * @param {string} systemPrompt - The system prompt defining the task
   * @param {string} userPrompt - The user content to process
   * @returns {Promise<string>} Raw LLM response text
   * @throws {Error} If extraction fails
   */
  async extract(systemPrompt, userPrompt) {
    throw new Error('Method extract() must be implemented by subclass');
  }

  /**
   * Check if provider is configured properly
   * @returns {boolean}
   */
  isConfigured() {
    return true;
  }
}

module.exports = BaseLLM;
