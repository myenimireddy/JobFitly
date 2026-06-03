import { cleanLabelText, setNativeValue, highlight, labelsMatch, norm } from './utils.js';

/**
 * Greenhouse ATS parser (boards.greenhouse.io / grnh.se)
 * DOM structure:
 *   .field  (or  #application_fields .field)
 *     label
 *     input | textarea | select | div.multi-select
 */
export const GreenhouseParser = {
  name: 'Greenhouse',

  matches(hostname, doc) {
    return hostname.includes('greenhouse.io') ||
           hostname.includes('grnh.se') ||
           !!doc?.querySelector('#application_form, #application-form, #application_fields');
  },

  _getLabel(field) {
    const lEl = field.querySelector('label');
    return lEl ? cleanLabelText(lEl) : null;
  },

  scrapeFields(doc) {
    const fields = [];
    const seen = new Set();

    doc.querySelectorAll('.field, [class*="field--"]').forEach((field) => {
      const label = this._getLabel(field);
      if (!label) return;
      const key = norm(label);
      if (seen.has(key)) return;

      // Radio/checkbox group
      const radioGroup = field.querySelector('[role="radiogroup"], .radio-group, .checkbox-group');
      if (radioGroup) {
        const inputs = Array.from(radioGroup.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        if (inputs.length > 0) {
          seen.add(key);
          fields.push({
            label, type: inputs[0].type,
            name: inputs[0].name || null, id: null,
            required: !!inputs.find(i => i.required),
            options: inputs.map(i => {
              const l = i.closest('label') || i.parentElement;
              return l ? cleanLabelText(l) : i.value;
            }).filter(Boolean),
            placeholder: null, currentValue: null,
          });
          return;
        }
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
            .filter(t => t && !/^(select|choose)/i.test(t)),
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
          required: textarea.required,
          options: null, placeholder: textarea.placeholder || null,
          currentValue: textarea.value || null,
        });
        return;
      }

      // Input
      const input = field.querySelector(
        'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"])'
      );
      if (input) {
        seen.add(key);
        fields.push({
          label, type: input.type || 'text',
          name: input.name || null, id: input.id || null,
          required: input.required,
          options: null, placeholder: input.placeholder || null,
          currentValue: input.value || null,
        });
      }
    });

    return fields;
  },

  injectAnswer(label, answer, doc) {
    const fieldEls = doc.querySelectorAll('.field, [class*="field--"]');
    for (const field of fieldEls) {
      const fLabel = this._getLabel(field);
      if (!fLabel || !labelsMatch(fLabel, label)) continue;

      const radios = field.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        for (const r of radios) {
          const rLabel = r.closest('label') ? cleanLabelText(r.closest('label')) : r.value;
          if (norm(rLabel) === norm(answer) || norm(r.value) === norm(answer)) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            highlight(r.closest('label') || r);
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
