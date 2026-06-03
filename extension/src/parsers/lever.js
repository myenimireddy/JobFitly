import { cleanLabelText, setNativeValue, highlight, labelsMatch, norm } from './utils.js';

/**
 * Lever ATS parser (jobs.lever.co)
 * DOM structure:
 *   .application-question
 *     .application-label [.text]   ← question text
 *     .application-field
 *       input | textarea | select | ul[data-qa="multiple-choice"]
 */
export const LeverParser = {
  name: 'Lever',

  matches(hostname) {
    return hostname.includes('lever.co') || hostname.includes('jobs.lever.co');
  },

  /** Extract clean label from a .application-question */
  _getLabel(question) {
    const el = question.querySelector('.application-label .text') ||
               question.querySelector('.application-label');
    return el ? cleanLabelText(el) : null;
  },

  scrapeFields(doc) {
    const fields = [];
    const seen = new Set();

    doc.querySelectorAll('.application-question').forEach((question) => {
      const label = this._getLabel(question);
      if (!label) return;
      const key = norm(label);
      if (seen.has(key)) return;

      const fieldDiv = question.querySelector('.application-field');
      if (!fieldDiv) return;

      // Radio / multiple-choice
      const radioGroup = fieldDiv.querySelector('ul[data-qa="multiple-choice"]');
      if (radioGroup) {
        const radios = Array.from(radioGroup.querySelectorAll('input[type="radio"]'));
        seen.add(key);
        fields.push({
          label, type: 'radio',
          name: radios[0]?.name || null, id: null,
          required: !!radios.find(r => r.required),
          options: radios.map(r => r.value).filter(Boolean),
          placeholder: null, currentValue: null,
        });
        return;
      }

      // Select
      const select = fieldDiv.querySelector('select');
      if (select) {
        seen.add(key);
        fields.push({
          label, type: 'select',
          name: select.name || null, id: select.id || null,
          required: select.required,
          options: Array.from(select.options)
            .map(o => o.text.trim())
            .filter(t => t && !/^select/i.test(t)),
          placeholder: null, currentValue: select.value || null,
        });
        return;
      }

      // Textarea
      const textarea = fieldDiv.querySelector('textarea');
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

      // Input (text/email/tel/url — skip file/hidden/submit)
      const input = fieldDiv.querySelector(
        'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"])'
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
    const questions = doc.querySelectorAll('.application-question');
    for (const question of questions) {
      const qLabel = this._getLabel(question);
      if (!qLabel || !labelsMatch(qLabel, label)) continue;

      const fieldDiv = question.querySelector('.application-field');
      if (!fieldDiv) return false;

      // Radio
      const radios = fieldDiv.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        for (const r of radios) {
          if (norm(r.value) === norm(answer)) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            highlight(r.closest('li'));
            return true;
          }
        }
        // Partial match fallback
        for (const r of radios) {
          if (norm(r.value).includes(norm(answer)) || norm(answer).includes(norm(r.value))) {
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            highlight(r.closest('li'));
            return true;
          }
        }
        return false;
      }

      // Select
      const select = fieldDiv.querySelector('select');
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

      // Textarea / input
      const el = fieldDiv.querySelector('textarea') ||
        fieldDiv.querySelector('input:not([type="hidden"]):not([type="file"])');
      if (el) {
        setNativeValue(el, answer);
        highlight(el);
        return true;
      }
    }
    return false;
  },
};
