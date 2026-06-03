const { Ollama } = require('ollama');
const BaseLLM = require('./base');
const config = require('../config');

/**
 * Ollama LLM provider for local model inference
 */
class OllamaLLM extends BaseLLM {
  constructor() {
    super();
    this.model = config.ollamaModel || 'llama3';
    this.baseUrl = config.ollamaBaseUrl || 'http://localhost:11434';
    this.client = new Ollama({ host: this.baseUrl });
  }

  /**
   * Check if Ollama is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!this.baseUrl;
  }

  /**
   * Extract using local Ollama model
   * @param {string} systemPrompt - System instructions
   * @param {string} userPrompt - User content
   * @returns {Promise<string>} LLM response
   */
  async extract(systemPrompt, userPrompt) {
    console.log('\n━━━ [ollama] REQUEST ━━━');
    console.log(`  model  : ${this.model}`);
    console.log(`  system : ${systemPrompt.slice(0, 200)}${systemPrompt.length > 200 ? '...' : ''}`);
    console.log(`  user   : ${userPrompt.length} chars`);
    console.log('  user (first 400):');
    console.log(' ', userPrompt.slice(0, 400).replace(/\n/g, '\n  '));
    const t0 = Date.now();

    const TIMEOUT_MS = 120_000; // 2 min — resume parsing can be slow on first run
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await this.client.chat({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        options: {
          temperature: 0.1,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const raw = response.message.content;
      console.log(`\n━━━ [ollama] RESPONSE (${Date.now() - t0}ms) ━━━`);
      console.log(`  length : ${raw.length} chars`);
      console.log('  output:');
      console.log(' ', raw.slice(0, 600).replace(/\n/g, '\n  '));

      // Try to parse as JSON to flag any structural issues early
      try {
        const parsed = JSON.parse(raw.trim());
        console.log('  ✅ valid JSON → top-level keys:', Object.keys(parsed));
      } catch {
        // might be wrapped in markdown code block
        const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]+?)```/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1].trim());
            console.log('  ✅ JSON inside markdown block → keys:', Object.keys(parsed));
          } catch {
            console.log('  ⚠  response is NOT valid JSON (raw text)');
          }
        } else {
          console.log('  ⚠  response is NOT valid JSON (raw text)');
        }
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return raw;
    } catch (error) {
      clearTimeout(timer);
      const msg = error.name === 'AbortError'
        ? `Ollama timed out after ${TIMEOUT_MS / 1000}s — model may still be loading, try again`
        : `Ollama LLM failed: ${error.message}`;
      console.error('[ollama] ❌ extraction error:', msg);
      throw new Error(msg);
    }
  }
}

module.exports = OllamaLLM;
