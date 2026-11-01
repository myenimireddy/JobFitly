'use strict';

/**
 * Consolidated application profile — fields ATS forms need beyond the resume.
 *
 * Architecture:
 *   resume parse  → personalInfo / workExperience / skills (facts from PDF)
 *   capture wizard → applicationProfile (human answers shared across portals)
 *   autofill       → buildFacts(profile) + LLM only for open narrative fields
 *
 * Phone is always an object so Country dial never collides with the number:
 *   { country: "United States", countryCode: "+1", nationalNumber: "5551234567" }
 */

/** Catalog shown after resume parse. `fromResume` fields are prefilled when possible. */
const APPLICATION_FIELD_CATALOG = [
  // Identity (usually from resume — confirm)
  { key: 'preferredName', label: 'Preferred first name', type: 'text', group: 'identity', fromResume: true },
  { key: 'pronouns', label: 'Pronouns', type: 'text', group: 'identity', optional: true },

  // Contact / location
  {
    key: 'phone',
    label: 'Phone',
    type: 'phone',
    group: 'contact',
    fromResume: true,
    help: 'Country dial and national number are stored separately so forms do not confuse +1 with the phone field.',
  },
  { key: 'country', label: 'Country of residence', type: 'text', group: 'contact', fromResume: true },
  { key: 'address1', label: 'Street address (line 1)', type: 'text', group: 'contact', optional: true },
  { key: 'address2', label: 'Address line 2 (apt / suite)', type: 'text', group: 'contact', optional: true },
  { key: 'city', label: 'City', type: 'text', group: 'contact', fromResume: true },
  { key: 'state', label: 'State / Region', type: 'text', group: 'contact', fromResume: true, optional: true },
  { key: 'postal', label: 'Postal / ZIP code', type: 'text', group: 'contact', optional: true },
  { key: 'location', label: 'Location (City, State)', type: 'text', group: 'contact', fromResume: true },
  { key: 'linkedin', label: 'LinkedIn URL', type: 'text', group: 'contact', fromResume: true },
  { key: 'github', label: 'GitHub URL', type: 'text', group: 'contact', optional: true },
  { key: 'website', label: 'Website / Portfolio', type: 'text', group: 'contact', optional: true },
  { key: 'phoneDeviceType', label: 'Phone device type', type: 'select', group: 'contact', options: ['Mobile', 'Home', 'Work'], optional: true },

  // Work eligibility (never invent)
  { key: 'workAuthUS', label: 'Authorized to work in the U.S.?', type: 'select', group: 'eligibility', options: ['Yes', 'No'] },
  { key: 'sponsorshipRequired', label: 'Will you need visa sponsorship now or in the future?', type: 'select', group: 'eligibility', options: ['Yes', 'No'] },
  { key: 'age18Plus', label: 'Are you 18 or over?', type: 'select', group: 'eligibility', options: ['Yes', 'No'] },
  // Employer/geo-specific (Bay Area, “worked here before”) stay out of capture — answer per job in HITL.

  // Preferences
  { key: 'hearAbout', label: 'How did you hear about jobs / this company? (default)', type: 'text', group: 'preferences' },
  { key: 'availableFrom', label: 'Earliest start date / notice period', type: 'text', group: 'preferences', optional: true },

  // EEO (optional decline — stored exactly for option snapping)
  { key: 'gender', label: 'Gender', type: 'text', group: 'eeo', optional: true },
  { key: 'transgender', label: 'Transgender experience?', type: 'select', group: 'eeo', options: ['Yes', 'No', "I don't wish to answer"], optional: true },
  { key: 'orientation', label: 'Sexual orientation', type: 'text', group: 'eeo', optional: true },
  { key: 'ethnicity', label: 'Ethnicity (e.g. South Asian)', type: 'text', group: 'eeo', optional: true },
  { key: 'disability', label: 'Disability status (short: Yes / No / Prefer not to say)', type: 'text', group: 'eeo', optional: true },
  { key: 'veteran', label: 'Veteran status (short: Yes / No / Prefer not to say)', type: 'text', group: 'eeo', optional: true },
];

function emptyPhone() {
  return { country: '', countryCode: '', nationalNumber: '' };
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Normalize any legacy phone string or partial object into { country, countryCode, nationalNumber }.
 */
function normalizePhone(raw, fallbackCountry = 'United States') {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const nationalNumber = digitsOnly(raw.nationalNumber || raw.number || raw.national || '');
    let countryCode = String(raw.countryCode || raw.dialCode || '').trim();
    let country = String(raw.country || '').trim();
    if (!countryCode && nationalNumber.length === 11 && nationalNumber.startsWith('1')) {
      countryCode = '+1';
    }
    if (!countryCode && (country === 'United States' || fallbackCountry === 'United States')) {
      countryCode = '+1';
    }
    if (!country && (countryCode === '+1' || countryCode === '1')) country = 'United States';
    let national = nationalNumber;
    if (national.length === 11 && national.startsWith('1')) national = national.slice(1);
    else if (national.length > 10) national = national.slice(-10);
    return {
      country: country || fallbackCountry || '',
      countryCode: countryCode.startsWith('+') || !countryCode ? countryCode : `+${countryCode}`,
      nationalNumber: national,
    };
  }

  const digits = digitsOnly(raw);
  let national = digits;
  let countryCode = '';
  let country = '';
  if (digits.length === 11 && digits.startsWith('1')) {
    national = digits.slice(1);
    countryCode = '+1';
    country = 'United States';
  } else if (digits.length === 10) {
    national = digits;
    countryCode = '+1';
    country = fallbackCountry || 'United States';
  } else if (digits.length > 10) {
    national = digits.slice(-10);
    countryCode = `+${digits.slice(0, digits.length - 10)}`;
  }
  if (String(raw || '').includes('+1') || /\bunited states\b/i.test(String(raw || ''))) {
    countryCode = countryCode || '+1';
    country = country || 'United States';
  }
  return { country, countryCode, nationalNumber: national };
}

function cityFrom(loc) {
  if (!loc) return '';
  return String(loc).split(',')[0].trim();
}

function stateFrom(loc) {
  if (!loc) return '';
  const parts = String(loc).split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const mid = parts[1];
  if (/^[A-Z]{2}$/i.test(mid)) {
    const map = { TX: 'Texas', CA: 'California', NY: 'New York', WA: 'Washington', FL: 'Florida', OH: 'Ohio' };
    return map[mid.toUpperCase()] || mid;
  }
  if (!/united states|usa/i.test(mid)) return mid;
  return '';
}

function countryFromLocation(loc) {
  if (!loc) return '';
  if (/\b(united states|u\.s\.a\.|\busa\b|u\.s\.)\b/i.test(loc)) return 'United States';
  const last = String(loc).split(',').pop().trim();
  if (/^[A-Z]{2}$/i.test(last)) return 'United States';
  return '';
}

/** Prefill applicationProfile draft from parsed resume. */
function draftApplicationProfile(parsed) {
  const pi = (parsed && parsed.personalInfo) || {};
  const job = ((parsed && parsed.workExperience) || [])[0] || {};
  const loc = pi.location || job.location || '';
  const parts = String(pi.fullName || '').split(/\s+/).filter(Boolean);
  const phone = normalizePhone(pi.phone, countryFromLocation(loc) || 'United States');
  const existing = (parsed && parsed.applicationProfile) || {};

  return {
    displayName: existing.displayName || '',
    preferredName: existing.preferredName || pi.firstName || parts[0] || '',
    pronouns: existing.pronouns || '',
    phone: existing.phone && existing.phone.nationalNumber
      ? normalizePhone(existing.phone, phone.country)
      : phone,
    country: existing.country || phone.country || countryFromLocation(loc) || '',
    address1: existing.address1 || '',
    address2: existing.address2 || '',
    city: existing.city || cityFrom(loc) || '',
    state: existing.state || stateFrom(loc) || '',
    postal: existing.postal || '',
    location: existing.location || loc || '',
    linkedin: existing.linkedin || pi.linkedin || '',
    github: existing.github || '',
    website: existing.website || pi.website || '',
    phoneDeviceType: existing.phoneDeviceType || 'Mobile',
    workAuthUS: existing.workAuthUS || '',
    sponsorshipRequired: existing.sponsorshipRequired
      ?? (typeof parsed.sponsorshipRequired === 'boolean'
        ? (parsed.sponsorshipRequired ? 'Yes' : 'No')
        : ''),
    age18Plus: existing.age18Plus || '',
    hearAbout: existing.hearAbout || '',
    availableFrom: existing.availableFrom || parsed.availableFrom || '',
    gender: existing.gender || '',
    transgender: existing.transgender || '',
    orientation: existing.orientation || '',
    ethnicity: existing.ethnicity || '',
    disability: existing.disability || '',
    veteran: existing.veteran || '',
    captureComplete: !!existing.captureComplete,
    capturedAt: existing.capturedAt || null,
  };
}

function isPhoneComplete(phone) {
  const p = normalizePhone(phone);
  return !!(p.nationalNumber && p.nationalNumber.length >= 10 && p.countryCode);
}

/** Required catalog keys that must be non-empty for captureComplete. */
function missingApplicationFields(applicationProfile) {
  const ap = applicationProfile || {};
  const missing = [];
  for (const field of APPLICATION_FIELD_CATALOG) {
    if (field.optional) continue;
    if (field.type === 'phone') {
      if (!isPhoneComplete(ap.phone)) missing.push(field.key);
      continue;
    }
    const val = ap[field.key];
    if (val == null || String(val).trim() === '') missing.push(field.key);
  }
  return missing;
}

function mergeApplicationProfile(parsed, updates = {}) {
  const draft = draftApplicationProfile(parsed);
  const next = { ...draft, ...updates };
  if (updates.phone) next.phone = normalizePhone(updates.phone, next.country || draft.phone.country);
  else next.phone = normalizePhone(next.phone, next.country);

  // Keep personalInfo.phone as a national string for ProfileEditor / PII sanitizer.
  // Structured { country, countryCode, nationalNumber } lives only on applicationProfile.
  const personalInfo = {
    ...((parsed && parsed.personalInfo) || {}),
    phone: next.phone.nationalNumber || '',
    linkedin: next.linkedin || ((parsed && parsed.personalInfo) || {}).linkedin,
    location: next.location || ((parsed && parsed.personalInfo) || {}).location,
    website: next.website || ((parsed && parsed.personalInfo) || {}).website,
    firstName: ((parsed && parsed.personalInfo) || {}).firstName || next.preferredName || undefined,
  };

  let sponsorshipRequired = parsed.sponsorshipRequired;
  if (next.sponsorshipRequired === 'Yes') sponsorshipRequired = true;
  if (next.sponsorshipRequired === 'No') sponsorshipRequired = false;

  const missing = missingApplicationFields(next);
  next.captureComplete = missing.length === 0;
  if (next.captureComplete && !next.capturedAt) next.capturedAt = new Date().toISOString();

  return {
    ...parsed,
    personalInfo,
    sponsorshipRequired,
    availableFrom: next.availableFrom || parsed.availableFrom || null,
    applicationProfile: next,
  };
}

function getCaptureQuestionnaire(parsed) {
  const draft = draftApplicationProfile(parsed);
  const missing = new Set(missingApplicationFields(draft));
  return {
    catalog: APPLICATION_FIELD_CATALOG,
    values: draft,
    missing: [...missing],
    complete: missing.size === 0 && !!draft.captureComplete,
  };
}

module.exports = {
  APPLICATION_FIELD_CATALOG,
  emptyPhone,
  normalizePhone,
  draftApplicationProfile,
  missingApplicationFields,
  mergeApplicationProfile,
  getCaptureQuestionnaire,
  isPhoneComplete,
};
