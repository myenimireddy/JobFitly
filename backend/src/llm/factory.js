const OllamaLLM = require('./ollama');
const GroqLLM = require('./groq');
const config = require('../config');

/**
 * LLM Factory - creates appropriate LLM instance based on environment config
 */
class LLMFactory {
  /**
   * Create and return LLM provider instance
   * @returns {BaseLLM} LLM provider instance
   * @throws {Error} If provider is not configured
   */
  static create() {
    const provider = config.llmProvider || 'ollama';

    switch (provider.toLowerCase()) {
      case 'ollama':
        const ollama = new OllamaLLM();
        if (!ollama.isConfigured()) {
          throw new Error('Ollama not configured. Set OLLAMA_BASE_URL in .env');
        }
        return ollama;

      case 'groq':
        const groq = new GroqLLM();
        if (!groq.isConfigured()) {
          throw new Error('Groq not configured. Set GROQ_API_KEY in .env');
        }
        return groq;

      default:
        throw new Error(`Unknown LLM provider: ${provider}. Use 'ollama' or 'groq'`);
    }
  }
}

module.exports = LLMFactory;
