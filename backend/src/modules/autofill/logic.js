'use strict';

/**
 * Small, testable autofill rules.
 * Fill only from the profile or a saved answer. Never invent facts.
 */

function normalizeKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[*:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Labels that mean the same question
const SAME_MEANING = [
  ['authorized to work', 'authorised to work', 'eligible to work', 'right to work', 'work authorization', 'work authorisation'],
  ['require sponsorship', 'need sponsorship', 'visa sponsorship'],
];

function canonicalKey(label) {
  const n = normalizeKey(label);
  for (const group of SAME_MEANING) {
    if (group.some((phrase) => n.includes(phrase))) return group[0];
  }
  return n;
}

function lookupStored(extraAnswers, label) {
  if (!extraAnswers) return null;
  const want = canonicalKey(label);
  for (const [key, value] of Object.entries(extraAnswers)) {
    if (!value) continue;
    if (canonicalKey(key) === want) return String(value);
  }
  return null;
}

const BAD_LABEL_PATTERNS = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /^(start typing|pick date|type here|search|enter)(\.\.\.)?$/i,
  /i acknowledge that i have opened|i confirm i have read/i,
];

function isBadLabel(label) {
  return BAD_LABEL_PATTERNS.some((p) => p.test((label || '').trim()));
}

/** These fields must never be guessed by the LLM. */
function isFactOnlyField(label) {
  const n = normalizeKey(label);
  return (
    /salary|compensation|\bpay\b/.test(n)
    || /sponsorship|visa/.test(n)
    || /authorized to work|eligible to work|right to work/.test(n)
    || /start date|available to start|when can you start|notice period/.test(n)
    || /on.?site|in.?person|days? per week/.test(n)
    || /timezone|time zone/.test(n)
  );
}

/**
 * Map a label to profile data. Returns null when the profile has no fact.
 */
function resolveFromProfile(label, profile) {
  if (!profile) return null;
  const n = normalizeKey(label);
  const pi = profile.personalInfo || {};
  const work = profile.workExperience || [];
  const current = work[0] || {};

  if (/\bemail\b/.test(n)) return pi.email || null;
  if (/\b(phone|mobile|cell|telephone)\b/.test(n)) return pi.phone || null;
  if (/\blinkedin\b/.test(n)) return pi.linkedin || null;
  if (/\b(website|portfolio|github)\b/.test(n) && !n.includes('company')) return pi.website || null;
  if (/first name/.test(n)) return pi.firstName || (pi.fullName || '').split(' ')[0] || null;
  if (/last name|surname/.test(n)) return pi.lastName || (pi.fullName || '').split(' ').slice(1).join(' ') || null;
  if (/full name|your name/.test(n) && !n.includes('company')) return pi.fullName || null;
  if (n === 'name') return pi.fullName || null;
  if (/\b(location|city|where do you live)\b/.test(n) && !n.includes('time')) return pi.location || null;
  if (/current company|current employer/.test(n)) return current.company || null;
  if (/current title/.test(n)) return current.title || null;

  if (/require sponsorship|need sponsorship|visa sponsorship/.test(n)) {
    if (typeof profile.sponsorshipRequired === 'boolean') {
      return profile.sponsorshipRequired ? 'Yes' : 'No';
    }
    return null;
  }
  if (/authorized to work|eligible to work|right to work/.test(n)) {
    if (typeof profile.sponsorshipRequired === 'boolean') {
      return profile.sponsorshipRequired ? 'No' : 'Yes';
    }
    return null;
  }
  if (/start date|available to start|when can you start/.test(n)) {
    return profile.availableFrom || null;
  }
  return null;
}

/**
 * Decide how to handle a field before calling the LLM.
 * bucket: known | missing
 * needsLLM: only open-text fields with no saved/profile value
 */
function planField(field, profile, extraAnswers) {
  const label = field.label;
  if (isBadLabel(label)) {
    return { label, answer: null, missing: true, bucket: 'missing', source: null, skip: true };
  }

  const stored = lookupStored(extraAnswers, label);
  if (stored) {
    return { label, answer: stored, missing: false, bucket: 'known', source: 'stored', skip: false };
  }

  const fromProfile = resolveFromProfile(label, profile);
  if (fromProfile) {
    return { label, answer: fromProfile, missing: false, bucket: 'known', source: 'profile', skip: false };
  }

  if (isFactOnlyField(label)) {
    return { label, answer: null, missing: true, bucket: 'missing', source: null, skip: false, needsLLM: false };
  }

  return { label, answer: null, missing: true, bucket: 'missing', source: null, skip: false, needsLLM: true };
}

function applyLlmAnswer(plan, llmItem) {
  let answer = llmItem && llmItem.answer;
  if (typeof answer === 'number' || (typeof answer === 'string' && /^\d$/.test(answer.trim()))) {
    answer = null;
  }
  if (answer !== null && answer !== undefined) {
    answer = String(answer).trim();
  }
  if (!answer) {
    return { ...plan, answer: null, missing: true, bucket: 'missing', source: null };
  }
  // LLM text is a draft — human must review (ask), never silent-known
  return { ...plan, answer, missing: false, bucket: 'ask', source: 'llm' };
}

function parseLlmList(raw) {
  const cleaned = String(raw || '').trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/);
  const jsonStr = fenced ? fenced[1].trim() : cleaned;
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error('LLM did not return a JSON array');
  }
  return parsed;
}

module.exports = {
  normalizeKey,
  canonicalKey,
  lookupStored,
  isBadLabel,
  isFactOnlyField,
  resolveFromProfile,
  planField,
  applyLlmAnswer,
  parseLlmList,
};
