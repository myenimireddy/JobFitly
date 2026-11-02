import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, '../portals.json'), 'utf8'));
const MOCKS = join(root, '../../tests/mocks');

/**
 * Canonical fixture URLs — hostname must match PortalEngine.detect() so local
 * HTML is scraped/injected by the right portal module. Never hit the network
 * unless LIVE_ATS=1.
 */
export const FIXTURE_URLS = {
  greenhouse: 'https://job-boards.greenhouse.io/jobfitly-fixture/jobs/local-1',
  lever: 'https://jobs.lever.co/jobfitly-fixture/local-1/apply',
  ashby: 'https://jobs.ashbyhq.com/jobfitly-fixture/application',
  workday: 'https://jobfitly.wd5.myworkdayjobs.com/en-US/external/job/Local-Fixture',
};

export const FIXTURE_FILES = {
  greenhouse: join(MOCKS, 'reddit-greenhouse.html'),
  lever: join(MOCKS, 'lever.html'),
  ashby: join(MOCKS, 'ashby.html'),
  workday: join(MOCKS, 'workday.html'),
};

/** Live ATS is opt-in — default is local HTML fixtures. */
export function useLiveAts() {
  return process.env.LIVE_ATS === '1' || process.env.LIVE_ATS === 'true';
}

/** Resolve navigation URL (fixture host by default; live catalog when LIVE_ATS=1). */
export function portalUrl(name) {
  if (!useLiveAts()) {
    const fixture = FIXTURE_URLS[name];
    if (!fixture) throw new Error(`Unknown portal fixture: ${name}`);
    return fixture;
  }
  const entry = catalog[name];
  if (!entry) throw new Error(`Unknown portal: ${name}`);
  if (entry.env && process.env[entry.env]) return process.env[entry.env];
  return entry.url;
}

export function portalFixturePath(name) {
  const path = FIXTURE_FILES[name];
  if (!path) throw new Error(`Unknown portal fixture file: ${name}`);
  return path;
}

export function portalCatalog() {
  return catalog;
}
