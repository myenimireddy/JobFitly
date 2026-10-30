'use strict';

const express = require('express');
const { z } = require('zod');
const autofillService = require('./service');

const router = express.Router();

const generateSchema = z.object({
  profileId: z.string().min(1),
  pageContext: z.object({
    url: z.string().optional(),
    title: z.string().optional(),
  }).optional(),
  fields: z.array(z.object({
    label: z.string().min(1),
    type: z.string().optional(),
    required: z.boolean().optional(),
    options: z.array(z.string()).nullable().optional(),
    placeholder: z.string().nullable().optional(),
  })),
});

const saveAnswersSchema = z.object({
  profileId: z.string().min(1),
  answers: z.array(z.object({
    label: z.string().min(1),
    answer: z.string(),
  })).min(1),
});

router.post('/generate', async (req, res, next) => {
  try {
    const { profileId, pageContext = {}, fields } = generateSchema.parse(req.body);
    if (!fields.length) {
      return res.status(400).json({ success: false, error: 'No fields to process' });
    }
    const result = await autofillService.generateAnswers(profileId, fields, pageContext);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

router.post('/save-answers', async (req, res, next) => {
  try {
    const { profileId, answers } = saveAnswersSchema.parse(req.body);
    const result = await autofillService.saveMissingAnswers(profileId, answers);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ success: false, error: err.errors[0].message });
    }
    next(err);
  }
});

router.get('/saved-answers/:profileId', async (req, res, next) => {
  try {
    const result = await autofillService.getSavedAnswers(req.params.profileId);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ success: false, error: err.message });
    }
    next(err);
  }
});

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

router.delete('/delete-answer/:profileId', async (req, res, next) => {
  try {
    const { label } = req.body;
    if (!label) {
      return res.status(400).json({ success: false, error: 'label required' });
    }
    await autofillService.deleteSavedAnswer(req.params.profileId, label);
    res.json({ success: true, message: 'Answer deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
