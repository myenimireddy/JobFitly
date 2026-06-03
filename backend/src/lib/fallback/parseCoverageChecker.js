'use strict';

/**
 * Parse Coverage Checker
 *
 * After regex parsing, measures what % of the raw resume text was actually
 * categorized. Surfaces uncategorized sections so the LLM (or user) can fill
 * the gaps — without re-sending the full resume.
 *
 * Strategy:
 *  1. Count how many non-blank lines from rawText appear in parsedData categories
 *  2. Any customSections (unrecognized headers) + any content before section 1
 *     that wasn't captured as personalInfo = "uncategorized content"
 *  3. If coverage < COVERAGE_THRESHOLD, flag for LLM gap-fill
 */

const COVERAGE_THRESHOLD = 0.70; // flag if < 70% of lines are categorized

/**
 * Flatten all categorized text from parsedData into a single set of lines
 * for coverage comparison.
 */
function buildCategorizedLineSet(parsedData) {
  const lines = new Set();

  const add = (str) => {
    if (!str) return;
    str.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean).forEach(l => lines.add(l));
  };

  const pi = parsedData.personalInfo || {};
  [pi.fullName, pi.email, pi.phone, pi.linkedin, pi.location, pi.website].forEach(add);

  (parsedData.skills || []).forEach(add);
  (parsedData.certifications || []).forEach(add);
  (parsedData.achievements || []).forEach(add);

  (parsedData.workExperience || []).forEach(w => {
    add(w.title); add(w.company); add(w.startDate); add(w.endDate);
    (w.achievements || []).forEach(add);
  });

  (parsedData.education || []).forEach(e => {
    add(e.degree); add(e.school); add(e.field); add(e.startDate); add(e.endDate);
  });

  if (parsedData.summary) add(parsedData.summary);

  (parsedData.customSections || []).forEach(s => {
    s.lines.forEach(add);
  });

  return lines;
}

/**
 * Calculate coverage: what fraction of non-blank resume lines appear in parsed output.
 *
 * @param {string} rawText
 * @param {Object} parsedData
 * @returns {{ coverageRatio: number, totalLines: number, coveredLines: number, uncoveredLines: string[] }}
 */
function calculateCoverage(rawText, parsedData) {
  const rawLines = rawText
    .split('\n')
    .map(l => l.trim().toLowerCase())
    .filter(l => l.length > 2); // skip blank / single-char lines

  const categorized = buildCategorizedLineSet(parsedData);

  const covered = rawLines.filter(l => categorized.has(l));
  const uncovered = rawLines.filter(l => !categorized.has(l));

  return {
    coverageRatio: rawLines.length > 0 ? covered.length / rawLines.length : 1,
    totalLines: rawLines.length,
    coveredLines: covered.length,
    uncoveredLines: uncovered.slice(0, 40), // cap for logging
  };
}

/**
 * Identify sections from customSections that the regex parser couldn't categorize.
 * These are the prime candidates for LLM gap-filling.
 *
 * @param {Object} parsedData
 * @returns {Array<{name: string, lines: string[]}>}
 */
function getUncategorizedSections(parsedData) {
  return (parsedData.customSections || []).filter(s => s.lines.length > 0);
}

/**
 * Build a minimal LLM prompt to categorize only the uncategorized sections.
 * Does NOT send personalInfo — privacy preserved.
 *
 * @param {Array<{name: string, lines: string[]}>} sections
 * @returns {string}
 */
function buildGapFillPrompt(sections) {
  const sectionText = sections
    .map(s => `### ${s.name}\n${s.lines.join('\n')}`)
    .join('\n\n');

  return `The following sections were extracted from a resume but could not be automatically categorized. 
Classify each section into one of these types and extract structured data:
Types: projects, languages, volunteer, publications, research, interests, awards, courses, other

For each section return a JSON object:
{
  "name": "<original section name>",
  "type": "<classified type>",
  "items": ["<item 1>", "<item 2>", ...]
}

Return a JSON array of these objects. No markdown, no explanation.

Sections to classify:
${sectionText}`;
}

/**
 * Main entry: check coverage and return a full audit report.
 *
 * @param {string} rawText
 * @param {Object} parsedData
 * @returns {{
 *   coverageRatio: number,
 *   coveredLines: number,
 *   totalLines: number,
 *   needsGapFill: boolean,
 *   uncategorizedSections: Array<{name, lines}>,
 *   gapFillPrompt: string|null,
 * }}
 */
function auditCoverage(rawText, parsedData) {
  const coverage = calculateCoverage(rawText, parsedData);
  const uncategorizedSections = getUncategorizedSections(parsedData);

  const needsGapFill =
    coverage.coverageRatio < COVERAGE_THRESHOLD ||
    uncategorizedSections.length > 0;

  console.log('\n━━━ [coverage] PARSE COVERAGE AUDIT ━━━');
  console.log(`  total lines   : ${coverage.totalLines}`);
  console.log(`  covered lines : ${coverage.coveredLines}`);
  console.log(`  coverage      : ${(coverage.coverageRatio * 100).toFixed(1)}%  ${coverage.coverageRatio < COVERAGE_THRESHOLD ? '⚠ below threshold' : '✓ ok'}`);
  console.log(`  custom sections (uncategorized): ${uncategorizedSections.length}`);
  uncategorizedSections.forEach(s =>
    console.log(`    "${s.name}" → ${s.lines.length} lines`)
  );
  if (coverage.uncoveredLines.length > 0) {
    console.log('  sample uncovered lines:');
    coverage.uncoveredLines.slice(0, 10).forEach(l => console.log(`    "${l}"`));
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return {
    coverageRatio: coverage.coverageRatio,
    coveredLines: coverage.coveredLines,
    totalLines: coverage.totalLines,
    needsGapFill,
    uncategorizedSections,
    gapFillPrompt: needsGapFill && uncategorizedSections.length > 0
      ? buildGapFillPrompt(uncategorizedSections)
      : null,
  };
}

/**
 * Merge LLM gap-fill results back into parsedData.
 * Adds a top-level `gapFillSections` array with { name, type, items }.
 * Also appends any found skills/languages/projects into the main arrays.
 *
 * @param {Object} parsedData
 * @param {Array<{name, type, items}>} gapResults
 * @returns {Object} updated parsedData
 */
function mergeGapFillResults(parsedData, gapResults) {
  if (!gapResults || gapResults.length === 0) return parsedData;

  const updated = { ...parsedData, gapFillSections: gapResults };

  for (const section of gapResults) {
    if (!section.items || section.items.length === 0) continue;

    switch (section.type) {
      case 'languages':
        updated.languages = [...(updated.languages || []), ...section.items];
        break;
      case 'projects':
        updated.projects = [...(updated.projects || []), ...section.items];
        break;
      case 'awards':
        updated.achievements = [...(updated.achievements || []), ...section.items];
        break;
      case 'courses':
        updated.certifications = [...(updated.certifications || []), ...section.items];
        break;
    }
  }

  return updated;
}

module.exports = { auditCoverage, mergeGapFillResults, COVERAGE_THRESHOLD };
