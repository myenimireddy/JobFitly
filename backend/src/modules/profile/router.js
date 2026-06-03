const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const profileService = require('./service');

const router = express.Router();

// Configure multer for PDF uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

// Validation schemas
const profileIdSchema = z.object({
  id: z.string().cuid(),
});

/**
 * POST /api/profile/upload
 * Upload and parse a PDF resume
 * @param {File} resume - PDF file in multipart/form-data
 * @returns {Object} { success: true, data: { id, rawText, parsedData } }
 */
router.post('/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'No PDF file uploaded. Field name must be "resume"',
      });
    }

    const result = await profileService.uploadAndParse(req.file.buffer);
    
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
 * GET /api/profile/:id
 * Get a saved profile by ID
 * @param {string} id - Profile CUID
 * @returns {Object} { success: true, data: { id, rawText, parsedData, createdAt, updatedAt } }
 */
router.get('/:id', async (req, res) => {
  try {
    const validation = profileIdSchema.safeParse({ id: req.params.id });
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid profile ID format',
      });
    }

    const result = await profileService.getById(validation.data.id);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'Profile not found',
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

/**
 * PATCH /api/profile/:id
 * Update parsedData for a profile (user corrections after parsing)
 * @param {string} id - Profile CUID
 * @body {Object} parsedData - Full updated parsedData object
 */
router.patch('/:id', async (req, res) => {
  try {
    const validation = profileIdSchema.safeParse({ id: req.params.id });
    if (!validation.success) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid profile ID format' });
    }

    const { parsedData } = req.body;
    if (!parsedData || typeof parsedData !== 'object') {
      return res.status(400).json({ success: false, data: null, error: 'parsedData object is required' });
    }

    const result = await profileService.updateParsedData(validation.data.id, parsedData);
    res.json({ success: true, data: result, error: null });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, data: null, error: 'Profile not found' });
    }
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

/**
 * DELETE /api/profile/:id
 * Permanently delete a profile and its associated matches
 */
router.delete('/:id', async (req, res) => {
  try {
    const validation = profileIdSchema.safeParse({ id: req.params.id });
    if (!validation.success) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid profile ID format' });
    }
    await profileService.deleteProfile(validation.data.id);
    res.json({ success: true, data: null, error: null });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, data: null, error: 'Profile not found' });
    }
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

module.exports = router;
