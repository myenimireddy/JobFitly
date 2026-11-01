'use strict';

/**
 * Split resume plain text on section headers.
 * Do not slice by page or fixed character count — that cuts jobs in half.
 */

const TYPES = [
  { type: 'summary', re: /^(professional summary|summary|profile|objective)$/i },
  { type: 'experience', re: /^(professional experience|work experience|work history|experience|employment)$/i },
  { type: 'education', re: /^(education|educational qualifications|academic background|academic)$/i },
  { type: 'skills', re: /^(skills|technical skills|core competencies|technologies)$/i },
  { type: 'projects', re: /^(projects|personal projects|side projects)$/i },
  { type: 'other', re: /^(certifications|certificates|languages|achievements|volunteer|publications)$/i },
];

function classifyHeader(line) {
  const cleaned = line.replace(/[:.]+$/, '').trim();
  if (cleaned.length > 60) return null;
  for (const row of TYPES) {
    if (row.re.test(cleaned)) return row.type;
  }
  return null;
}

function splitLong(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf('\n', maxChars);
    if (cut < maxChars / 3) cut = maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts.filter(Boolean);
}

function splitResumeSections(rawText) {
  const lines = String(rawText || '').split('\n');
  const marks = [];
  lines.forEach((line, i) => {
    const type = classifyHeader(line);
    if (type) marks.push({ type, i });
  });

  const chunks = [];
  const header = lines.slice(0, marks[0] ? marks[0].i : lines.length).join('\n').trim();
  if (header) chunks.push({ type: 'header', text: header });

  marks.forEach((mark, idx) => {
    const end = marks[idx + 1] ? marks[idx + 1].i : lines.length;
    const text = lines.slice(mark.i, end).join('\n').trim();
    if (!text) return;
    splitLong(text, 4500).forEach((piece) => chunks.push({ type: mark.type, text: piece }));
  });

  if (chunks.length === 0 && String(rawText || '').trim()) {
    splitLong(String(rawText), 4500).forEach((piece, i) => {
      chunks.push({ type: i === 0 ? 'header' : 'experience', text: piece });
    });
  }

  return chunks;
}

module.exports = { splitResumeSections, classifyHeader };
