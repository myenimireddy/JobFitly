'use strict';

const { prisma } = require('../../lib/prisma');
const LLMFactory = require('../../llm/factory');
const { sanitizeProfile, restoreAnswers, isCloudProvider } = require('../../lib/piiSanitizer');
const config = require('../../config');
const {
  canonicalKey,
  isBadLabel,
  planField,
  applyLlmAnswer,
  parseLlmList,
} = require('./logic');

function buildSystemPrompt() {
  return `You are a job application assistant.
Use only facts from the candidate profile. Do not invent salary, visa, dates, or yes/no legal answers.

PRIVACY:
- Profile may contain tokens like [CANDIDATE_NAME]. Copy them as-is.

Rules:
- If you cannot answer from the profile, set "answer" to null and "missing" to true.
- For cover letter / "why interested" fields: 2-3 sentences using skills already in the profile.
- For yes/no, radio, or select: pick only from the provided options, or return null.
- Answers must be strings or null.

Return ONLY a JSON array:
[{ "label": "<field label>", "answer": "<string or null>", "missing": false }]`;
}

function buildUserPrompt(sanitizedProfile, fields, pageContext) {
  return `## Candidate Profile
${JSON.stringify(sanitizedProfile, null, 2)}

## Job Page Context
URL: ${(pageContext && pageContext.url) || 'unknown'}
Title: ${(pageContext && pageContext.title) || 'unknown'}

## Form Fields to Fill
${JSON.stringify(fields.map((f) => ({
    label: f.label,
    type: f.type,
    required: f.required,
    options: f.options || undefined,
  })), null, 2)}

Return a JSON array with an answer for each field.`;
}

function parseProfile(row) {
  return typeof row.parsedData === 'string' ? JSON.parse(row.parsedData) : row.parsedData;
}

async function loadProfile(profileId) {
  let id = profileId;
  if (profileId === 'current') {
    const latest = await prisma.profile.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!latest) throw Object.assign(new Error('No profiles found'), { statusCode: 404 });
    id = latest.id;
  }
  const row = await prisma.profile.findUnique({ where: { id } });
  if (!row) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });
  return { row, id, parsed: parseProfile(row) };
}

class AutofillService {
  async generateAnswers(profileId, fields, pageContext) {
    const { parsed } = await loadProfile(profileId);
    const extraAnswers = parsed.extraAnswers || {};

    const planned = fields.map((f) => ({ field: f, plan: planField(f, parsed, extraAnswers) }))
      .filter((x) => !x.plan.skip);

    const ready = planned.filter((x) => !x.plan.needsLLM);
    const needsLLM = planned.filter((x) => x.plan.needsLLM);

    const cloud = isCloudProvider(config);
    let llmByLabel = new Map();

    if (needsLLM.length > 0) {
      try {
        const { sanitized, restore } = sanitizeProfile(parsed);
        const llm = LLMFactory.create();
        const raw = await llm.extract(
          buildSystemPrompt(),
          buildUserPrompt(sanitized, needsLLM.map((x) => x.field), pageContext || {}),
        );
        const parsedList = parseLlmList(raw);
        const restored = restoreAnswers(parsedList, restore);
        restored.forEach((item) => llmByLabel.set(item.label, item));
      } catch (err) {
        console.warn('[autofill] LLM skipped, open fields stay missing:', err.message);
      }
    }

    const answers = planned.map(({ field, plan }) => {
      if (!plan.needsLLM) return plan;
      const llmItem = llmByLabel.get(field.label)
        || [...llmByLabel.values()].find((i) => canonicalKey(i.label) === canonicalKey(field.label));
      return applyLlmAnswer(plan, llmItem || { answer: null });
    });

    const missingFields = answers
      .filter((a) => a.missing || !a.answer)
      .map((a) => ({ label: a.label, answer: null, bucket: 'missing' }));

    return {
      answers,
      missingFields,
      privacyMode: cloud ? 'cloud' : 'local',
    };
  }

  async saveMissingAnswers(profileId, userAnswers) {
    const { row, parsed } = await loadProfile(profileId);
    const extraAnswers = { ...(parsed.extraAnswers || {}) };
    let saved = 0;

    userAnswers.forEach(({ label, answer }) => {
      if (!label || !answer) return;
      if (isBadLabel(label)) return;
      const val = String(answer).trim();
      if (val.length <= 1) return;
      if (/^\d+$/.test(val) && val.length < 3) return;
      if (/^\[.*\]$/.test(val)) return;
      extraAnswers[canonicalKey(label)] = val;
      saved += 1;
    });

    await prisma.profile.update({
      where: { id: row.id },
      data: { parsedData: JSON.stringify({ ...parsed, extraAnswers }) },
    });

    return { saved };
  }

  async getSavedAnswers(profileId) {
    const { row, id, parsed } = await loadProfile(profileId);
    const extraAnswers = parsed.extraAnswers || {};
    const answers = Object.entries(extraAnswers).map(([label, answer], index) => ({
      id: index,
      label,
      answer,
      portal: 'generic',
      createdAt: row.updatedAt || new Date(),
    }));
    return { answers, count: answers.length, profileId: id };
  }

  async clearSavedAnswers(profileId) {
    const { row, parsed } = await loadProfile(profileId);
    const { extraAnswers, ...rest } = parsed;
    await prisma.profile.update({
      where: { id: row.id },
      data: { parsedData: JSON.stringify(rest) },
    });
    return { cleared: true };
  }

  async deleteSavedAnswer(profileId, label) {
    const { row, parsed } = await loadProfile(profileId);
    const extraAnswers = { ...(parsed.extraAnswers || {}) };
    delete extraAnswers[canonicalKey(label)];
    delete extraAnswers[(label || '').toLowerCase().trim()];
    await prisma.profile.update({
      where: { id: row.id },
      data: { parsedData: JSON.stringify({ ...parsed, extraAnswers }) },
    });
    return { deleted: true };
  }
}

module.exports = new AutofillService();
