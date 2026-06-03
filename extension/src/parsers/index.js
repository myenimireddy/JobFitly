import { LeverParser } from './lever.js';
import { GreenhouseParser } from './greenhouse.js';
import { WorkdayParser } from './workday.js';
import { LinkedInParser } from './linkedin.js';
import { GenericParser } from './generic.js';

/**
 * Ordered list of portal-specific parsers.
 * GenericParser is always last as the fallback.
 */
const PARSERS = [
  LeverParser,
  GreenhouseParser,
  WorkdayParser,
  LinkedInParser,
  GenericParser,
];

/**
 * Detect which parser to use for the current page.
 * @param {string} hostname
 * @param {Document} doc
 * @returns {{ parser: object, portalName: string }}
 */
export function detectParser(hostname, doc) {
  for (const parser of PARSERS) {
    if (parser.matches(hostname, doc)) {
      return { parser, portalName: parser.name };
    }
  }
  return { parser: GenericParser, portalName: 'Generic' };
}

/**
 * Scrape fields using the appropriate portal parser.
 * Strips internal _el references before returning (safe to JSON-serialize).
 * @param {Document} doc
 * @returns {{ fields: Array, portalName: string }}
 */
export function scrapeFields(doc = document) {
  const hostname = doc.location?.hostname || window.location.hostname;
  const { parser, portalName } = detectParser(hostname, doc);
  const raw = parser.scrapeFields(doc);
  // Strip any live DOM references before serialization
  const fields = raw.map(({ _el, ...rest }) => rest);
  return { fields, portalName };
}

/**
 * Inject all answers using the appropriate portal parser.
 * @param {Array<{label: string, answer: string}>} answers
 * @param {Document} doc
 * @returns {{ filled: number, portalName: string }}
 */
export function injectAnswers(answers, doc = document) {
  const hostname = doc.location?.hostname || window.location.hostname;
  const { parser, portalName } = detectParser(hostname, doc);
  let filled = 0;
  for (const { label, answer } of answers) {
    if (answer && parser.injectAnswer(label, answer, doc)) filled++;
  }
  return { filled, portalName };
}
