#!/usr/bin/env node
/**
 * Generate fictional demo resume PDFs (+ JSON) for JobFitly testing.
 *
 *   node scripts/fake-resumes/generate.mjs
 *   node scripts/fake-resumes/generate.mjs --out docs/samples/resumes
 *
 * Safe for demos: no real people. Do not submit these to real employers as yourself.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILES } from './profiles.mjs';
import { buildTextPdf, wrapText } from './pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const outIdx = argv.indexOf('--out');
  const out =
    outIdx >= 0 && argv[outIdx + 1]
      ? path.resolve(root, argv[outIdx + 1])
      : path.join(root, 'docs/samples/resumes');
  return { out };
}

/** @param {import('./profiles.mjs').FakeProfile} p */
function linesFor(p) {
  const fullName = `${p.firstName} ${p.lastName}`;
  const lines = [
    `# ${fullName}`,
    `${p.city}, ${p.state}  |  ${p.phone}  |  ${p.email}`,
    `linkedin.com/in/${p.firstName.toLowerCase()}${p.lastName.toLowerCase()}demo`,
    '---',
    '## Summary',
    ...wrapText(p.summary),
    '',
    '## Skills',
    ...wrapText(p.skills.join(', ')),
    '',
    '## Experience',
  ];

  for (const job of p.experience) {
    lines.push(`**${job.title} | ${job.company}**`);
    lines.push(`_${job.dates}_`);
    for (const b of job.bullets) {
      lines.push(...wrapText(`- ${b}`));
    }
    lines.push('');
  }

  lines.push('## Education');
  lines.push(`**${p.education.degree} | ${p.education.school}**`);
  lines.push(`_${p.education.dates}_`);
  if (p.education.note) lines.push(...wrapText(p.education.note));
  lines.push('');

  if (p.extras?.length) {
    lines.push('## Additional');
    for (const e of p.extras) lines.push(`- ${e}`);
  }

  return lines;
}

/** @param {import('./profiles.mjs').FakeProfile} p */
function toJson(p) {
  return {
    personalInfo: {
      fullName: `${p.firstName} ${p.lastName}`,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      location: `${p.city}, ${p.state}`,
      linkedin: `https://www.linkedin.com/in/${p.firstName.toLowerCase()}${p.lastName.toLowerCase()}demo`,
    },
    summary: p.summary,
    skills: p.skills,
    workExperience: p.experience.map((j) => ({
      title: j.title,
      company: j.company,
      dates: j.dates,
      achievements: j.bullets,
    })),
    education: [
      {
        degree: p.education.degree,
        school: p.education.school,
        dates: p.education.dates,
        note: p.education.note || '',
      },
    ],
    extras: p.extras || [],
    _meta: {
      key: p.key,
      fictional: true,
      purpose: 'JobFitly demo / test only',
    },
  };
}

function slug(p) {
  return `${String(PROFILES.indexOf(p) + 1).padStart(2, '0')}-${p.key}-${p.firstName.toLowerCase()}-${p.lastName.toLowerCase()}`;
}

function main() {
  const { out } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(out, { recursive: true });

  const index = [];
  for (const p of PROFILES) {
    const base = slug(p);
    const pdfPath = path.join(out, `${base}.pdf`);
    const jsonPath = path.join(out, `${base}.json`);
    const pdf = buildTextPdf(linesFor(p), {
      title: `${p.firstName} ${p.lastName} - fictional demo resume`,
    });
    fs.writeFileSync(pdfPath, pdf);
    fs.writeFileSync(jsonPath, `${JSON.stringify(toJson(p), null, 2)}\n`);
    index.push({
      key: p.key,
      name: `${p.firstName} ${p.lastName}`,
      title: p.title,
      pdf: path.basename(pdfPath),
      json: path.basename(jsonPath),
    });
    console.log(`wrote ${path.relative(root, pdfPath)}`);
  }

  fs.writeFileSync(
    path.join(out, 'index.json'),
    `${JSON.stringify({ fictional: true, count: index.length, profiles: index }, null, 2)}\n`,
  );

  const md = [
    '# Fake demo resumes',
    '',
    '**Fictional personas only** — for JobFitly Side Panel demos, LinkedIn videos, and parser tests.',
    'Do not use as your identity on real job applications.',
    '',
    'Phones are masked as `(000) 000-00NN` (not real numbers). **PDF files are gitignored** — generate locally:',
    '',
    '```bash',
    'npm run generate:fake-resumes',
    '# or: node scripts/fake-resumes/generate.mjs',
    '```',
    '',
    'JSON + `index.json` stay in git; CI regenerates PDFs before UI e2e.',
    '',
    '| # | Name | Role | PDF |',
    '|---|------|------|-----|',
    ...index.map(
      (row, i) =>
        `| ${i + 1} | ${row.name} | ${row.title} | [\`${row.pdf}\`](${row.pdf}) |`,
    ),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(out, 'README.md'), md);
  console.log(`\n${index.length} resumes → ${path.relative(root, out)}`);
}

main();
