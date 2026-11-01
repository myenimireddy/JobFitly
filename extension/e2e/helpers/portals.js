import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, '../portals.json'), 'utf8'));

/** Resolve live portal URL (env override wins). */
export function portalUrl(name) {
  const entry = catalog[name];
  if (!entry) throw new Error(`Unknown portal: ${name}`);
  if (entry.env && process.env[entry.env]) return process.env[entry.env];
  return entry.url;
}

export function portalCatalog() {
  return catalog;
}
