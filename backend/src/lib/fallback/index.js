'use strict';

/**
 * Fallback parsers — used only when the LLM is unavailable.
 *
 * Do NOT import these directly in production code.
 * Use lib/llmResumeParser.js instead and let profile/service.js
 * handle the fallback automatically.
 */

const { parseResumeWithRegex } = require('./resumeParser');
const { auditCoverage, mergeGapFillResults, COVERAGE_THRESHOLD } = require('./parseCoverageChecker');
const { analyzeJobText, calculateSkillMatch, calculateFitScore } = require('./jobAnalyzer');

module.exports = {
  parseResumeWithRegex,
  auditCoverage, mergeGapFillResults, COVERAGE_THRESHOLD,
  analyzeJobText, calculateSkillMatch, calculateFitScore,
};
