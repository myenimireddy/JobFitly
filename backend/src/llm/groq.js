const Groq = require('groq-sdk');
const BaseLLM = require('./base');
const config = require('../config');

/**
 * Groq LLM provider for hosted model inference
 */
class GroqLLM extends BaseLLM {
  constructor() {
    super();
    this.client = new Groq({
      apiKey: config.groqApiKey,
    });
    this.model = config.groqModel || 'llama3-70b-8192';
  }

  /**
   * Check if Groq is configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!config.groqApiKey;
  }

  /**
   * Extract using Groq hosted model
   * @param {string} systemPrompt - System instructions
   * @param {string} userPrompt - User content
   * @returns {Promise<string>} LLM response
   */
  async extract(systemPrompt, userPrompt) {
    if (!this.isConfigured()) {
      throw new Error('Groq API key not configured. Set GROQ_API_KEY in .env');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Low temperature for consistent parsing
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
