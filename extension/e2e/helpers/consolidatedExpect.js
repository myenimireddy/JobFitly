/**
 * Build required consolidated-field expectations for a portal from a seeded profile.
 * Skips resume uploads, phone extension, and open employer essays with no profile facts.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/consolidated-fill-context.json'), 'utf8'),
);

const SKIP_CANONICAL = new Set(['resume', 'phone_extension']);

/** Labels we never require (no profile fact / HITL-only). */
const SKIP_LABEL = [
  /resume/i,
  /phone extension/i,
  /video link/i,
  /what is your age range/i,
  /^date$/i,
  /ai ecosystem/i,
  /ai-native companies/i,
  // Lever office picker — options are job-specific offices, not candidate city.
  /which location are you applying for/i,
];

function normLabel(s) {
  return String(s || '').toLowerCase().replace(/[*:]/g, ' ').replace(/\s+/g, ' ').trim();
}

function labelMatch(a, b) {
  const na = normLabel(a);
  const nb = normLabel(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * @param {object} parsed - profile.parsedData
 * @param {string} portal
 * @returns {{ label: string, canonical: string, expected: string }[]}
 */
export function requiredConsolidatedFields(parsed, portal) {
  const pi = parsed.personalInfo || {};
  const ap = parsed.applicationProfile || {};
  const phone = typeof pi.phone === 'object' ? pi.phone : ap.phone || {};
  const company = ((parsed.workExperience || [])[0] || {}).company || '';
  const loc = ap.location || pi.location || `${ap.city || ''}, ${ap.state || ''}`.trim();
  const city = ap.city || (loc ? String(loc).split(',')[0].trim() : '');

  const facts = {
    first_name: pi.firstName || ap.preferredName,
    last_name: pi.lastName,
    full_name: pi.fullName || `${pi.firstName || ''} ${pi.lastName || ''}`.trim(),
    preferred: ap.preferredName || pi.firstName,
    email: pi.email,
    phone: phone.nationalNumber || String(phone).replace(/\D/g, '').slice(-10),
    country: ap.country || phone.country || 'United States',
    country_phone_code: phone.country && phone.countryCode
      ? `${phone.country} ${phone.countryCode}`
      : 'United States +1',
    phone_device_type: ap.phoneDeviceType || 'Mobile',
    city,
    location: loc,
    address1: ap.address1,
    address2: ap.address2,
    state: ap.state,
    postal: ap.postal,
    linkedin: ap.linkedin || pi.linkedin,
    github: ap.github || '',
    website: ap.website || '',
    current_company: company,
    work_auth: ap.workAuthUS || 'Yes',
    sponsorship: ap.sponsorshipRequired || 'No',
    age_18: ap.age18Plus || 'Yes',
    source: ap.hearAbout || 'LinkedIn',
    pronouns: ap.pronouns,
    gender: ap.gender,
    transgender: ap.transgender || 'No',
    orientation: ap.orientation,
    ethnicity: ap.ethnicity,
    disability: ap.disability || 'No',
    veteran: ap.veteran || 'No',
    consent: 'I agree',
    inBayArea: /san francisco|bay area|oakland|palo alto|san jose/i.test(`${city} ${loc}`) ? 'Yes' : 'No',
    previouslyEmployed: ap.previouslyEmployed || 'No',
  };

  const rows = catalog.byPortal[portal] || [];
  const out = [];

  for (const row of rows) {
    if (SKIP_CANONICAL.has(row.canonical)) continue;
    if (SKIP_LABEL.some((re) => re.test(row.label))) continue;

    let expected = null;
    switch (row.canonical) {
      case 'first_name':
        expected = facts.first_name;
        break;
      case 'last_name':
        expected = facts.last_name;
        break;
      case 'full_name':
        expected = /preferred/i.test(row.label) ? facts.preferred : facts.full_name;
        break;
      case 'email':
        expected = facts.email;
        break;
      case 'phone':
        expected = facts.phone;
        break;
      case 'country':
        expected = facts.country;
        break;
      case 'country_phone_code':
        expected = facts.country_phone_code;
        break;
      case 'phone_device_type':
        expected = facts.phone_device_type;
        break;
      case 'city':
        expected = /current location/i.test(row.label) || /working from/i.test(row.label)
          ? (facts.location || facts.city)
          : facts.city;
        break;
      case 'address':
        if (/line 1|street/i.test(row.label)) expected = facts.address1;
        else if (/line 2/i.test(row.label)) expected = facts.address2;
        else if (/state|province/i.test(row.label)) expected = facts.state;
        else if (/postal|zip/i.test(row.label)) expected = facts.postal;
        break;
      case 'linkedin':
        expected = facts.linkedin;
        break;
      case 'website':
        if (/github/i.test(row.label)) expected = facts.github || null;
        else expected = facts.website || null;
        break;
      case 'current_company':
        expected = facts.current_company;
        break;
      case 'work_auth':
        expected = facts.work_auth;
        break;
      case 'sponsorship':
        expected = facts.sponsorship;
        break;
      case 'age_18':
        expected = facts.age_18;
        break;
      case 'source':
        expected = facts.source;
        break;
      case 'pronouns':
        expected = facts.pronouns;
        break;
      case 'gender':
        expected = facts.gender;
        break;
      case 'transgender':
        expected = facts.transgender;
        break;
      case 'orientation':
        expected = facts.orientation;
        break;
      case 'ethnicity':
        expected = facts.ethnicity;
        break;
      case 'disability':
        expected = facts.disability;
        break;
      case 'veteran':
        expected = facts.veteran;
        break;
      case 'consent':
        expected = /demographic|checking this box|by checking/i.test(row.label) ? 'yes' : facts.consent;
        break;
      case 'employer_specific':
        if (/bay area/i.test(row.label)) expected = facts.inBayArea;
        else if (/employed by|adobe|past/i.test(row.label)) expected = facts.previouslyEmployed;
        else if (/which location/i.test(row.label)) expected = facts.city;
        else expected = null;
        break;
      default:
        expected = row.answer;
    }

    if (expected == null || String(expected).trim() === '') continue;
    out.push({
      label: row.label,
      canonical: row.canonical,
      expected: String(expected),
    });
  }

  return out;
}

/**
 * Ensure generateAnswers covered every required consolidated label (fuzzy).
 */
export function assertAnswersCoverCatalog(answers, required, portal) {
  const missing = [];
  for (const req of required) {
    const hit = answers.find((a) => labelMatch(a.label, req.label));
    if (!hit || !hit.answer) missing.push(req);
  }
  return {
    portal,
    required: required.length,
    covered: required.length - missing.length,
    missing,
  };
}

export { catalog, labelMatch, normLabel };
