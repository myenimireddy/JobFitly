/**
 * Shared utilities for portal parsers
 */

/** Normalize a string for fuzzy matching */
export function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Set a value on an input/textarea using the native setter (works with React/Vue) */
export function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA'
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Highlight a filled field with a subtle indigo outline */
export function highlight(el) {
  if (el) el.style.outline = '2px solid rgba(99, 102, 241, 0.7)';
}

/**
 * Get plain label text from an element — strips nested spans/buttons.
 * @param {Element} el
 * @returns {string}
 */
export function cleanLabelText(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('span, a, button, svg').forEach(c => c.remove());
  return clone.innerText.trim().replace(/\s+/g, ' ');
}

/**
 * Fuzzy label match — returns true if labels are similar enough to be the same field.
 */
export function labelsMatch(a, b) {
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}
