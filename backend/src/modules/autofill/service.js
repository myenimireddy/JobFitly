'use strict';

const { prisma } = require('../../lib/prisma');
const LLMFactory = require('../../llm/factory');
const { sanitizeProfile, restoreAnswers, restoreScrubbedContacts, isCloudProvider } = require('../../lib/piiSanitizer');
const config = require('../../config');
const {
  canonicalKey,
  storageKeyForAnswer,
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
- For cover letter / "why interested" / experience / partnerships / ecosystem questions:
  write 2-4 sentences grounded only in skills, roles, companies, and achievements already in the profile.
  Do not invent employers, investors, labs, or deals that are not in the profile.
- For yes/no, radio, or select: pick only from the provided options, or return null.
- Answers must be strings or null.

Always return a JSON array with exactly one object per input field (even if there is only one field):
[{ "label": "<field label>", "answer": "<string or null>", "missing": false }]
Never return a bare object.`;
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
  const parsed = parseProfile(row);
  restoreScrubbedContacts(parsed, row.rawText);
  return { row, id, parsed };
}

class AutofillService {
  async generateAnswers(profileId, fields, pageContext, fillMode = 'required-only') {
    const { parsed } = await loadProfile(profileId);
    const extraAnswers = parsed.extraAnswers || {};

    // Required-only skips only confirmed optional fields. Unknown requirement
    // stays in the queue for human review rather than being silently dropped.
    const eligibleFields = fillMode === 'required-only'
      ? fields.filter((field) => field.requiredStatus !== 'optional')
      : fields;
    const optionalSkipped = fields.length - eligibleFields.length;

    const planned = eligibleFields.map((f) => ({ field: f, plan: planField(f, parsed, extraAnswers) }))
      .filter((x) => !x.plan.skip);

    const ready = planned.filter((x) => !x.plan.needsLLM);
    const needsLLM = planned.filter((x) => x.plan.needsLLM);

    const cloud = isCloudProvider();
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
      fillMode,
      requirementStats: {
        detected: fields.length,
        processed: eligibleFields.length,
        optionalSkipped,
        unknownReviewed: eligibleFields.filter((field) => field.requiredStatus === 'unknown').length,
      },
    };
  }

  /**
   * On-demand draft for one HITL field (user clicked Ask AI).
   * Always attempts the LLM; never auto-injects — caller still reviews.
   */
  async draftFieldAnswer(profileId, field, pageContext) {
    const { parsed } = await loadProfile(profileId);
    const extraAnswers = parsed.extraAnswers || {};
    const plan = planField(field, parsed, extraAnswers);

    if (plan.skip) {
      return { label: field.label, answer: null, missing: true, source: null };
    }

    try {
      const { sanitized, restore } = sanitizeProfile(parsed);
      const llm = LLMFactory.create();
      const raw = await llm.extract(
        buildSystemPrompt(),
        buildUserPrompt(sanitized, [field], pageContext || {}),
      );
      const parsedList = parseLlmList(raw);
      const restored = restoreAnswers(parsedList, restore);
      const llmItem = restored.find((i) => i.label === field.label)
        || restored.find((i) => canonicalKey(i.label) === canonicalKey(field.label))
        || restored[0]
        || { answer: null };
      const applied = applyLlmAnswer({ ...plan, needsLLM: true }, llmItem);
      return {
        label: field.label,
        answer: applied.answer,
        missing: !applied.answer,
        source: applied.answer ? 'llm' : null,
        bucket: applied.answer ? 'ask' : 'missing',
      };
    } catch (err) {
      console.warn('[autofill] draftFieldAnswer failed:', err.message);
      throw Object.assign(
        new Error(err.message || 'AI draft failed — try again or type your answer'),
        { statusCode: 502 },
      );
    }
  }

  async saveMissingAnswers(profileId, userAnswers) {
    const { row, parsed } = await loadProfile(profileId);
    const extraAnswers = { ...(parsed.extraAnswers || {}) };
    let saved = 0;

    userAnswers.forEach(({ label, answer }) => {
      if (!label || !answer) return;
      if (isBadLabel(label)) return;
      const val = String(answer).trim();
      if (val.length === 0) return;
      if (/^\d+$/.test(val) && val.length < 3) return;
      if (/^\[.*\]$/.test(val)) return;
      const allowsDial = /country|phone|dial|calling/i.test(label);
      // Never persist dial codes onto orientation / gender / ethnicity / etc.
      if (!allowsDial && (/^\+\d{1,4}$/.test(val) || (/\+\d{1,4}\b/.test(val) && val.length <= 48))) {
        return;
      }
      // Dial "Country*" → phone_country so it cannot poison address Country.
      extraAnswers[storageKeyForAnswer(label, val)] = val;
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
