'use strict';

const { isContactPlaceholder } = require('../../lib/piiSanitizer');

/**
 * Autofill planner
 *
 * 1. Flatten the profile into a small fact map once.
 * 2. Classify each form label into one intent (data, not per-ATS ifs).
 * 3. Policy decides the bucket:
 *      profile → fill from facts if present
 *      human   → never LLM, wait for the person (or a saved answer)
 *      llm     → draft only, human still reviews
 *
 * New ATS wording = add a phrase on an existing intent. Do not add a new if-branch.
 */

function normalizeKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[*:()?!,.'"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Longest matching phrase wins, so "current company" beats "name".
 * policy: profile | human | llm
 * fact: key in buildFacts() when policy is profile (or optional human fact)
 */
const INTENTS = [
  { id: 'email', policy: 'profile', fact: 'email', any: ['email'] },
  // Longer phrases first via longest-match — country phone code must beat plain "phone".
  { id: 'phone_extension', policy: 'human', any: ['phone extension', 'ext.'] },
  { id: 'phone_country', policy: 'profile', fact: 'phoneCountryLabel', any: ['country phone code', 'phone country', 'dial code', 'calling code'] },
  { id: 'phone_device', policy: 'profile', fact: 'phoneDeviceType', any: ['phone device type', 'phone type', 'device type'] },
  { id: 'phone', policy: 'profile', fact: 'phone', any: ['phone number', 'phone', 'mobile', 'cell', 'telephone'] },
  { id: 'address1', policy: 'profile', fact: 'address1', any: ['address line 1', 'street address', 'address 1'] },
  { id: 'address2', policy: 'profile', fact: 'address2', any: ['address line 2', 'address 2'] },
  { id: 'postal', policy: 'profile', fact: 'postal', any: ['postal code', 'zip code', 'zip'] },
  { id: 'linkedin', policy: 'profile', fact: 'linkedin', any: ['linkedin'] },
  { id: 'website', policy: 'profile', fact: 'website', any: ['website', 'portfolio', 'github'] },
  { id: 'preferred_name', policy: 'profile', fact: 'preferredName', any: ['preferred first name', 'preferred name'] },
  { id: 'first_name', policy: 'profile', fact: 'firstName', any: ['first name'] },
  { id: 'last_name', policy: 'profile', fact: 'lastName', any: ['last name', 'surname'] },
  { id: 'full_name', policy: 'profile', fact: 'fullName', any: ['full name', 'legal name', 'your name'] },
  { id: 'country', policy: 'profile', fact: 'country', any: ['country', 'nation'] },
  { id: 'state', policy: 'profile', fact: 'state', any: ['state', 'province', 'region'] },
  { id: 'city', policy: 'profile', fact: 'city', any: ['city', 'where do you live', 'location', 'working from', 'plan on working', 'current location'] },
  { id: 'current_company', policy: 'profile', fact: 'currentCompany', any: ['current company', 'current employer', 'most recent company', 'recent employer'] },
  { id: 'current_title', policy: 'profile', fact: 'currentTitle', any: ['current title', 'current role', 'current job title', 'most recent title'] },
  { id: 'work_auth', policy: 'human', fact: 'workAuth', any: ['authorized to work', 'authorised to work', 'eligible to work', 'right to work', 'work authorization', 'work authorisation'] },
  { id: 'sponsorship', policy: 'human', fact: 'sponsorship', any: ['require sponsorship', 'need sponsorship', 'visa sponsorship', 'immigration sponsorship', 'sponsorship'] },
  { id: 'age_18', policy: 'human', fact: 'age18Plus', any: ['18 or over', '18 years', 'over 18'] },
  { id: 'prior_employer', policy: 'human', fact: 'previouslyEmployed', any: ['employed by', 'previously worked', 'former employee', 'worked for this company', 'worked at this company'] },
  { id: 'bay_area', policy: 'human', fact: 'inBayArea', any: ['bay area', 'san francisco bay'] },
  { id: 'salary', policy: 'human', any: ['salary', 'compensation', 'pay expectation', 'expected pay'] },
  { id: 'start_date', policy: 'human', fact: 'availableFrom', any: ['start date', 'available to start', 'when can you start', 'notice period'] },
  { id: 'onsite', policy: 'human', any: ['on site', 'onsite', 'in person', 'days per week', 'hybrid'] },
  { id: 'timezone', policy: 'human', any: ['timezone', 'time zone'] },
  { id: 'source', policy: 'human', fact: 'hearAbout', any: ['how did you hear', 'heard about', 'referral source'] },
  { id: 'pronouns', policy: 'human', fact: 'pronouns', any: ['pronouns'] },
  { id: 'gender', policy: 'human', fact: 'gender', any: ['gender identity', 'gender'] },
  { id: 'transgender', policy: 'human', fact: 'transgender', any: ['transgender'] },
  { id: 'orientation', policy: 'human', fact: 'orientation', any: ['sexual orientation'] },
  { id: 'ethnicity', policy: 'human', fact: 'ethnicity', any: ['ethnicity', 'ethnicit', 'race', 'hispanic', 'latino'] },
  { id: 'disability', policy: 'human', fact: 'disability', any: ['disability', 'ada'] },
  { id: 'veteran', policy: 'human', fact: 'veteran', any: ['veteran', 'served in the military', 'military service'] },
  { id: 'consent', policy: 'human', any: ['i agree', 'i consent', 'by selecting', 'by checking this box', 'consent to'] },
];

const OPEN_INTENT = { id: 'open', policy: 'llm', any: [] };

function optionsLookLikeDialCodes(options) {
  if (!options || !options.length) return false;
  const sample = options.slice(0, 12).map((o) => String(o));
  const withPlus = sample.filter((o) => /\+\d{1,4}\b/.test(o)).length;
  return withPlus >= Math.min(2, sample.length);
}

function classifyIntent(label, options) {
  const n = normalizeKey(label);
  let best = OPEN_INTENT;
  let bestLen = 0;
  for (const intent of INTENTS) {
    for (const phrase of intent.any) {
      if (phrase.length > bestLen && n.includes(phrase)) {
        best = intent;
        bestLen = phrase.length;
      }
    }
  }
  if (best.id === 'open' && n === 'name') {
    return INTENTS.find((i) => i.id === 'full_name');
  }
  // Greenhouse "Country*" beside phone is a dial-code widget, not address country.
  if (best.id === 'country' && optionsLookLikeDialCodes(options)) {
    return INTENTS.find((i) => i.id === 'phone_country');
  }
  return best;
}

function canonicalKey(label, options = null) {
  const intent = classifyIntent(label, options);
  if (intent.id !== 'open') return intent.id;
  return normalizeKey(label);
}

/**
 * Persist key for an answer. Dial-looking "Country*" values must not share the
 * address-country bucket (otherwise United States +1 poisons mailing Country).
 */
function storageKeyForAnswer(label, answer, options = null) {
  let key = canonicalKey(label, options);
  if (optionsLookLikeDialCodes(options)) key = 'phone_country';
  if (looksLikeDialCodeAnswer(answer) && (key === 'country' || key === 'phone_country')) {
    return 'phone_country';
  }
  return key;
}

function lookupStored(extraAnswers, label, options = null) {
  if (!extraAnswers) return null;
  const want = canonicalKey(label, options);
  const dialField = want === 'phone_country' || optionsLookLikeDialCodes(options);

  if (dialField) {
    if (extraAnswers.phone_country) return String(extraAnswers.phone_country);
    // Legacy saves wrote dial codes under `country`.
    if (extraAnswers.country && looksLikeDialCodeAnswer(extraAnswers.country)) {
      return String(extraAnswers.country);
    }
  }

  for (const [key, value] of Object.entries(extraAnswers)) {
    if (!value) continue;
    const keyCanon = key === 'country' || key === 'phone_country' ? key : canonicalKey(key);
    if (key !== want && keyCanon !== want) continue;
    // Address country must never reuse a dial-code string.
    if (want === 'country' && looksLikeDialCodeAnswer(value)) continue;
    return String(value);
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

function locationFrom(profile) {
  const pi = profile.personalInfo || {};
  if (pi.location) return pi.location;
  const job = (profile.workExperience || []).find((w) => w && w.location);
  return (job && job.location) || '';
}

function nationalPhone(phone) {
  if (!phone) return null;
  if (typeof phone === 'object') {
    const n = String(phone.nationalNumber || phone.number || '').replace(/\D/g, '');
    if (n.length >= 10) return n.slice(-10);
    return n || null;
  }
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(-10);
  return digits || null;
}

function phoneObject(profile) {
  const ap = profile.applicationProfile || {};
  const raw = ap.phone || (profile.personalInfo || {}).phone;
  if (raw && typeof raw === 'object') {
    return {
      country: raw.country || ap.country || '',
      countryCode: raw.countryCode || '',
      nationalNumber: nationalPhone(raw) || '',
    };
  }
  const digits = String(raw || '').replace(/\D/g, '');
  let national = digits;
  let countryCode = '';
  if (digits.length === 11 && digits.startsWith('1')) {
    national = digits.slice(1);
    countryCode = '+1';
  } else if (digits.length >= 10) {
    national = digits.slice(-10);
    countryCode = '+1';
  }
  return {
    country: ap.country || '',
    countryCode,
    nationalNumber: national,
  };
}

function cityFrom(loc) {
  if (!loc) return null;
  return String(loc).split(',')[0].trim() || null;
}

function countryFrom(loc) {
  if (!loc) return null;
  const s = String(loc);
  if (/\b(united states|u\.s\.a\.|\busa\b|u\.s\.)\b/i.test(s)) return 'United States';
  const last = s.split(',').pop().trim();
  if (/^[A-Z]{2}$/i.test(last)) return 'United States';
  const city = cityFrom(s);
  if (last && city && last.toLowerCase() !== city.toLowerCase()) {
    if (/ohio|texas|california|florida|washington/i.test(last)) return 'United States';
    return last;
  }
  return null;
}

function yn(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (/^yes$/i.test(s)) return 'Yes';
  if (/^no$/i.test(s)) return 'No';
  return s;
}

/** One snapshot of values the form can use. Not one function per label. */
function buildFacts(profile) {
  if (!profile) return {};
  const pi = profile.personalInfo || {};
  const ap = profile.applicationProfile || {};
  const current = (profile.workExperience || [])[0] || {};
  const loc = ap.location || locationFrom(profile);
  const parts = (pi.fullName || '').split(' ').filter(Boolean);
  const rawCompany = current.company || '';
  const companyOnly = rawCompany.split(',')[0].trim() || null;
  const phone = phoneObject(profile);

  let workAuth = yn(ap.workAuthUS);
  let sponsorship = yn(ap.sponsorshipRequired);
  if (sponsorship == null && typeof profile.sponsorshipRequired === 'boolean') {
    sponsorship = profile.sponsorshipRequired ? 'Yes' : 'No';
    workAuth = workAuth || (profile.sponsorshipRequired ? 'No' : 'Yes');
  }

  const dial = phone.countryCode || '';
  const phoneCountryLabel = phone.country && dial
    ? `${phone.country} ${dial}`.trim()
    : (phone.country || dial || null);

  return {
    email: pi.email && !isContactPlaceholder(pi.email) ? pi.email : null,
    phone: phone.nationalNumber || null,
    phoneCountryLabel,
    phoneDeviceType: ap.phoneDeviceType || 'Mobile',
    linkedin: ap.linkedin || pi.linkedin || null,
    website: ap.website || ap.github || pi.website || null,
    fullName: pi.fullName || null,
    preferredName: ap.preferredName || pi.firstName || parts[0] || null,
    firstName: pi.firstName || parts[0] || null,
    lastName: pi.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : null),
    city: ap.city || cityFrom(loc),
    state: ap.state || null,
    country: ap.country || phone.country || countryFrom(loc),
    address1: ap.address1 || null,
    address2: ap.address2 || null,
    postal: ap.postal || ap.zip || null,
    // Bay Area can be inferred from captured city/location (not a capture-catalog field).
    // Prior employer is job-specific — only if explicitly stored; otherwise HITL.
    inBayArea: yn(ap.inBayArea) || (
      /san francisco|bay area|\boakland\b|\bsf\b|san jose|palo alto|mountain view/i.test(
        `${ap.city || ''} ${loc || ''}`,
      ) ? 'Yes' : (ap.city || loc ? 'No' : null)
    ),
    previouslyEmployed: yn(ap.previouslyEmployed),
    currentCompany: companyOnly,
    currentTitle: current.title || null,
    workAuth,
    sponsorship,
    age18Plus: yn(ap.age18Plus),
    hearAbout: ap.hearAbout || null,
    pronouns: ap.pronouns || null,
    gender: ap.gender || null,
    transgender: yn(ap.transgender) || ap.transgender || null,
    orientation: ap.orientation || null,
    ethnicity: ap.ethnicity || null,
    disability: ap.disability || null,
    veteran: ap.veteran || null,
    availableFrom: ap.availableFrom || profile.availableFrom || null,
  };
}

function looksLikeDialCodeAnswer(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^\+\d{1,4}$/.test(t)) return true;
  if (/\+\d{1,4}\b/.test(t) && t.length <= 48) return true;
  return false;
}

/** True when the live form already has a real value (skip — only fill empties). */
function isPageValueComplete(currentValue, field = {}) {
  const v = String(currentValue ?? '').trim();
  if (!v) return false;
  const ph = String(field.placeholder || '').trim();
  if (ph && normalizeKey(v) === normalizeKey(ph)) return false;
  // Workday select buttons often read "Select Country" / "Select One" when empty.
  if (/^(mm\/yyyy|select(\s+\w+){0,3}|choose(\s+\w+){0,3}|loading|n\/?a|-)$/i.test(v)) return false;
  if (/^select an? option/i.test(v)) return false;
  if (/^(please\s+)?(select|choose)\b/i.test(v) && v.length <= 40) return false;
  return true;
}

function toMonthYear(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^present|current|now$/i.test(s)) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[2].padStart(2, '0')}/${iso[1]}`;
  const my = s.match(/^(\d{1,2})\s*[\/\-]\s*(\d{4})$/);
  if (my) return `${my[1].padStart(2, '0')}/${my[2]}`;
  const monYear = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monYear) {
    const months = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
    const idx = months.split('|').findIndex((m) => monYear[1].toLowerCase().startsWith(m));
    if (idx >= 0) return `${String(idx + 1).padStart(2, '0')}/${monYear[2]}`;
  }
  if (/^\d{4}$/.test(s)) return `01/${s}`;
  return s;
}

/**
 * Work Experience N field → resume slot key, or null if not a WE field.
 * Requires experienceIndex from scrape (do not guess from bare Job Title alone).
 */
function workExperienceSlot(label) {
  const n = normalizeKey(label);
  if (/desired|preferred|target|sought|applying for/.test(n)) return null;
  if (n === 'job title' || n === 'role title' || n === 'title') return 'title';
  if (n === 'company' || n === 'employer' || n === 'company name' || n === 'employer name') return 'company';
  if (n === 'location') return 'location';
  if (n === 'role description' || n === 'job description' || n === 'position description') return 'description';
  if (n === 'from') return 'from';
  if (n === 'to') return 'to';
  if (/currently work here|currently employed|i currently work/.test(n)) return 'current';
  return null;
}

function answerFromWorkExperience(job, slot) {
  if (!job || !slot) return null;
  if (slot === 'title') return job.title || null;
  if (slot === 'company') {
    const raw = job.company || '';
    return raw.split(',')[0].trim() || null;
  }
  if (slot === 'location') return job.location || null;
  if (slot === 'from') return toMonthYear(job.startDate);
  if (slot === 'to') {
    const end = job.endDate || '';
    if (!end || /^present|current|now$/i.test(String(end).trim())) return null;
    return toMonthYear(end);
  }
  if (slot === 'current') {
    const end = job.endDate || '';
    return (!end || /^present|current|now$/i.test(String(end).trim())) ? 'Yes' : 'No';
  }
  if (slot === 'description') {
    const bullets = Array.isArray(job.achievements)
      ? job.achievements.map((a) => String(a || '').trim()).filter(Boolean)
      : [];
    if (bullets.length) {
      return bullets.map((b) => (b.startsWith('•') || b.startsWith('-') ? b : `• ${b}`)).join('\n');
    }
    return job.description || null;
  }
  return null;
}

function snapToOption(answer, options) {
  if (!answer) return null;
  const list = (options || []).map(String).filter(Boolean);
  if (list.length === 0) return String(answer);
  const n = normalizeKey(answer);
  const exact = list.find((o) => normalizeKey(o) === n);
  if (exact) return exact;

  // East/South Asian → portal option; Lever often only has "Asian (Not Hispanic…)"
  if (/\basian\b/i.test(answer) && !/hispanic|latino/i.test(answer)) {
    if (/south\s*asian/i.test(answer)) {
      const south = list.find((o) => /south\s*asian/i.test(o));
      if (south) return south;
    }
    if (/east\s*asian/i.test(answer)) {
      const east = list.find((o) => /east\s*asian/i.test(o));
      if (east) return east;
    }
    const asianNhl = list.find((o) => /asian.*not hispanic|not hispanic.*asian|^asian$/i.test(o));
    if (asianNhl) return asianNhl;
  }

  // Veteran short phrases → long EEO copy
  if (/no military|not a protected veteran|not a veteran|prefer not/i.test(answer)) {
    const vet = list.find((o) => /not a protected veteran|no military|i am not a veteran|decline/i.test(o));
    if (vet) return vet;
  }

  // Short Yes/No → longest matching option that starts with Yes/No (ADA / veteran copy).
  if (/^(yes|no)$/i.test(String(answer).trim())) {
    const head = String(answer).trim().toLowerCase();
    const headed = list
      .filter((o) => o.trim().toLowerCase().startsWith(head))
      .sort((a, b) => b.length - a.length);
    if (headed.length === 1) return headed[0];
    if (headed.length > 1) {
      // Prefer explicit negative disability / non-veteran phrasing when answer is No.
      if (head === 'no') {
        const pref = headed.find((o) => /do not have a disability|not a protected veteran|no military/i.test(o));
        if (pref) return pref;
      }
      return headed[0];
    }
  }

  // Prefer shortest whole-token match ("Asian" over "East Asian").
  // If several options tie (East Asian vs South Asian for "asian"), do not guess.
  const tokenHits = list.filter((o) => {
    return String(o).toLowerCase().split(/[^a-z0-9]+/).some((t) => normalizeKey(t) === n);
  }).sort((a, b) => a.length - b.length);
  if (tokenHits.length === 1) return tokenHits[0];
  if (tokenHits.length > 1) return String(answer);
  if (n.length <= 3) return String(answer);
  const loose = list.find((o) => {
    const on = normalizeKey(o);
    return on.includes(n) || (n.length > 5 && n.includes(on));
  });
  return loose || String(answer);
}

function resolveFromProfile(label, profile, options) {
  const intent = classifyIntent(label, options);
  if (!intent.fact) return null;
  return buildFacts(profile)[intent.fact] || null;
}

function isFactOnlyField(label) {
  return classifyIntent(label).policy === 'human';
}

function isHumanOnlyField(label) {
  return classifyIntent(label).policy === 'human';
}

function fieldOptions(field) {
  if (field.options && field.options.length) return field.options;
  return null;
}

function planField(field, profile, extraAnswers) {
  const label = field.label;
  if (isBadLabel(label)) {
    return { label, answer: null, missing: true, bucket: 'missing', source: null, skip: true };
  }

  const options = fieldOptions(field);
  const intent = classifyIntent(label, options);
  const expIdx = Number.isInteger(field.experienceIndex) ? field.experienceIndex : null;
  const meta = {
    experienceIndex: expIdx,
    section: field.section || null,
    currentValue: field.currentValue ?? null,
  };

  // Already filled on the page → skip (only work empty fields).
  if (isPageValueComplete(field.currentValue, field)) {
    return {
      label, answer: null, missing: false, bucket: 'known', source: 'page', skip: true,
      intent: intent.id, type: field.type || 'text', options, needsLLM: false, ...meta,
    };
  }

  // Work Experience N → workExperience[N] from resume parse.
  const weSlot = workExperienceSlot(label);
  if (weSlot && expIdx != null) {
    const jobs = profile.workExperience || [];
    if (expIdx >= jobs.length) {
      // Extra empty form row — leave blank (user can Skip / ignore).
      return {
        label, answer: null, missing: false, bucket: 'known', source: null, skip: true,
        intent: 'work_experience', type: field.type || 'text', options, needsLLM: false, ...meta,
      };
    }
    const raw = answerFromWorkExperience(jobs[expIdx], weSlot);
    if (!raw) {
      // e.g. To when currently employed — leave empty, don't Ask AI.
      return {
        label, answer: null, missing: false, bucket: 'known', source: 'profile', skip: true,
        intent: 'work_experience', type: field.type || 'text', options, needsLLM: false, ...meta,
      };
    }
    return {
      label,
      answer: snapToOption(raw, options),
      missing: false,
      bucket: 'known',
      source: 'profile',
      skip: false,
      intent: 'work_experience',
      type: field.type || 'text',
      options,
      needsLLM: false,
      ...meta,
    };
  }

  // Never dump the phone number into an extension box.
  if (intent.id === 'phone_extension') {
    return {
      label, answer: null, missing: false, bucket: 'known', source: null, skip: true,
      intent: intent.id, type: field.type || 'text', options, needsLLM: false, ...meta,
    };
  }

  const allowsDial = intent.id === 'phone_country'
    || optionsLookLikeDialCodes(options);
  const storedRaw = lookupStored(extraAnswers, label, options);
  const stored = storedRaw && !isContactPlaceholder(storedRaw) ? storedRaw : null;
  if (stored) {
    // Drop poisoned saves like orientation = "United States +1".
    if (!allowsDial && looksLikeDialCodeAnswer(stored)) {
      // fall through to profile / human ask
    } else if (intent.id === 'country' && looksLikeDialCodeAnswer(stored)) {
      // fall through — dial string is not an address country
    } else {
      return {
        label,
        answer: snapToOption(stored, options),
        missing: false,
        bucket: 'known',
        source: 'stored',
        skip: false,
        intent: intent.id,
        type: field.type || (options ? 'select' : 'text'),
        options,
        needsLLM: false,
        ...meta,
      };
    }
  }
  const fromProfile = intent.fact ? (buildFacts(profile)[intent.fact] || null) : null;
  const snapped = fromProfile && (allowsDial || !looksLikeDialCodeAnswer(fromProfile))
    ? snapToOption(fromProfile, options)
    : null;
  if (snapped && (allowsDial || !looksLikeDialCodeAnswer(snapped))) {
    return {
      label, answer: snapped, missing: false, bucket: 'known', source: 'profile', skip: false,
      intent: intent.id, type: field.type || 'text', options, needsLLM: false, ...meta,
    };
  }

  const base = {
    label, answer: null, missing: true, bucket: 'missing', source: null, skip: false,
    intent: intent.id, type: field.type || 'text', options, ...meta,
  };
  if (intent.policy === 'human') {
    return { ...base, needsLLM: false };
  }
  return { ...base, needsLLM: intent.policy === 'llm' };
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
  return { ...plan, answer: snapToOption(answer, plan.options), missing: false, bucket: 'ask', source: 'llm' };
}

function parseLlmList(raw) {
  const cleaned = String(raw || '').trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]+?)```/);
  const jsonStr = fenced ? fenced[1].trim() : cleaned;
  const parsed = JSON.parse(jsonStr);
  if (Array.isArray(parsed)) return parsed;
  // Models often return one object when only one open field was sent.
  if (parsed && typeof parsed === 'object' && ('label' in parsed || 'answer' in parsed)) {
    return [parsed];
  }
  throw new Error('LLM did not return a JSON array');
}

module.exports = {
  INTENTS,
  normalizeKey,
  classifyIntent,
  canonicalKey,
  storageKeyForAnswer,
  lookupStored,
  isBadLabel,
  isFactOnlyField,
  isHumanOnlyField,
  buildFacts,
  resolveFromProfile,
  planField,
  snapToOption,
  applyLlmAnswer,
  parseLlmList,
  isPageValueComplete,
  workExperienceSlot,
  answerFromWorkExperience,
  toMonthYear,
};
