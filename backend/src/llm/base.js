/**
 * Contract every LLM provider must implement (ollama.js, groq.js).
 * New providers: extend BaseLLM, then wire resolveLlmRuntime + factory.js.
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
