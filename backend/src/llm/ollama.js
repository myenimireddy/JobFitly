const BaseLLM = require('./base');
const config = require('../config');
const safeLogger = require('../lib/safeLogger');

/**
 * Ollama via local HTTP API (no `ollama` npm package — that package is ESM-only
 * and breaks CommonJS `require` on recent versions).
 * Docs: POST {baseUrl}/api/chat
 */
class OllamaLLM extends BaseLLM {
  constructor() {
    super();
    this.model = config.ollamaModel || 'llama3';
    this.baseUrl = (config.ollamaBaseUrl || 'http://localhost:11434').replace(/\/$/, '');
  }

  isConfigured() {
    return !!this.baseUrl;
  }

  async chat(body, timeoutMs) {
    const TIMEOUT_MS = timeoutMs || 10 * 60 * 1000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: false, ...body }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
      }
      return res.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw Object.assign(new Error('timeout'), { name: 'AbortError' });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {number} [timeoutMs]
   * @returns {Promise<string>}
   */
  async extract(systemPrompt, userPrompt, timeoutMs) {
    console.log('\n━━━ [ollama] REQUEST ━━━');
    console.log(`  model  : ${this.model}`);
    console.log(`  system : ${systemPrompt.length} chars`);
    console.log(`  user   : ${userPrompt.length} chars`);
    safeLogger.content('Ollama system prompt sample', systemPrompt.slice(0, 200));
    safeLogger.content('Ollama user prompt sample', userPrompt.slice(0, 400));
    const t0 = Date.now();

    const TIMEOUT_MS = timeoutMs || 10 * 60 * 1000;
    try {
      const response = await this.chat({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        format: 'json',
        keep_alive: '30m',
        options: {
          temperature: 0,
          num_ctx: 8192,
        },
      }, TIMEOUT_MS);

      const raw = response?.message?.content || '';
      console.log(`\n━━━ [ollama] RESPONSE (${Date.now() - t0}ms) ━━━`);
      console.log(`  length : ${raw.length} chars`);
      safeLogger.content('Ollama response sample', raw.slice(0, 600));

      try {
        const parsed = JSON.parse(raw.trim());
        console.log('  ✅ valid JSON → top-level keys:', Object.keys(parsed));
      } catch {
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
      const msg = error.name === 'AbortError'
        ? `Ollama timed out after ${TIMEOUT_MS / 1000}s — model may still be loading, try again`
        : `Ollama LLM failed: ${error.message}`;
      console.error('[ollama] ❌ extraction error:', msg);
      throw new Error(msg);
    }
  }

  async warmup() {
    try {
      await this.chat({
        model: this.model,
        messages: [{ role: 'user', content: '{"ok":true}' }],
        format: 'json',
        keep_alive: '30m',
        options: { temperature: 0, num_predict: 8, num_ctx: 512 },
      }, 60_000);
      console.log(`[ollama] ${this.model} loaded into memory`);
    } catch (err) {
      console.warn(`[ollama] warmup skipped: ${err.message}`);
    }
  }
}

module.exports = OllamaLLM;
