const Groq = require('groq-sdk');
const BaseLLM = require('./base');
const config = require('../config');

/**
 * Groq LLM provider for hosted model inference
 */
class GroqLLM extends BaseLLM {
  /**
   * @param {{ apiKey?: string, model?: string }} [opts]
   */
  constructor(opts = {}) {
    super();
    this.apiKey = opts.apiKey || config.groqApiKey;
    this.model = opts.model || config.groqModel || 'openai/gpt-oss-20b';
    this.client = this.apiKey ? new Groq({ apiKey: this.apiKey }) : null;
  }

  isConfigured() {
    return !!(this.apiKey && this.client);
  }

  async extract(systemPrompt, userPrompt) {
    if (!this.isConfigured()) {
      throw new Error('Groq API key not configured. Add it in the Side Panel Settings or backend/.env');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Groq extraction error:', error);
      throw new Error(`Groq LLM failed: ${error.message}`);
    }
  }
}

module.exports = GroqLLM;
