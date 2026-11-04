/** Compact, unambiguous label for saved-profile selectors. */
export function profileSummaryLabel(summary) {
  const name = String(summary?.name || 'Untitled profile').trim() || 'Untitled profile';
  const id = String(summary?.id || '').slice(0, 8);
  const status = summary?.captureComplete ? 'ready' : 'details needed';
  return `${name}${id ? ` · ${id}` : ''} · ${status}`;
}
