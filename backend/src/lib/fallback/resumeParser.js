'use strict';

/**
 * Regex-based resume parser.
 * Ported from career-ai-platform/apps/api/src/modules/resume-parsing/regex-resume-parser.ts
 * Pure JS, no external dependencies.
 */

const KNOWN_SECTIONS = [
  { names: ['education', 'academic', 'qualifications', 'academic background'], type: 'education' },
  { names: ['experience', 'work', 'employment', 'professional experience', 'work history'], type: 'workExperience' },
  { names: ['skills', 'technologies', 'technical skills', 'competencies', 'expertise'], type: 'skills' },
  { names: ['achievements', 'accomplishments', 'awards', 'honors'], type: 'achievements' },
  { names: ['certifications', 'certificates', 'licenses', 'credentials'], type: 'certifications' },
  { names: ['projects', 'personal projects', 'side projects'], type: 'projects' },
  { names: ['summary', 'profile', 'objective', 'about'], type: 'summary' },
  { names: ['languages', 'language proficiency'], type: 'languages' },
  { names: ['interests', 'hobbies', 'activities'], type: 'interests' },
  { names: ['references', 'referees'], type: 'references' },
];

// Lines that look like section headers but are NOT — job entry lines, skill names, etc.
const JOB_TITLE_WORDS = /\b(Engineer|Manager|Developer|Designer|Analyst|Director|Lead|Senior|Staff|Principal|Architect|Consultant|Head|VP|CTO|CEO|Intern|Student|Assistant|Associate|Coordinator|Specialist)\b/i;

// Canonical section names that must match exactly (case-insensitive, optional colon)
const CANONICAL_HEADERS = [
  'education','experience','skills','projects','certifications','achievements',
  'summary','references','languages','interests','hobbies','objective','profile',
  'publications','volunteer','military','activities','awards','honors','research',
  'presentations','trainings','courses','licenses','professional experience',
  'work experience','work history','technical skills','professional summary',
];

function isCanonicalHeader(line) {
  const l = line.toLowerCase().replace(/:$/, '').trim();
  return CANONICAL_HEADERS.some((h) => l === h || l === h + 's');
}

function identifySections(lines) {
  const sections = [];
  const sectionHeaders = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Must be a canonical known header OR all-uppercase short label
    const isAllCaps = line === line.toUpperCase() && line.length > 2 && line.length < 50 && /^[A-Z]/.test(line) && !/\d/.test(line);
    const isCanonical = isCanonicalHeader(line);

    // Exclude lines that are clearly job entries (contain em-dash with company/title pattern)
    const looksLikeJobEntry = /[–—]/.test(line) && JOB_TITLE_WORDS.test(line);
    // Exclude lines with email, URL, phone, digits
    const hasContactInfo = line.includes('@') || line.includes('http') || /\d{4}/.test(line) || /\+?\d[\d\s()-]{6,}/.test(line);

    const isHeader = (isAllCaps || isCanonical) && !looksLikeJobEntry && !hasContactInfo;

    if (isHeader && !sectionHeaders.has(line.toLowerCase())) {
      sectionHeaders.add(line.toLowerCase());
      sections.push({ header: line, startIndex: i + 1, endIndex: lines.length });
      if (sections.length > 1) {
        sections[sections.length - 2].endIndex = i;
      }
    }
  }
  return sections;
}

function extractSection(text, sectionNames) {
  const lines = text.split('\n').map((l) => l.trim());
  let startIndex = -1;
  let endIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase().replace(/:$/, '').trim();
    for (const name of sectionNames) {
      // match exact or all-caps variant (e.g. 'SKILLS', 'PROFESSIONAL EXPERIENCE')
      if ((line === name || line === name.toUpperCase() || line.includes(name)) && lines[i].length < 60) {
        startIndex = i + 1;
        break;
      }
    }
    if (startIndex !== -1) break;
  }

  if (startIndex === -1) return null;

  const boundaryNames = [
    'education','experience','work history','work experience','employment',
    'professional experience','skills','technical skills','projects','achievements',
    'certifications','interests','references','summary','profile','objective',
    'professional summary',
  ];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].toLowerCase().replace(/:$/, '').trim();
    const isBoundary = boundaryNames.some(
      (s) => (line === s || line === s.toUpperCase() || line.replace(/\s+/g,'') === s.replace(/\s+/g,'')) &&
              !sectionNames.some((n) => line.includes(n))
    );
    if (isBoundary) { endIndex = i; break; }
  }

  if (endIndex === -1) endIndex = lines.length;
  return lines.slice(startIndex, endIndex).join('\n');
}

function extractPersonalInfo(text, lines) {
  const info = {};

  const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) info.email = emailMatch[0];

  const phoneMatch = text.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) info.phone = phoneMatch[0];

  const linkedinMatch = text.match(/linkedin\.com\/[^\s]+/i);
  if (linkedinMatch) {
    info.linkedin = linkedinMatch[0].startsWith('http')
      ? linkedinMatch[0]
      : `https://${linkedinMatch[0]}`;
  }

  const addressMatch = text.match(/\d+\s+[\w\s]+,\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5}/i);
  if (addressMatch) {
    const parts = addressMatch[0].split(',').map((p) => p.trim());
    if (parts.length >= 2) {
      info.address = parts[0];
      if (parts.length >= 3) {
        const cityStateZip = parts[1].split(/\s+/);
        if (cityStateZip.length >= 2) {
          info.city = cityStateZip[0];
          info.state = cityStateZip[1];
          if (cityStateZip.length >= 3) info.zip = cityStateZip[2];
        }
      }
    }
  }

  if (lines.length > 0) {
    const nameMatch = lines[0].match(
      /^([A-Z][a-z]+(?:[-'\s][A-Z][a-z]+)*)\s+([A-Z][a-z]+(?:[-'\s][A-Z][a-z]+)*)/
    );
    if (nameMatch) {
      info.fullName = nameMatch[0];
      info.firstName = nameMatch[1];
      info.lastName = nameMatch[2];
    }
  }

  return info;
}

function extractEducation(text) {
  const education = [];
  const section = extractSection(text, ['education', 'academic', 'qualifications']);
  if (!section) return education;

  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  let current = null;

  for (const line of lines) {
    const singleLine = line.match(
      /^(B\.S\.|M\.S\.|B\.A\.|M\.A\.|MBA|BS|MS|BA|MA|Bachelor|Master|PhD|Doctorate)[^.]*?[-—]\s*([^-—]+?(?:University|College|Institute|School)[^-—]*?)\s*(?:[-—]|,)\s*(\d{4})/i
    );
    if (singleLine) {
      education.push({ degree: singleLine[1].trim(), school: singleLine[2].trim(), startDate: '', endDate: singleLine[3] });
      continue;
    }

    const degreeMatch = line.match(
      /^(Bachelor|Master|PhD|Doctorate|B\.S\.|M\.S\.|B\.A\.|M\.A\.|MBA|BS|MS|BA|MA|Bachelor's|Master's)\s+(?:of\s+)?/i
    );
    const dateMatch = line.match(/(\w+\s+\d{4})/i);
    const gpaMatch = line.match(/GPA:\s*([\d.]+)/i);

    if (!degreeMatch && !dateMatch && line.length > 5 && (line.includes('University') || line.includes('College') || line.includes('Institute'))) {
      if (current && current.school) education.push(current);
      current = { school: line.trim(), degree: '', startDate: '', endDate: '' };
    } else if (degreeMatch && current) {
      current.degree = line.trim();
      const dateOnLine = line.match(/—\s*(\w+\s+\d{4})/i);
      if (dateOnLine) current.endDate = dateOnLine[1];
      const gpaOnLine = line.match(/GPA:\s*([\d.]+)/i);
      if (gpaOnLine) current.gpa = gpaOnLine[1];
    } else if (dateMatch && current && !current.endDate) {
      const fullDate = line.match(/—\s*(\w+\s+\d{4})/i);
      current.endDate = fullDate ? fullDate[1] : dateMatch[1];
      if (gpaMatch) current.gpa = gpaMatch[1];
    } else if (gpaMatch && current) {
      current.gpa = gpaMatch[1];
    }
  }

  if (current && current.school) education.push(current);
  return education;
}

function extractWorkExperience(text) {
  const workExperience = [];
  const section = extractSection(text, ['experience', 'work', 'employment', 'professional']);
  if (!section) return workExperience;

  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^(SKILLS|TECHNICAL SKILLS|EDUCATION|PROJECTS|CERTIFICATIONS|AWARDS|LANGUAGES|INTERESTS|REFERENCES|PUBLICATIONS|SUMMARY|CONTACT)\s*$/i.test(trimmed)) break;

    const roleMatch = line.match(/^Role:\s*(.+)$/i);
    const companyLabelMatch = line.match(/^Company:\s*(.+)$/i);
    const isNoiseLine = /^(Responsibilities|Portfolio|Environments|Technologies|Tools|Skills):\s*/i.test(line);
    // Unicode bullets: ● • ▪ ▸ ► ✓ – as bullet + standard ASCII
    const bulletMatch = line.match(/^(?:[●•▪▸►✓\-\*]|\d+[.)]) +(.+)$/);
    const dateLineMatch = line.match(/(\w+\s+\d{4}|\d{4})\s*[-–—]\s*(\w+\s+\d{4}|\d{4}|Present|Current|Till Date)/i);

    const titleAtCompanyMatch =
      line.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[|,]\s*(.+))?$/i) ||
      line.match(/^(.+?)\s*[—–]\s*(.+?)(?:\s*,\s*(.+))?$/) ||
      line.match(/^(.+?)\s*\|\s*(.+?)(?:\s*[|,]\s*(.+))?$/);

    const JOB_WORDS = /\b(Engineer|Manager|Developer|Designer|Analyst|Director|Lead|Senior|Staff|Principal|Architect|Consultant|Head|VP|CTO|CEO|Intern|Student|Assistant|Associate|Coordinator|Specialist)\b/i;

    if (roleMatch) { continue; }

    if (companyLabelMatch) {
      if (current && current.company) workExperience.push(current);
      const companyLine = companyLabelMatch[1].trim();
      current = { company: companyLine.split(/[-–]/)[0].trim(), title: '', achievements: [] };
      continue;
    }

    if (isNoiseLine) continue;

    if (bulletMatch) {
      if (current) {
        if (!current.achievements) current.achievements = [];
        current.achievements.push(bulletMatch[1].trim());
      }
      continue;
    }

    if (dateLineMatch && current) {
      current.startDate = current.startDate || dateLineMatch[1];
      const end = dateLineMatch[2];
      current.endDate = /present|current|till date/i.test(end) ? 'Present' : end;
      if (/present|current|till date/i.test(end)) current.current = true;
      continue;
    }

    if (titleAtCompanyMatch && !bulletMatch && !line.match(/^[•\-\*•]/)) {
      let possibleTitle = titleAtCompanyMatch[1].trim();
      let possibleCompany = titleAtCompanyMatch[2].trim();

      const g1HasJob = JOB_WORDS.test(possibleTitle);
      const g2HasJob = JOB_WORDS.test(possibleCompany);
      if (!g1HasJob && g2HasJob) { const t = possibleTitle; possibleTitle = possibleCompany; possibleCompany = t; }

      const looksLikeEntry =
        possibleTitle.length < 60 && possibleTitle.length > 3 &&
        !possibleTitle.endsWith('.') && !possibleTitle.endsWith(',') &&
        possibleCompany.length < 60 && possibleCompany.length > 2 &&
        (/^[A-Z][a-z]/.test(possibleTitle) || JOB_WORDS.test(possibleTitle)) &&
        /^[A-Z][a-zA-Z0-9\s&]+$/.test(possibleCompany);

      if (looksLikeEntry) {
        if (current && current.company) workExperience.push(current);
        current = { company: possibleCompany, title: possibleTitle, achievements: [], location: titleAtCompanyMatch[3]?.trim() };
        continue;
      }
    }

    // Fallback: non-empty line under a job entry that isn't a header → add as description
    if (current && trimmed.length > 10 && !trimmed.endsWith(':') && !trimmed.match(/^[●•▪▸►✓\-\*]/) && !dateLineMatch) {
      current.description = current.description ? `${current.description}\n${trimmed}` : trimmed;
    }
  }

  if (current && current.company) workExperience.push(current);
  return workExperience;
}

function extractSkills(text) {
  const skills = [];
  const section = extractSection(text, ['skills', 'technologies', 'technical', 'competencies']);

  if (!section) {
    const common = ['JavaScript','TypeScript','Python','Java','React','Node.js','AWS','Docker','Kubernetes','SQL','MongoDB','PostgreSQL','Git','HTML','CSS','REST API','GraphQL','Machine Learning','AI','Agile','Scrum','CI/CD','Linux'];
    return common.filter((s) => text.match(new RegExp(s, 'i')));
  }

  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  for (const line of lines) {
    const colonMatch = line.match(/^(.+?):\s*(.+)$/);
    if (colonMatch) {
      const parts = colonMatch[2].split(/[,;•\-\*\s]+/).map((p) => p.trim()).filter((p) => p.length > 1);
      skills.push(...parts);
    } else {
      const parts = line.split(/[,;•\-\*\n]/).map((p) => p.trim()).filter((p) => p.length > 0);
      for (const part of parts) {
        // Only split camelCase if the part has NO spaces and looks compound (e.g. "TypeScript" stays whole)
        const isSingleWord = !/\s/.test(part) && part.length > 12;
        const split = isSingleWord ? part.split(/(?=[A-Z])/).filter((w) => w.length > 1) : null;
        if (split && split.length > 2) skills.push(...split);
        else skills.push(part);
      }
    }
  }

  const BAD = ['and','libraries','frameworks','tools','technologies','development','practices','databases','languages','programming'];
  const cleaned = skills.filter((s) => {
    const l = s.toLowerCase();
    return !BAD.some((b) => l.includes(b)) && s.length > 2 && !s.endsWith(':') && !s.endsWith('.') && !s.endsWith('/') && !s.startsWith('(') && !s.endsWith(')');
  });

  return [...new Set(cleaned)];
}

function extractAchievements(text) {
  const achievements = [];
  const section = extractSection(text, ['achievements', 'accomplishments', 'awards', 'honors']);
  if (!section) return achievements;

  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    if (line.match(/^[•\-\*]\s+/) || line.match(/^\d+\.\s+/)) {
      achievements.push(line.replace(/^[•\-\*\d\.]\s+/, ''));
    } else if (line.length > 10) {
      achievements.push(line);
    }
  }
  return achievements;
}

function extractCertifications(text) {
  const certs = [];
  const section = extractSection(text, ['certifications', 'certificates', 'licenses']);
  if (!section) return undefined;

  const lines = section.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    const cleaned = line.replace(/^[•\-\*\d\.]\s*/, '').trim();
    if (cleaned.length > 5) certs.push(cleaned);
  }
  return certs.length > 0 ? certs : undefined;
}

/**
 * Parse a resume text string into structured data.
 * @param {string} resumeText - Raw extracted PDF text
 * @returns {{ personalInfo, education, workExperience, skills, achievements, certifications }}
 */
function parseResumeWithRegex(resumeText) {
  const lines = resumeText.split('\n').map((l, i) => ({ text: l.trim(), index: i, assigned: false })).filter((l) => l.text.length > 0);

  const sections = identifySections(lines.map((l) => l.text));

  const result = {
    personalInfo: {},
    education: [],
    workExperience: [],
    skills: [],
    achievements: [],
    certifications: undefined,
    customSections: [],
  };

  for (const section of sections) {
    const existing = KNOWN_SECTIONS.find((ks) => ks.names.some((name) => section.header.toLowerCase().includes(name)));

    if (!existing) {
      // Unknown section — capture its lines as a custom section
      const sectionLines = lines
        .slice(section.startIndex, section.endIndex)
        .map((l) => l.text)
        .filter((l) => l.length > 0);
      if (sectionLines.length > 0) {
        result.customSections.push({ name: section.header, lines: sectionLines });
      }
      continue;
    }

    switch (existing.type) {
      case 'education':      result.education      = extractEducation(resumeText);      break;
      case 'workExperience': result.workExperience  = extractWorkExperience(resumeText); break;
      case 'skills':         result.skills          = extractSkills(resumeText);         break;
      case 'achievements':   result.achievements    = extractAchievements(resumeText);   break;
      case 'certifications': result.certifications  = extractCertifications(resumeText); break;
    }
  }

  const headerLines = lines.slice(0, sections[0]?.startIndex || 10).map((l) => l.text);
  result.personalInfo = extractPersonalInfo(resumeText, headerLines);

  return result;
}

module.exports = { parseResumeWithRegex };
