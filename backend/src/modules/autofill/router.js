const express = require('express');
const { z } = require('zod');
const autofillService = require('./service');

const router = express.Router();

const generateSchema = z.object({
  profileId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  pageContext: z.object({
    url: z.string().optional(),
    html: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
  fields: z.array(z.object({
    label: z.string().min(1),
    type: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.string()).nullable().optional(),
    placeholder: z.string().nullable().optional(),
  })).optional(),
});

const injectSchema = z.object({
  profileId: z.string().min(1),
  url: z.string().min(1),
  html: z.string().min(1),
});

const saveAnswersSchema = z.object({
  profileId: z.string().min(1),
  answers: z.array(z.object({
    label: z.string().min(1),
    answer: z.string(),
  })).min(1),
});

/**
 * POST /api/autofill/generate
 * Generate autofill answers for form fields using LLM + profile context
 * New architecture: accepts HTML and extracts fields if not provided
 */
router.post('/generate', async (req, res, next) => {
  try {
    const { profileId, jobId, pageContext = {}, fields } = generateSchema.parse(req.body);
    
    // If fields not provided but HTML is, extract fields first
    let finalFields = fields;
    if (!fields && pageContext?.html) {
      const jobService = require('../job/service');
      const analyzeResult = await jobService.analyzeAndExtractFields(
        pageContext.url || '',
        pageContext.html,
        profileId
      );
      finalFields = analyzeResult.fields;
    }
    
    if (!finalFields || finalFields.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to process' });
    }
    
    const result = await autofillService.generateAnswers(profileId, finalFields, pageContext);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/**
 * POST /api/autofill/inject
 * v2: Receives full HTML + profileId, returns injection instructions (selector, value, type)
 */
router.post('/inject', async (req, res, next) => {
  try {
    const { profileId, url, html } = injectSchema.parse(req.body);
    const result = await autofillService.generateInjections(profileId, url, html);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

/**
 * POST /api/autofill/save-answers
 * Persist user-filled answers for missing fields into the profile for future reuse
 */
router.post('/save-answers', async (req, res, next) => {
  console.log('[save-answers] Received request:', req.body);
  
  // Add CORS headers directly
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  try {
    const { profileId, answers } = saveAnswersSchema.parse(req.body);
    console.log('[save-answers] Parsed - profileId:', profileId, 'answers:', answers.length);
    const result = await autofillService.saveMissingAnswers(profileId, answers);
    console.log('[save-answers] Saved successfully');
    res.json({ success: true, data: result });
  } catch (err) {
    console.log('[save-answers] Error:', err.message);
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

// Explicit OPTIONS handler for CORS preflight
router.options('/save-answers', (req, res) => {
  console.log('[save-answers] OPTIONS preflight');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(200);
});

/**
 * GET /api/autofill/saved-answers/:profileId
 * Get all saved extra answers for a profile
 */
router.get('/saved-answers/:profileId', async (req, res, next) => {
  try {
    const profileId = req.params.profileId;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'Profile ID required' });
    }
    const result = await autofillService.getSavedAnswers(profileId);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

/**
 * DELETE /api/autofill/clear-answers/:profileId
 * Clear all saved extra answers for a profile
 */
router.delete('/clear-answers/:profileId', async (req, res, next) => {
  try {
    const profileId = req.params.profileId;
    if (!profileId) {
      return res.status(400).json({ success: false, error: 'Profile ID required' });
    }
    await autofillService.clearSavedAnswers(profileId);
    res.json({ success: true, message: 'All saved answers cleared' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/autofill/delete-answer/:profileId
 * Delete a single saved answer by label
 */
router.delete('/delete-answer/:profileId', async (req, res, next) => {
  try {
    const profileId = req.params.profileId;
    const { label } = req.body;
    if (!profileId || !label) {
      return res.status(400).json({ success: false, error: 'Profile ID and label required' });
    }
    await autofillService.deleteSavedAnswer(profileId, label);
    res.json({ success: true, message: 'Answer deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/autofill/saved-answers
 * Clear all stored extra answers for a profile (reset for fresh LLM generation)
 */
router.delete('/saved-answers', async (req, res, next) => {
  try {
    const profileId = z.string().min(1).parse(req.body.profileId || req.query.profileId);
    const result = await autofillService.clearSavedAnswers(profileId);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

module.exports = router;
