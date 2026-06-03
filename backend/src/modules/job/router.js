const express = require('express');
const { z } = require('zod');
const jobService = require('./service');

const router = express.Router();

// Validation schemas
const extractJobSchema = z.object({
  url: z.string().min(1),
  html: z.string().min(1),
});

const analyzeJobSchema = z.object({
  url: z.string().min(1),
  html: z.string().min(1),
  profileId: z.string().min(1),
});

const jobIdSchema = z.object({
  id: z.string().cuid(),
});

/**
 * POST /api/job/extract
 * Extract and parse job description from HTML
 * @param {Object} body - { url: string, html: string }
 * @returns {Object} { success: true, data: { id, url, rawHtml, parsedData } }
 */
router.post('/extract', async (req, res) => {
  try {
    const validation = extractJobSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    const result = await jobService.extractAndParse(validation.data.url, validation.data.html);
    
    res.status(201).json({
      success: true,
      data: result,
      error: null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      error: error.message,
    });
  }
});

/**
 * POST /api/job/analyze
 * Analyze job HTML and extract form fields for autofill
 * @param {Object} body - { url: string, html: string, profileId: string }
 * @returns {Object} { success: true, data: { jobId, title, fields } }
 */
router.post('/analyze', async (req, res) => {
  try {
    const validation = analyzeJobSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    const result = await jobService.analyzeAndExtractFields(
      validation.data.url,
      validation.data.html,
      validation.data.profileId
    );
    
    res.status(201).json({
      success: true,
      data: result,
      error: null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      error: error.message,
    });
  }
});

/**
 * GET /api/job/:id
 * Get a saved job by ID
 * @param {string} id - Job CUID
 * @returns {Object} { success: true, data: { id, url, rawHtml, parsedData, createdAt, updatedAt } }
 */
router.get('/:id', async (req, res) => {
  try {
    const validation = jobIdSchema.safeParse({ id: req.params.id });
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid job ID format',
      });
    }

    const result = await jobService.getById(validation.data.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Job not found',
      });
    }

    res.json({
      success: true,
      data: result,
      error: null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      data: null,
      error: error.message,
    });
  }
});

module.exports = router;
