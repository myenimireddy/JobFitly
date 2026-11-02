'use strict';

/**
 * Reachability / status for the *effective* LLM (after llmSettings resolution).
 * Used by GET /api/llm/status and settings responses. Never throws.
 */
const config = require('../config');
const { resolveLlmRuntime } = require('./llmSettings');

async function checkLLM() {
  const runtime = resolveLlmRuntime();

  if (runtime.provider === 'groq') {
    return {
      available: true,
      provider: 'groq',
      model: runtime.groqModel,
      message: `Groq cloud (${runtime.groqModel}) — fast`,
      source: runtime.source,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${runtime.ollamaBaseUrl || 'http://localhost:11434'}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok || res.status === 200) {
      return {
        available: true,
        provider: 'ollama',
        model: runtime.ollamaModel || config.ollamaModel || 'llama3',
        message: `Local Ollama (${runtime.ollamaModel || config.ollamaModel}) — slower; add Groq key for speed`,
        source: 'fallback',
      };
    }
  } catch {
    // fall through
  }

  return {
    available: false,
    provider: 'ollama',
    model: runtime.ollamaModel || config.ollamaModel || 'llama3',
    message: 'No Groq key and Ollama is not running. Add a Groq key in Settings, or run: ollama serve',
    source: 'fallback',
  };
}

module.exports = { checkLLM };
