'use strict';

const express = require('express');
const { z } = require('zod');
const documentsService = require('./service');

const router = express.Router();

const generateSchema = z.object({
  profileId: z.string().cuid(),
  jobId:     z.string().cuid(),
  type:      z.enum(['resume', 'cover_letter', 'both']).default('both'),
});

/**
 * POST /api/documents/generate
 * Generate tailored resume bullets and/or cover letter
 */
router.post('/generate', async (req, res) => {
  try {
    const validation = generateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false, data: null,
        error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }
    const { profileId, jobId, type } = validation.data;
    const result = await documentsService.generate(profileId, jobId, type);
    res.json({ success: true, data: result, error: null });
  } catch (err) {
    const status = err.statusCode || 500;
    res.status(status).json({ success: false, data: null, error: err.message });
  }
});

module.exports = router;
