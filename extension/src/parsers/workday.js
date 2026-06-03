import { cleanLabelText, setNativeValue, highlight, labelsMatch, norm } from './utils.js';

/**
 * Workday ATS parser (*.myworkdayjobs.com)
 * DOM structure (Workday uses data-automation-id attributes):
 *   [data-automation-id="formField"]
 *     label  or  [data-automation-id="formLabel"]
 *     input | textarea | [data-automation-id="selectWidget"] | radio group
 */
export const WorkdayParser = {
  name: 'Workday',

  matches(hostname, doc) {
    return hostname.includes('myworkdayjobs.com') ||
           hostname.includes('workday.com') ||
           !!doc?.querySelector('[data-automation-id^="formField-"]');
  },

  _getLabel(field) {
    const lEl = field.querySelector('[data-automation-id="formLabel"], label');
    return lEl ? cleanLabelText(lEl) : null;
  },

  scrapeFields(doc) {
    const fields = [];
    const seen = new Set();

    const formFields = doc.querySelectorAll(
      '[data-automation-id^="formField-"], [data-automation-id="formField"], [data-automation-id="radioGroup"]'
    );

    formFields.forEach((field) => {
      const label = this._getLabel(field);
      if (!label) return;
      const key = norm(label);
      if (seen.has(key)) return;

      // Radio group
      const radios = field.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        seen.add(key);
        fields.push({
          label, type: 'radio',
          name: radios[0]?.name || null, id: null,
          required: !!field.querySelector('[aria-required="true"]'),
          options: Array.from(radios).map(r => {
            const l = doc.querySelector(`label[for="${r.id}"]`);
            return l ? cleanLabelText(l) : r.value;
          }).filter(Boolean),
          placeholder: null, currentValue: null,
        });
        return;
      }

      // Workday custom select widget
      const selectWidget = field.querySelector('[data-automation-id="selectWidget"]');
      if (selectWidget) {
        const optionEls = doc.querySelectorAll('[data-automation-id="promptOption"]');
        seen.add(key);
        fields.push({
          label, type: 'select',
          name: null, id: selectWidget.id || null,
          required: selectWidget.getAttribute('aria-required') === 'true',
          options: Array.from(optionEls).map(o => o.innerText.trim()).filter(Boolean),
          placeholder: selectWidget.getAttribute('placeholder') || null,
          currentValue: selectWidget.innerText.trim() || null,
        });
        return;
      }

      // Native select
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
          required: textarea.required || textarea.getAttribute('aria-required') === 'true',
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
          required: input.required || input.getAttribute('aria-required') === 'true',
          options: null, placeholder: input.placeholder || null,
          currentValue: input.value || null,
        });
      }
    });

    return fields;
  },

  injectAnswer(label, answer, doc) {
    const formFields = doc.querySelectorAll(
      '[data-automation-id^="formField-"], [data-automation-id="formField"], [data-automation-id="radioGroup"]'
    );
    for (const field of formFields) {
      const fLabel = this._getLabel(field);
      if (!fLabel || !labelsMatch(fLabel, label)) continue;

      // Radio
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

      // Workday custom select — click to open, then click option
      const selectWidget = field.querySelector('[data-automation-id="selectWidget"]');
      if (selectWidget) {
        selectWidget.click();
        setTimeout(() => {
          const opts = doc.querySelectorAll('[data-automation-id="promptOption"]');
          for (const opt of opts) {
            if (norm(opt.innerText) === norm(answer)) {
              opt.click();
              highlight(selectWidget);
              break;
            }
          }
        }, 300);
        return true;
      }

      // Native select
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
