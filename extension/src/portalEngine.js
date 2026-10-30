/**
 * One scrape + inject engine for job application pages.
 * Used by the content script and by tests.
 */

// ── Utilities ─────────────────────────────────────────────────────────────────

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanLabel(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('span.required, span[aria-hidden], svg, button').forEach(c => c.remove());
  return (clone.textContent || clone.innerText || '').trim().replace(/\s+/g, ' ').replace(/[*:]+$/, '').trim();
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function labelsMatch(a, b) {
  const na = norm(a), nb = norm(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function isSubmitControl(el) {
  if (!el) return false;
  const type = (el.type || '').toLowerCase();
  return ['submit', 'button', 'image', 'reset'].includes(type);
}

function page() {
  const win = PortalEngine._window || globalThis.window;
  const doc = PortalEngine._document || globalThis.document;
  return { win, doc };
}

// ── PortalEngine ──────────────────────────────────────────────────────────────

const PortalEngine = {
  portals: {},

  register(name, handler) {
    this.portals[name] = handler;
  },

  detect() {
    const { win, doc } = page();
    const url = win.location.href;
    const hostname = win.location.hostname;
    for (const [name, handler] of Object.entries(this.portals)) {
      if (handler.detect && handler.detect(url, hostname, doc)) {
        console.log(`[PortalEngine] Detected: ${name}`);
        return name;
      }
    }
    return null;
  },

  scrape(portalName = null) {
    const { doc } = page();
    const name = portalName || this.detect();
    if (!name || !this.portals[name]) {
      console.log('[PortalEngine] No portal detected, using generic scraper');
      return this.genericScrape();
    }
    const handler = this.portals[name];
    if (handler.scrape) {
      try {
        const fields = handler.scrape(doc);
        console.log(`[PortalEngine] ${name} scraped ${fields.length} fields`);
        if (fields.length === 0) {
          console.log(`[PortalEngine] ${name} returned 0, falling back to generic`);
          return this.genericScrape();
        }
        return fields;
      } catch (err) {
        console.error(`[PortalEngine] ${name} scrape error:`, err);
        return this.genericScrape();
      }
    }
    return this.genericScrape();
  },

  inject(answers, portalName = null) {
    const { doc } = page();
    const name = portalName || this.detect();
    let filled = 0;
    if (name && this.portals[name] && this.portals[name].inject) {
      try {
        filled = this.portals[name].inject(doc, answers);
        console.log(`[PortalEngine] ${name} filled ${filled} fields`);
      } catch (err) {
        console.error(`[PortalEngine] ${name} inject error:`, err);
      }
    }
    const genericFilled = this.genericInject(answers);
    console.log(`[PortalEngine] generic pass filled ${genericFilled} additional fields`);
    return filled + genericFilled;
  },

  genericScrape() {
    const { doc } = page();
    const fields = [];
    const seen = new Set();
    const inputs = doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="image"]), textarea, select'
    );
    inputs.forEach((el) => {
      if (el.style && el.style.display === 'none') return;
      let label = '';
      if (el.id) {
        const labelEl = doc.querySelector(`label[for="${el.id}"]`);
        if (labelEl) label = (labelEl.textContent || labelEl.innerText || '').trim();
      }
      if (!label) {
        const closest = el.closest('label');
        if (closest) {
          const clone = closest.cloneNode(true);
          clone.querySelectorAll('input, textarea, select').forEach(c => c.remove());
          label = (clone.textContent || clone.innerText || '').trim();
        }
      }
      if (!label) {
        label = el.placeholder || el.getAttribute('aria-label') || el.name || el.id || '';
      }
      const key = `${label}::${el.type || el.tagName}`;
      if (seen.has(key) || !label) return;
      seen.add(key);
      fields.push({
        id: el.id || null,
        name: el.name || null,
        type: el.tagName === 'SELECT' ? 'select' : (el.type || 'text'),
        label: label.replace(/\s+/g, ' ').slice(0, 120),
        placeholder: el.placeholder || null,
        required: el.required || el.getAttribute('aria-required') === 'true',
        currentValue: el.value || null,
        options: el.tagName === 'SELECT'
          ? Array.from(el.options).map(o => o.text.trim()).filter(Boolean)
          : null,
      });
    });
    return fields;
  },

  genericInject(answers) {
    const { doc } = page();
    let filled = 0;
    answers.forEach(({ label, answer }) => {
      if (!answer) return;
      const inputs = doc.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
      for (const input of inputs) {
        if (isSubmitControl(input)) continue;
        let inputLabel = '';
        if (input.id) {
          const labelEl = doc.querySelector(`label[for="${input.id}"]`);
          if (labelEl) inputLabel = cleanLabel(labelEl);
        }
        if (!inputLabel) {
          const closest = input.closest('label');
          if (closest) inputLabel = cleanLabel(closest);
        }
        if (!inputLabel) inputLabel = input.getAttribute('aria-label') || input.placeholder || input.name || '';
        if (!inputLabel || !labelsMatch(inputLabel, label)) continue;
        if (input.type === 'radio') {
          if (norm(input.value) === norm(answer) || norm(input.value).includes(norm(answer))) {
            input.checked = true;
            input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
          continue;
        }
        if (input.tagName === 'SELECT') {
          for (const opt of input.options) {
            const optText = opt.text || opt.label || '';
            if (norm(optText).includes(norm(answer)) || norm(answer).includes(norm(optText))) {
              input.value = opt.value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              filled++;
              break;
            }
          }
        } else {
          setNativeValue(input, answer);
          filled++;
        }
        break;
      }
    });
    return filled;
  }
};

// ── Portal: Workday ───────────────────────────────────────────────────────────

PortalEngine.register('workday', {
  detect(url, hostname) {
    return hostname.includes('myworkdayjobs.com') || hostname.includes('workday.com');
  },

  scrape(doc) {
    const fields = [];
    const seen = new Set();
    const allFields = doc.querySelectorAll('[data-automation-id^="formField-"], [data-automation-id="radioGroup"]');
    console.log(`[PortalEngine] Workday: found ${allFields.length} fields`);

    allFields.forEach((field) => {
      const autoId = field.dataset.automationId || '';
      if (seen.has(autoId.toLowerCase())) return;

      const labelEl = field.querySelector('[data-automation-id="formLabel"], label, .css-1ud5i8o');
      const label = labelEl ? cleanLabel(labelEl) : null;
      if (!label) return;
      if (seen.has(norm(label))) return;

      const radios = field.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        seen.add(norm(label));
        fields.push({
          label, type: 'radio', name: radios[0]?.name || null, id: null,
          required: !!field.querySelector('[aria-required="true"]'),
          options: Array.from(radios).map(r => {
            const l = doc.querySelector(`label[for="${r.id}"]`);
            return l ? cleanLabel(l) : r.value;
          }).filter(Boolean),
          placeholder: null, currentValue: null,
        });
        return;
      }

      const selectWidget = field.querySelector('[data-automation-id="selectWidget"]');
      if (selectWidget) {
        seen.add(norm(label));
        fields.push({
          label, type: 'select', name: null, id: selectWidget.id || null,
          required: selectWidget.getAttribute('aria-required') === 'true',
          options: Array.from(doc.querySelectorAll('[data-automation-id="promptOption"]')).map(o => o.innerText.trim()).filter(Boolean),
          placeholder: null, currentValue: selectWidget.innerText.trim() || null,
        });
        return;
      }

      const select = field.querySelector('select');
      if (select) {
        seen.add(norm(label));
        fields.push({
          label, type: 'select', name: select.name || null, id: select.id || null,
          required: select.required,
          options: Array.from(select.options).map(o => o.text.trim()).filter(t => t && !/^(select|choose)/i.test(t)),
          placeholder: null, currentValue: select.value || null,
        });
        return;
      }

      const textarea = field.querySelector('textarea');
      if (textarea) {
        seen.add(norm(label));
        fields.push({
          label, type: 'textarea', name: textarea.name || null, id: textarea.id || null,
          required: textarea.required || textarea.getAttribute('aria-required') === 'true',
          options: null, placeholder: textarea.placeholder || null, currentValue: textarea.value || null,
        });
        return;
      }

      const input = field.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"])');
      if (input) {
        seen.add(norm(label));
        fields.push({
          label, type: input.type || 'text', name: input.name || null, id: input.id || null,
          required: input.required || input.getAttribute('aria-required') === 'true',
          options: null, placeholder: input.placeholder || null, currentValue: input.value || null,
        });
      }
    });
    return fields;
  },

  inject(doc, answers) {
    let filled = 0;
    const formFields = doc.querySelectorAll('[data-automation-id^="formField-"], [data-automation-id="radioGroup"]');
    answers.forEach(({ label, answer }) => {
      if (!answer) return;
      for (const field of formFields) {
        const labelEl = field.querySelector('[data-automation-id="formLabel"], label, .css-1ud5i8o');
        const fLabel = labelEl ? cleanLabel(labelEl) : null;
        if (!fLabel || !labelsMatch(fLabel, label)) continue;

        const radios = field.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
          for (const r of radios) {
            const rLabel = doc.querySelector(`label[for="${r.id}"]`);
            const rText = rLabel ? cleanLabel(rLabel) : r.value;
            if (norm(rText) === norm(answer)) {
              r.checked = true;
              r.dispatchEvent(new Event('change', { bubbles: true }));
              filled++; break;
            }
          }
          break;
        }

        const selectWidget = field.querySelector('[data-automation-id="selectWidget"]');
        if (selectWidget) {
          selectWidget.click();
          setTimeout(() => {
            const opts = doc.querySelectorAll('[data-automation-id="promptOption"]');
            for (const opt of opts) {
              if (norm(opt.innerText) === norm(answer)) { opt.click(); filled++; break; }
            }
          }, 300);
          break;
        }

        const select = field.querySelector('select');
        if (select) {
          for (const opt of select.options) {
            if (norm(opt.value) === norm(answer) || norm(opt.text) === norm(answer)) {
              select.value = opt.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              filled++; break;
            }
          }
          break;
        }

        const el = field.querySelector('textarea') ||
          field.querySelector('input:not([type="hidden"]):not([type="file"])');
        if (el) { setNativeValue(el, answer); filled++; }
        break;
      }
    });
    return filled;
  }
});

// ── Portal: Lever ─────────────────────────────────────────────────────────────

PortalEngine.register('lever', {
  detect(url, hostname) {
    return hostname.includes('lever.co') || hostname.includes('jobs.lever.co');
  },

  scrape(doc) {
    const fields = [];
    const seen = new Set();
    doc.querySelectorAll('.application-question').forEach(question => {
      const labelEl = question.querySelector('.application-label .text, .application-label');
      const label = labelEl ? cleanLabel(labelEl) : null;
      if (!label || seen.has(norm(label))) return;
      const fieldDiv = question.querySelector('.application-field');
      if (!fieldDiv) return;

      const radioGroup = fieldDiv.querySelector('ul[data-qa="multiple-choice"]');
      if (radioGroup) {
        const radios = Array.from(radioGroup.querySelectorAll('input[type="radio"]'));
        seen.add(norm(label));
        fields.push({ label, type: 'radio', name: radios[0]?.name || null, id: null,
          required: !!radios.find(r => r.required), options: radios.map(r => r.value).filter(Boolean),
          placeholder: null, currentValue: null });
        return;
      }

      const select = fieldDiv.querySelector('select');
      if (select) {
        seen.add(norm(label));
        fields.push({ label, type: 'select', name: select.name || null, id: select.id || null,
          required: select.required,
          options: Array.from(select.options).map(o => o.text.trim()).filter(t => t && !/^select/i.test(t)),
          placeholder: null, currentValue: select.value || null });
        return;
      }

      const textarea = fieldDiv.querySelector('textarea');
      if (textarea) {
        seen.add(norm(label));
        fields.push({ label, type: 'textarea', name: textarea.name || null, id: textarea.id || null,
          required: textarea.required, options: null, placeholder: textarea.placeholder || null, currentValue: textarea.value || null });
        return;
      }

      const input = fieldDiv.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"])');
      if (input) {
        seen.add(norm(label));
        fields.push({ label, type: input.type || 'text', name: input.name || null, id: input.id || null,
          required: input.required, options: null, placeholder: input.placeholder || null, currentValue: input.value || null });
      }
    });
    return fields;
  },

  inject(doc, answers) {
    let filled = 0;
    answers.forEach(({ label, answer }) => {
      if (!answer) return;
      for (const question of doc.querySelectorAll('.application-question')) {
        const labelEl = question.querySelector('.application-label .text, .application-label');
        const qLabel = labelEl ? cleanLabel(labelEl) : null;
        if (!qLabel || !labelsMatch(qLabel, label)) continue;
        const fieldDiv = question.querySelector('.application-field');
        if (!fieldDiv) break;

        const radios = fieldDiv.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
          for (const r of radios) {
            if (norm(r.value) === norm(answer) || norm(r.value).includes(norm(answer))) {
              r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); filled++; break;
            }
          }
          break;
        }

        const select = fieldDiv.querySelector('select');
        if (select) {
          for (const opt of select.options) {
            if (norm(opt.value) === norm(answer) || norm(opt.text) === norm(answer)) {
              select.value = opt.value; select.dispatchEvent(new Event('change', { bubbles: true })); filled++; break;
            }
          }
          break;
        }

        const el = fieldDiv.querySelector('textarea') || fieldDiv.querySelector('input:not([type="hidden"]):not([type="file"])');
        if (el) { setNativeValue(el, answer); filled++; }
        break;
      }
    });
    return filled;
  }
});

// ── Portal: Greenhouse ────────────────────────────────────────────────────────

PortalEngine.register('greenhouse', {
  detect(url, hostname, doc) {
    return hostname.includes('greenhouse.io') || hostname.includes('grnh.se') ||
           !!doc.querySelector('#application_form, #application_fields, #application-form');
  },

  scrape(doc) {
    const fields = [];
    const seen = new Set();
    const root = doc.querySelector('#application_form, #application_fields') || doc;
    root.querySelectorAll('.field, [class*="field--"]').forEach(field => {
      const labelEl = field.querySelector('label');
      const label = labelEl ? cleanLabel(labelEl) : null;
      if (!label || seen.has(norm(label))) return;

      const radioGroup = field.querySelector('[role="radiogroup"], .radio-group, .checkbox-group');
      if (radioGroup) {
        const inputs = Array.from(radioGroup.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
        if (inputs.length) {
          seen.add(norm(label));
          fields.push({ label, type: inputs[0].type, name: inputs[0].name || null, id: null,
            required: !!inputs.find(i => i.required),
            options: inputs.map(i => { const l = i.closest('label') || i.parentElement; return l ? cleanLabel(l) : i.value; }).filter(Boolean),
            placeholder: null, currentValue: null });
          return;
        }
      }

      const select = field.querySelector('select');
      if (select) {
        seen.add(norm(label));
        fields.push({ label, type: 'select', name: select.name || null, id: select.id || null,
          required: select.required,
          options: Array.from(select.options).map(o => o.text.trim()).filter(t => t && !/^(select|choose)/i.test(t)),
          placeholder: null, currentValue: select.value || null });
        return;
      }

      const textarea = field.querySelector('textarea');
      if (textarea) {
        seen.add(norm(label));
        fields.push({ label, type: 'textarea', name: textarea.name || null, id: textarea.id || null,
          required: textarea.required, options: null, placeholder: textarea.placeholder || null, currentValue: textarea.value || null });
        return;
      }

      const input = field.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"])');
      if (input) {
        seen.add(norm(label));
        fields.push({ label, type: input.type || 'text', name: input.name || null, id: input.id || null,
          required: input.required, options: null, placeholder: input.placeholder || null, currentValue: input.value || null });
      }
    });

    // Fallback to generic if no .field containers found
    if (fields.length === 0) {
      console.log('[PortalEngine] Greenhouse: no .field elements, falling back to generic');
      return PortalEngine.genericScrape();
    }
    return fields;
  },

  inject(doc, answers) {
    let filled = 0;
    answers.forEach(({ label, answer }) => {
      if (!answer) return;
      const root = doc.querySelector('#application_form, #application_fields') || doc;
      for (const field of root.querySelectorAll('.field, [class*="field--"]')) {
        const labelEl = field.querySelector('label');
        const fLabel = labelEl ? cleanLabel(labelEl) : null;
        if (!fLabel || !labelsMatch(fLabel, label)) continue;

        const radios = field.querySelectorAll('input[type="radio"]');
        if (radios.length > 0) {
          // Try exact match first, then partial
          let matched = null;
          for (const r of radios) {
            const rLabel = r.closest('label') ? cleanLabel(r.closest('label')) : r.value;
            if (norm(rLabel) === norm(answer) || norm(r.value) === norm(answer)) { matched = r; break; }
          }
          if (!matched) {
            for (const r of radios) {
              const rLabel = r.closest('label') ? cleanLabel(r.closest('label')) : r.value;
              if (norm(rLabel).includes(norm(answer)) || norm(answer).includes(norm(rLabel))) { matched = r; break; }
            }
          }
          if (matched) {
            matched.checked = true;
            matched.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            matched.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
          break;
        }

        const select = field.querySelector('select');
        if (select) {
          let matched = false;
          for (const opt of select.options) {
            if (norm(opt.value) === norm(answer) || norm(opt.text) === norm(answer) ||
                norm(opt.text).includes(norm(answer)) || norm(answer).includes(norm(opt.text))) {
              select.value = opt.value;
              select.dispatchEvent(new Event('input', { bubbles: true }));
              select.dispatchEvent(new Event('change', { bubbles: true }));
              matched = true; filled++; break;
            }
          }
          break;
        }

        const el = field.querySelector('textarea') || field.querySelector('input:not([type="hidden"]):not([type="file"])');
        if (el) { setNativeValue(el, answer); filled++; }
        break;
      }
    });
    return filled;
  }
});

// ── Portal: Ashby ─────────────────────────────────────────────────────────────

PortalEngine.register('ashby', {
  detect(url, hostname, doc) {
    return !!doc.querySelector('[data-field-path]') || !!doc.querySelector('[class*="ashby"]') ||
           hostname.includes('ashbyhq.com');
  },

  scrape(doc) {
    const fields = [];
    const seen = new Set();
    doc.querySelectorAll('[data-field-path]').forEach(fieldEl => {
      const labelEl = fieldEl.querySelector('.ashby-application-form-question-title, label, [class*="title"]');
      const label = labelEl ? cleanLabel(labelEl) : null;
      if (!label || seen.has(norm(label))) return;

      const yesNo = fieldEl.querySelectorAll('[data-value]');
      if (yesNo.length) {
        seen.add(norm(label));
        fields.push({ label, type: 'radio', name: null, id: null, required: false,
          options: Array.from(yesNo).map(b => b.dataset.value || b.innerText.trim()).filter(Boolean),
          placeholder: null, currentValue: null });
        return;
      }

      const select = fieldEl.querySelector('select');
      if (select) {
        seen.add(norm(label));
        fields.push({ label, type: 'select', name: select.name || null, id: select.id || null,
          required: select.required,
          options: Array.from(select.options).map(o => o.text.trim()).filter(t => t && !/^(select|choose)/i.test(t)),
          placeholder: null, currentValue: select.value || null });
        return;
      }

      const textarea = fieldEl.querySelector('textarea');
      if (textarea) {
        seen.add(norm(label));
        fields.push({ label, type: 'textarea', name: textarea.name || null, id: textarea.id || null,
          required: false, options: null, placeholder: textarea.placeholder || null, currentValue: textarea.value || null });
        return;
      }

      const input = fieldEl.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="submit"])');
      if (input) {
        seen.add(norm(label));
        fields.push({ label, type: input.type || 'text', name: input.name || null, id: input.id || null,
          required: input.required, options: null, placeholder: input.placeholder || null, currentValue: input.value || null });
      }
    });
    return fields;
  },

  inject(doc, answers) {
    let filled = 0;
    answers.forEach(({ label, answer }) => {
      if (!answer) return;
      for (const fieldEl of doc.querySelectorAll('[data-field-path]')) {
        const labelEl = fieldEl.querySelector('.ashby-application-form-question-title, label, [class*="title"]');
        const fLabel = labelEl ? cleanLabel(labelEl) : null;
        if (!fLabel || !labelsMatch(fLabel, label)) continue;

        const yesNo = Array.from(fieldEl.querySelectorAll('[data-value]'));
        if (yesNo.length) {
          const btn = yesNo.find(b => norm(b.dataset.value || b.innerText) === norm(answer));
          if (btn) { btn.click(); filled++; }
          break;
        }

        const select = fieldEl.querySelector('select');
        if (select) {
          for (const opt of select.options) {
            if (norm(opt.value) === norm(answer) || norm(opt.text) === norm(answer)) {
              select.value = opt.value; select.dispatchEvent(new Event('change', { bubbles: true })); filled++; break;
            }
          }
          break;
        }

        const el = fieldEl.querySelector('textarea') || fieldEl.querySelector('input:not([type="hidden"]):not([type="file"])');
        if (el) { setNativeValue(el, answer); filled++; }
        break;
      }
    });
    return filled;
  }
});

export { PortalEngine, isSubmitControl };
