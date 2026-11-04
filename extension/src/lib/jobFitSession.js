/**
 * Job fit is per job-tab URL. A score for one posting must not render on another.
 * MatchSection keeps the Map; these functions decide what the panel shows.
 */

export function jobKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.origin}${path}${u.search}`;
  } catch {
    return raw.split('#')[0];
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function emptyJobFitView() {
  return {
    status: 'idle',
    errorMsg: null,
    jobTitle: '',
    company: '',
    pageUrl: '',
    score: null,
    matched: [],
    missing: [],
    partial: [],
    blockers: [],
    reasoning: '',
  };
}

/**
 * Tab URL or profile changed.
 * Same key → leave the current screen alone (do not cancel an in-flight analyze).
 * New key → that URL's cached result, or idle. Never another job's score.
 * Profile change → drop every cached score.
 */
export function navigateJobFit({
  cache,
  jobUrl,
  previousKey = '',
  profileId,
  previousProfileId,
}) {
  const key = jobKey(jobUrl);
  const profileChanged = previousProfileId !== profileId;
  const nextCache = profileChanged ? new Map() : cache;
  if (!profileChanged && key === previousKey) {
    return { changed: false, key, cache: nextCache, view: null };
  }
  const cached = key ? nextCache.get(key) : null;
  return {
    changed: true,
    key,
    cache: nextCache,
    view: cached || emptyJobFitView(),
  };
}

/**
 * Store a finished analyze under the page that was scored.
 * Show it only when that page is still the open job tab.
 */
export function storeJobFitResult({ cache, activeKey, scoredUrl, view }) {
  const scoredKey = jobKey(scoredUrl);
  const next = new Map(cache);
  if (scoredKey) next.set(scoredKey, view);
  const show = !(activeKey && scoredKey && activeKey !== scoredKey);
  return { cache: next, show, view };
}

/** Clear drops only the open job URL. */
export function clearJobFitUrl({ cache, activeKey }) {
  const next = new Map(cache);
  if (activeKey) next.delete(activeKey);
  return { cache: next, view: emptyJobFitView() };
}
