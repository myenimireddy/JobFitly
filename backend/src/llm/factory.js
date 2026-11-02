/**
 * Creates the effective LLM client for this process tick.
 * Callers (resume parse, match narrative, autofill draft) should use this —
 * do not construct Groq/Ollama directly so Settings + .env stay consistent.
 */
const OllamaLLM = require('./ollama');
const GroqLLM = require('./groq');
const { resolveLlmRuntime } = require('../lib/llmSettings');

class LLMFactory {
  /**
   * @returns {import('./base')}
   */
  static create() {
    const runtime = resolveLlmRuntime();

    if (runtime.provider === 'groq') {
      const groq = new GroqLLM({ apiKey: runtime.groqApiKey, model: runtime.groqModel });
      if (!groq.isConfigured()) {
        throw new Error('Groq key invalid. Clear it in Settings or set GROQ_API_KEY in .env');
      }
      return groq;
    }

    const ollama = new OllamaLLM();
    if (!ollama.isConfigured()) {
      throw new Error('Ollama not configured. Set OLLAMA_BASE_URL in .env or add a Groq key in Settings');
    }
    return ollama;
  }
}

module.exports = LLMFactory;
