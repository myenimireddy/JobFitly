import { cleanLabelText, setNativeValue, highlight, labelsMatch, norm } from './utils.js';

/**
 * LinkedIn Easy Apply parser (linkedin.com)
 * DOM structure:
 *   .jobs-easy-apply-form-section__grouping  (or .fb__form-element)
 *     label
 *     input | textarea | select | fieldset (radio)
 */
export const LinkedInParser = {
  name: 'LinkedIn',

  matches(hostname) {
    return hostname.includes('linkedin.com');
  },

  _getLabel(field) {
    const lEl = field.querySelector('label, legend');
    return lEl ? cleanLabelText(lEl) : null;
  },

  scrapeFields(doc) {
    const fields = [];
    const seen = new Set();

    const containers = doc.querySelectorAll(
      '.jobs-easy-apply-form-section__grouping, .fb__form-element, .artdeco-text-input--container, fieldset'
    );

    containers.forEach((field) => {
      const label = this._getLabel(field);
      if (!label) return;
      const key = norm(label);
      if (seen.has(key)) return;

      // Radio (fieldset with input[type=radio])
      const radios = field.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        seen.add(key);
        fields.push({
          label, type: 'radio',
          name: radios[0]?.name || null, id: null,
          required: !!field.querySelector('[required]'),
          options: Array.from(radios).map(r => {
            const l = doc.querySelector(`label[for="${r.id}"]`) || r.parentElement;
            return l ? cleanLabelText(l) : r.value;
          }).filter(Boolean),
          placeholder: null, currentValue: null,
        });
        return;
      }

      // Select
      const select = field.querySelector('select');
      if (select) {
        seen.add(key);
        fields.push({
          label, type: 'select',
          name: select.name || null, id: select.id || null,
          required: select.required,
          options: Array.from(select.options)
            .map(o => o.text.trim())
            .filter(t => t && !/^(select|choose|please)/i.test(t)),
          placeholder: null, currentValue: select.value || null,
        });
        return;
      }

      // Textarea
      const textarea = field.querySelector('textarea');
      if (textarea) {
        seen.add(key);
        fields.push({
          label, type: 'textarea',
          name: textarea.name || null, id: textarea.id || null,
          required: textarea.required || textarea.getAttribute('aria-required') === 'true',
          options: null, placeholder: textarea.placeholder || null,
          currentValue: textarea.value || null,
        });
        return;
      }

      // Input
      const input = field.querySelector(
        'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"])'
      );
      if (input) {
        seen.add(key);
        fields.push({
          label, type: input.type || 'text',
          name: input.name || null, id: input.id || null,
          required: input.required || input.getAttribute('aria-required') === 'true',
          options: null, placeholder: input.placeholder || null,
          currentValue: input.value || null,
        });
      }
    });

    return fields;
  },

  injectAnswer(label, answer, doc) {
    const containers = doc.querySelectorAll(
      '.jobs-easy-apply-form-section__grouping, .fb__form-element, .artdeco-text-input--container, fieldset'
    );
    for (const field of containers) {
      const fLabel = this._getLabel(field);
      if (!fLabel || !labelsMatch(fLabel, label)) continue;

      const radios = field.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        for (const r of radios) {
          const rLabel = doc.querySelector(`label[for="${r.id}"]`);
          const rText = rLabel ? cleanLabelText(rLabel) : r.value;
          if (norm(rText) === norm(answer)) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            highlight(rLabel || r);
            return true;
          }
        }
        return false;
      }

      const select = field.querySelector('select');
      if (select) {
        for (const opt of select.options) {
          if (norm(opt.value) === norm(answer) || norm(opt.text) === norm(answer)) {
            select.value = opt.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            highlight(select);
            return true;
          }
        }
        return false;
      }

      const el = field.querySelector('textarea') ||
        field.querySelector('input:not([type="hidden"]):not([type="file"])');
      if (el) {
        setNativeValue(el, answer);
        highlight(el);
        return true;
      }
    }
    return false;
  },
};
