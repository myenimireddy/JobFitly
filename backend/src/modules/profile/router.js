/**
 * Profile HTTP routes: resume upload/parse, CRUD, application-profile fields.
 * Parsing uses LLMFactory (Groq or Ollama); catalog lives in applicationFields.js.
 */
const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const profileService = require('./service');

const router = express.Router();

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
router.post('/upload', (req, res, next) => {
  req.setTimeout(20 * 60 * 1000);
  res.setTimeout(20 * 60 * 1000);
  next();
}, upload.single('resume'), async (req, res) => {
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
 * GET /api/profile
 * Summaries for profile switcher (id, name, captureComplete) — no rawText.
 */
router.get('/', async (req, res) => {
  try {
    const data = await profileService.listSummaries();
    res.json({ success: true, data, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

/**
 * GET /api/profile/latest
 * Newest complete resume, or newest row if none are marked complete.
 * Prefer explicit profile id in the extension; use this only when the user opts in.
 */
router.get('/latest', async (req, res) => {
  try {
    const result = await profileService.getLatest();
    if (!result) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'No profile yet. Upload a resume in the web app or extension.',
      });
    }
    res.json({ success: true, data: result, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

/**
 * GET /api/profile/:id/application-capture
 * Consolidated ATS fields to collect after resume parse.
 * (Must be registered before GET /:id)
 */
router.get('/:id/application-capture', async (req, res) => {
  try {
    const validation = profileIdSchema.safeParse({ id: req.params.id });
    if (!validation.success) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid profile ID format' });
    }
    const data = await profileService.getApplicationCapture(validation.data.id);
    if (!data) {
      return res.status(404).json({ success: false, data: null, error: 'Profile not found' });
    }
    res.json({ success: true, data, error: null });
  } catch (error) {
    res.status(500).json({ success: false, data: null, error: error.message });
  }
});

/**
 * PUT /api/profile/:id/application-profile
 * Save consolidated portal answers (phone as {country, countryCode, nationalNumber}).
 */
router.put('/:id/application-profile', async (req, res) => {
  try {
    const validation = profileIdSchema.safeParse({ id: req.params.id });
    if (!validation.success) {
      return res.status(400).json({ success: false, data: null, error: 'Invalid profile ID format' });
    }
    const body = req.body?.applicationProfile || req.body || {};
    const result = await profileService.saveApplicationProfile(validation.data.id, body);
    const capture = await profileService.getApplicationCapture(validation.data.id);
    res.json({ success: true, data: { profile: result, capture }, error: null });
  } catch (error) {
    const status = error.statusCode || (error.code === 'P2025' ? 404 : 500);
    res.status(status).json({ success: false, data: null, error: error.message });
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
