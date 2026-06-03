import { cleanLabelText, setNativeValue, highlight, labelsMatch, norm } from './utils.js';

/**
 * Generic fallback parser — works on any standard HTML form.
 * Uses label[for], closest label, aria-label, placeholder, and name as label sources.
 */
export const GenericParser = {
  name: 'Generic',

  matches() { return true; }, // always matches as fallback

  _getLabelForEl(el, doc) {
    if (el.id) {
      const lEl = doc.querySelector(`label[for="${el.id}"]`);
      if (lEl) return cleanLabelText(lEl);
    }
    const closest = el.closest('label');
    if (closest) return cleanLabelText(closest);
    const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
    if (ariaLabel) {
      const refEl = doc.getElementById(ariaLabel);
      return refEl ? cleanLabelText(refEl) : ariaLabel;
    }
    return el.placeholder || el.name || el.id || '';
  },

  scrapeFields(doc) {
    const fields = [];
    const seen = new Set();

    const inputs = doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="image"]), textarea, select'
    );

    inputs.forEach((el) => {
      // Skip invisible elements (except radio/checkbox which may be visually hidden)
      if (!el.offsetParent && el.type !== 'radio' && el.type !== 'checkbox') return;

      const label = this._getLabelForEl(el, doc);
      if (!label) return;

      const key = `${norm(label)}::${el.type || el.tagName}`;
      if (seen.has(key)) return;
      seen.add(key);

      fields.push({
        label: label.slice(0, 120),
        type: el.tagName === 'SELECT' ? 'select' : (el.type || 'text'),
        name: el.name || null,
        id: el.id || null,
        required: el.required || el.getAttribute('aria-required') === 'true',
        options: el.tagName === 'SELECT'
          ? Array.from(el.options).map(o => o.text.trim()).filter(t => t && !/^(select|choose)/i.test(t))
          : null,
        placeholder: el.placeholder || null,
        currentValue: el.value || null,
      });
    });

    return fields;
  },

  injectAnswer(label, answer, doc) {
    const inputs = doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select'
    );

    for (const el of inputs) {
      const elLabel = this._getLabelForEl(el, doc);
      if (!elLabel || !labelsMatch(elLabel, label)) continue;

      if (el.type === 'radio') {
        if (norm(el.value) === norm(answer)) {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
          highlight(el);
          return true;
        }
        continue;
      }

      if (el.tagName === 'SELECT') {
        for (const opt of el.options) {
          if (norm(opt.value) === norm(answer) || norm(opt.text) === norm(answer)) {
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            highlight(el);
            return true;
          }
        }
        continue;
      }

      setNativeValue(el, answer);
      highlight(el);
      return true;
    }

    return false;
  },
};
