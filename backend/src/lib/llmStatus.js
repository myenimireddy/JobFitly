'use strict';

/**
 * Centralised LLM availability checker and status reporter.
 * All services call checkLLM() to determine if the LLM is reachable
 * and attach the result to their API responses as `_llmStatus`.
 */

const config = require('../config');

/**
 * Check if the configured LLM provider is reachable.
 * Returns a status object — never throws.
 *
 * @returns {Promise<{
 *   available: boolean,
 *   provider: string,
 *   model: string,
 *   message: string,
 * }>}
 */
async function checkLLM() {
  const provider = (config.llmProvider || 'ollama').toLowerCase();

  if (provider === 'ollama') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${config.ollamaBaseUrl || 'http://localhost:11434'}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok || res.status === 200) {
        return {
          available: true,
          provider: 'ollama',
          model: config.ollamaModel || 'llama3',
          message: `Local Ollama running (${config.ollamaModel || 'llama3'})`,
        };
      }
    } catch {
      // fall through
    }
    return {
      available: false,
      provider: 'ollama',
      model: config.ollamaModel || 'llama3',
      message: 'Ollama is not running. Start it with: ollama serve',
    };
  }

  if (provider === 'groq') {
    if (!config.groqApiKey) {
      return {
        available: false,
        provider: 'groq',
        model: config.groqModel || 'llama3-70b-8192',
        message: 'Groq API key not set. Add GROQ_API_KEY to backend/.env',
      };
    }
    return {
      available: true,
      provider: 'groq',
      model: config.groqModel || 'llama3-70b-8192',
      message: `Groq cloud (${config.groqModel || 'llama3-70b-8192'})`,
    };
  }

  return {
    available: false,
    provider,
    model: 'unknown',
    message: `Unknown LLM provider "${provider}" in config`,
  };
}

module.exports = { checkLLM };
