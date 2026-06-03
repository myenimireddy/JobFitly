const express = require('express');
const { z } = require('zod');
const matchService = require('./service');

const router = express.Router();

// Validation schemas
const createMatchSchema = z.object({
  profileId: z.string().cuid(),
  jobId: z.string().cuid(),
});

const matchIdSchema = z.object({
  id: z.string().cuid(),
});

/**
 * POST /api/match
 * Create a match analysis between profile and job
 * @param {Object} body - { profileId: string, jobId: string }
 * @returns {Object} { success: true, data: { id, profileId, jobId, resultData, matchScore } }
 */
router.post('/', async (req, res) => {
  try {
    const validation = createMatchSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
      });
    }

    const result = await matchService.createMatch(
      validation.data.profileId,
      validation.data.jobId
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
 * GET /api/match/:id
 * Get a saved match report by ID
 * @param {string} id - Match CUID
 * @returns {Object} { success: true, data: { id, profileId, jobId, resultData, matchScore, createdAt, updatedAt } }
 */
router.get('/:id', async (req, res) => {
  try {
    const validation = matchIdSchema.safeParse({ id: req.params.id });
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid match ID format',
      });
    }

    const result = await matchService.getById(validation.data.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Match not found',
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
