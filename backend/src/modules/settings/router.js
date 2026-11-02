'use strict';

/**
 * User-facing LLM settings (extension gear / future web Settings).
 * Mounted at /api/settings — never expose the full Groq key in responses.
 */
const express = require('express');
const { z } = require('zod');
const { getPublicLlmSettings, setGroqApiKey } = require('../../lib/llmSettings');
const { checkLLM } = require('../../lib/llmStatus');

const router = express.Router();

const putSchema = z.object({
  groqApiKey: z.union([z.string(), z.null()]).optional(),
});

/** GET /api/settings/llm — public LLM config + live status. */
router.get('/llm', async (req, res) => {
  const settings = getPublicLlmSettings();
  const status = await checkLLM();
  res.json({
    success: true,
    data: { ...settings, status },
    error: null,
  });
});

/**
 * PUT /api/settings/llm
 * Body: { groqApiKey: "gsk_..." } to save, or { groqApiKey: null } to clear UI key.
 */
router.put('/llm', async (req, res) => {
  const validation = putSchema.safeParse(req.body || {});
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      data: null,
      error: validation.error.errors.map((e) => e.message).join(', '),
    });
  }

  if (!Object.prototype.hasOwnProperty.call(validation.data, 'groqApiKey')) {
    return res.status(400).json({
      success: false,
      data: null,
      error: 'Provide groqApiKey (string) or null to clear',
    });
  }

  try {
    const settings = setGroqApiKey(validation.data.groqApiKey);
    const status = await checkLLM();
    res.json({
      success: true,
      data: { ...settings, status },
      error: null,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      data: null,
      error: err.message || 'Failed to save settings',
    });
  }
});

module.exports = router;
