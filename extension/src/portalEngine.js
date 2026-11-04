/**
 * One scrape + inject engine for job application pages.
 *
 * Detect hostname/DOM → portal module or generic paths.
 * Portal-specific quirks live under ./portals/ (e.g. Greenhouse Job Board React-Select).
 * genericInject stays portal-agnostic: native inputs, <select>, radio, checkbox.
 *
 * Do not bulk-scrape React-Select menus or .remove() option trees React owns.
 * Contributor map: extension/README.md
 */

import {
  isGreenhouseJobBoard,
  injectGreenhouseJobBoard,
  scrapeReactSelectOptions,
} from './portals/greenhouseJobBoard.js';

// ── Shared utilities ──────────────────────────────────────────────────────────

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanLabel(el) {
  if (!el) return '';
  const clone = el.cloneNode(true);
  clone.querySelectorAll('span.required, span[aria-hidden], svg, button').forEach(c => c.remove());
  return (clone.textContent || clone.innerText || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[*:✱＊]+$/g, '')
    .trim();
}

/** Scroll + focus the live field being filled; stamp label for e2e assertions. */
function focusFilledField(el, label) {
  if (!el) return;
  try {
    el.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    const root = el.ownerDocument?.documentElement;
    if (root) {
      root.dataset.jobfitlyActiveLabel = String(label || '').slice(0, 200);
      root.dataset.jobfitlyActiveAt = String(Date.now());
    }
  } catch { /* ignore */ }
}

function setNativeValue(el, value, label = '') {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  focusFilledField(el, label);
}

function labelTokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Score label similarity. Exact wins. Token subset allowed with a penalty for
 * extra tokens so "Country" does not steal "Country Phone Code".
 */
function labelMatchScore(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 10000 + na.length;
  if (Math.min(na.length, nb.length) <= 3) return 0;
  const ta = labelTokens(a);
  const tb = labelTokens(b);
  if (!ta.length || !tb.length) return 0;
  const aInB = ta.every((t) => tb.includes(t));
  const bInA = tb.every((t) => ta.includes(t));
  if (aInB || bInA) {
    const shared = Math.min(ta.length, tb.length);
    const extra = Math.abs(ta.length - tb.length);
    return shared * 100 - extra * 80;
  }
  const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
  if (ratio >= 0.85 && (na.includes(nb) || nb.includes(na))) return Math.floor(ratio * 100);
  return 0;
}

function labelsMatch(a, b) {
  return labelMatchScore(a, b) > 0;
}

/**
 * Pick the best-labeled field. When several share the top score (Work Experience 1/2/…),
 * `occurrence` selects the Nth match in DOM order (0-based).
 */
function pickBestField(fields, answerLabel, getLabel, occurrence = 0) {
  let bestScore = 0;
  const scored = [];
  for (const field of fields) {
    const fLabel = getLabel(field);
    if (!fLabel) continue;
    const score = labelMatchScore(fLabel, answerLabel);
    if (score <= 0) continue;
    scored.push({ field, score });
    if (score > bestScore) bestScore = score;
  }
  if (!bestScore) return null;
  const top = scored.filter((s) => s.score === bestScore).map((s) => s.field);
  const idx = Math.max(0, Number(occurrence) || 0);
  return top[idx] || top[0] || null;
}

/** Work Experience block field — used to assign experienceIndex while scraping. */
function isWorkExperienceLabel(label) {
  const n = String(label || '').toLowerCase().replace(/[*:]+$/g, '').trim();
  if (/desired|preferred|target|sought/.test(n)) return false;
  return /^(job title|company|employer|role description|job description|from|to|i currently work here|currently work here)$/.test(n)
    || n === 'location';
}

/** Shared option match — exact / whole-token only. No substring-of-compound matches
 *  (e.g. "Asian (Not Hispanic or Latino)" must NOT hit "Hispanic or Latino"). */
function optionMatch(answer, optionText) {
  const a = norm(answer);
  const o = norm(optionText);
  if (!a || !o) return false;
  if (a === o) return true;
  const answerTokens = labelTokens(answer);
  const optionTokens = labelTokens(optionText);
  if (!answerTokens.length || !optionTokens.length) return false;
  if (answerTokens.length === 1 && optionTokens.includes(answerTokens[0])) return true;
  if (optionTokens.length === 1 && answerTokens.includes(optionTokens[0])) return true;
  const meaningful = (t) => t.length > 2 && !['the', 'and', 'or', 'for', 'not', 'nor'].includes(t);
  const at = answerTokens.filter(meaningful);
  const ot = optionTokens.filter(meaningful);
  if (!at.length || !ot.length) return false;
  // Same meaningful token set
  if (at.length === ot.length && at.every((t) => ot.includes(t))) return true;
  // Answer tokens all present in option (answer is more specific subset wording)
  if (at.length >= 2 && at.every((t) => ot.includes(t))) return true;
  return false;
}

function optionMatchScore(answer, optionText) {
  if (!optionMatch(answer, optionText)) return 0;
  const a = norm(answer);
  const o = norm(optionText);
  if (a === o) return 1000;
  const at = labelTokens(answer);
  const ot = labelTokens(optionText);
  if (at.length === ot.length) return 800;
  return 100 + Math.min(at.length, ot.length) * 10 - Math.abs(at.length - ot.length);
}

function pickSelectOption(select, answer) {
  let best = null;
  let bestScore = 0;
  for (const opt of select.options || []) {
    const text = (opt.text || opt.label || '').trim();
    const score = Math.max(optionMatchScore(answer, text), optionMatchScore(answer, opt.value));
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  return best;
}

function pickBestChoice(inputs, answer, textOf) {
  let best = null;
  let bestScore = 0;
  for (const input of inputs) {
    const text = textOf(input);
    const score = Math.max(optionMatchScore(answer, text), optionMatchScore(answer, input.value));
    if (score > bestScore) {
      bestScore = score;
      best = input;
    }
  }
  return best;
}

function optionTexts(select) {
  return Array.from(select.options || [])
    .map((o) => (o.text || o.label || '').trim())
    .filter((t) => t && !/^(select|choose|please select|--)/i.test(t));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDummyRequired(el) {
  return el.getAttribute('aria-hidden') === 'true' && el.tabIndex === -1;
}

function isReactSelectInput(el) {
  return el.getAttribute('role') === 'combobox' || !!el.closest('.select__control');
}

function normalizeInjectAnswer(label, answer) {
  let a = String(answer || '').trim();
  if (!a) return a;
  if (/company|employer/i.test(label)) a = a.split(',')[0].trim();
  if (/^phone$|phone\b|mobile|cell/i.test(label) && !/country/i.test(label)) {
    const digits = a.replace(/\D/g, '');
    if (digits.length < 10) return a;
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    return digits.slice(-10);
  }
  return a;
}

function collectOptions(doc, el) {
  if (!el) return null;
  if (el.tagName === 'SELECT') {
    const texts = optionTexts(el);
    return texts.length ? texts : null;
  }
  const root = el.closest('div, li, fieldset, tr, label, [class*="field"], [class*="question"]') || el.parentElement;
  if (!root) return null;
  const select = root.querySelector('select');
  if (select) {
    const texts = optionTexts(select);
    if (texts.length) return texts;
  }
  const radios = root.querySelectorAll('input[type="radio"]');
  if (radios.length >= 2) {
    const texts = Array.from(radios).map((r) => fieldLabel(doc, r) || r.value).filter(Boolean);
    if (texts.length) return texts;
  }
  const boxes = root.querySelectorAll('input[type="checkbox"]');
  if (boxes.length >= 2) {
    const texts = Array.from(boxes).map((r) => fieldLabel(doc, r) || r.value).filter(Boolean);
    if (texts.length) return texts;
  }
  // Do NOT read floating [role=option] here — open React-Select menus leak options
  // into unrelated fields. Combobox options come from scrapeReactSelectOptions only.
  return null;
}

function fieldLabel(doc, el) {
  if (!el) return '';
  if (el.id) {
    const labelEl = doc.querySelector(`label[for="${el.id}"]`);
    if (labelEl) return (labelEl.textContent || labelEl.innerText || '').trim();
  }
  const closest = el.closest('label');
  if (closest) {
    const clone = closest.cloneNode(true);
    clone.querySelectorAll('input, textarea, select').forEach((c) => c.remove());
    return (clone.textContent || clone.innerText || '').trim();
  }
  return el.placeholder || el.getAttribute('aria-label') || el.name || el.id || '';
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

  async scrape(portalName = null) {
    const win = typeof window !== 'undefined' ? window : null;
    const sx = win?.scrollX ?? 0;
    const sy = win?.scrollY ?? 0;
    const prevFocus = typeof document !== 'undefined' ? document.activeElement : null;
    try {
      const { doc } = page();
      const name = portalName || this.detect();
      if (!name || !this.portals[name]) {
        console.log('[PortalEngine] No portal detected, using generic scraper');
        return await this.genericScrape();
      }
      const handler = this.portals[name];
      if (handler.scrape) {
        try {
          const fields = await handler.scrape(doc);
          console.log(`[PortalEngine] ${name} scraped ${fields.length} fields`);
          if (fields.length === 0) {
            console.log(`[PortalEngine] ${name} returned 0, falling back to generic`);
            return await this.genericScrape();
          }
          return fields;
        } catch (err) {
          console.error(`[PortalEngine] ${name} scrape error:`, err);
          return await this.genericScrape();
        }
      }
      return await this.genericScrape();
    } finally {
      // Scan must not move the page — restore scroll/focus after any open menus.
      try {
        if (prevFocus && typeof prevFocus.blur === 'function') prevFocus.blur();
        win?.scrollTo?.(sx, sy);
      } catch { /* ignore */ }
    }
  },

  /**
   * Open one React-Select (by label) and return its option texts for HITL.
   * Only used for Remaining fields — not during bulk scrape.
   */
  async scrapeOptionsForLabel(label) {
    const { doc } = page();
    if (!label || !isGreenhouseJobBoard(doc)) return null;
    // Phone number itself has no React-Select options — opening anything here
    // re-opens the Country dial next to the tel input.
    if (/^phone$|phone\b|mobile|cell|telephone/i.test(label)
      && !/country|dial|device|extension|type/i.test(label)) {
      return null;
    }
    const inputs = [...doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select',
    )];
    let best = null;
    let bestScore = 0;
    const want = norm(label);
    for (const el of inputs) {
      if (el.closest('.iti') && el.type !== 'tel') continue;
      if (!isReactSelectInput(el) && el.tagName !== 'SELECT') continue;
      const l = fieldLabel(doc, el) || el.getAttribute('aria-label') || '';
      let score = labelMatchScore(l, label);
      const nl = norm(l);
      // Long EEO questions: match on distinctive phrase overlap.
      if (score <= 0 && want.length > 12 && nl.length > 12) {
        if (nl.includes(want) || want.includes(nl)) score = 5000;
        else if (/orientation/.test(want) && /orientation/.test(nl)) score = 4000;
        else if (/gender/.test(want) && /gender/.test(nl)) score = 4000;
        else if (/ethnic/.test(want) && /ethnic|race/.test(nl)) score = 4000;
      }
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best || bestScore <= 0) return null;
    if (best.tagName === 'SELECT') return optionTexts(best);
    return scrapeReactSelectOptions(doc, best);
  },

  /**
   * Scroll/focus the control matching `label` before inject (HITL pacing + e2e).
   */
  async focusLabel(label) {
    const { doc } = page();
    if (!label) return false;
    const nodes = [
      ...doc.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]), textarea, select',
      ),
    ];
    let best = null;
    let bestScore = 0;
    for (const el of nodes) {
      const l = fieldLabel(doc, el) || el.getAttribute('aria-label') || el.placeholder || el.name || '';
      const score = labelMatchScore(l, label);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (!best || bestScore <= 0) return false;
    focusFilledField(best, label);
    await sleep(60);
    return true;
  },

  async inject(answers, portalName = null) {
    const { doc } = page();
    const name = portalName || this.detect();
    let filled = 0;
    let skipGeneric = false;
    let failed = [];
    let okLabels = [];
    if (name && this.portals[name] && this.portals[name].inject) {
      try {
        const result = await this.portals[name].inject(doc, answers);
        if (result && typeof result === 'object') {
          filled = result.filled || 0;
          skipGeneric = !!result.skipGeneric;
          failed = Array.isArray(result.failed) ? [...result.failed] : [];
          okLabels = Array.isArray(result.okLabels) ? [...result.okLabels] : [];
          // Portals that only return a count: treat uncounted answers as failed so UI can ask.
          if (!result.okLabels && !result.failed && Array.isArray(answers) && answers.length) {
            const answered = answers.filter((a) => a.label && a.answer);
            if (filled < answered.length) {
              failed = answered.slice(filled).map((a) => ({
                label: a.label,
                answer: String(a.answer),
              }));
            } else {
              okLabels = answered.map((a) => a.label);
            }
          }
        } else {
          filled = result || 0;
        }
        console.log(`[PortalEngine] ${name} filled ${filled} fields${skipGeneric ? ' (skip generic)' : ''}${failed.length ? `, ${failed.length} failed` : ''}`);
      } catch (err) {
        console.error(`[PortalEngine] ${name} inject error:`, err);
      }
    }
    if (!skipGeneric) {
      const genericFilled = await this.genericInject(answers);
      console.log(`[PortalEngine] generic pass filled ${genericFilled} additional fields`);
      filled += genericFilled;
    }
    return { filled, okLabels, failed };
  },

  async genericScrape() {
    const { doc } = page();
    const fields = [];
    const seen = new Set();
    const inputs = doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="image"]):not([type="search"]), textarea, select'
    );
    const radioGroups = new Map();
    const list = [...inputs];
    for (const el of list) {
      if (el.closest('.iti') && el.type !== 'tel' && !el.classList.contains('iti__tel-input')) continue;
      const hidden = el.style && el.style.display === 'none';
      if (hidden && el.tagName !== 'SELECT') continue;
      if ((el.type || '').toLowerCase() === 'radio') {
        const group = el.name || `radio-${el.id || fields.length}`;
        if (!radioGroups.has(group)) radioGroups.set(group, []);
        radioGroups.get(group).push(el);
        continue;
      }
      let label = fieldLabel(doc, el);
      const key = `${label}::${el.type || el.tagName}`;
      if (seen.has(key) || !label) continue;
      seen.add(key);
      const type = el.tagName === 'SELECT' ? 'select' : (isReactSelectInput(el) ? 'select' : (el.type || 'text'));
      // Native <select>/radio/checkbox options only. Never open React-Select menus
      // during bulk scrape — that leaked Country dial codes into EEO fields.
      const options = collectOptions(doc, el);
      fields.push({
        id: el.id || null,
        name: el.name || null,
        type,
        label: label.replace(/\s+/g, ' ').slice(0, 120),
        placeholder: el.placeholder || null,
        required: el.required || el.getAttribute('aria-required') === 'true',
        currentValue: el.value || null,
        options: options && options.length ? options : null,
      });
    }
    radioGroups.forEach((els) => {
      const first = els[0];
      let label = '';
      const legend = first.closest('fieldset')?.querySelector('legend');
      if (legend) label = (legend.textContent || '').trim();
      if (!label) {
        const heading = first.closest('div, li, section')?.querySelector('label, p, span, h3, h4');
        if (heading) label = (heading.textContent || '').trim();
      }
      if (!label) label = fieldLabel(doc, first);
      const options = els.map((el) => fieldLabel(doc, el) || el.value).filter(Boolean);
      fields.push({
        id: first.id || null,
        name: first.name || null,
        type: 'radio',
        label: label.replace(/\s+/g, ' ').slice(0, 120),
        placeholder: null,
        required: els.some((el) => el.required),
        currentValue: (els.find((el) => el.checked) || {}).value || null,
        options: options.length ? options : null,
      });
    });
    return fields;
  },

  /**
   * Portal-agnostic inject: native text/tel/checkbox/radio and real <select>.
   * Skips React-Select comboboxes (handled by greenhouseJobBoard).
   */
  async genericInject(answers) {
    const { doc } = page();
    let filled = 0;
    for (const item of answers) {
      const label = item.label;
      const answer = normalizeInjectAnswer(label, item.answer);
      if (!answer) continue;
      const inputs = doc.querySelectorAll(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="search"]), textarea, select',
      );
      for (const input of inputs) {
        if (isSubmitControl(input) || isDummyRequired(input)) continue;
        // Leave React-Select / intl-tel search to Greenhouse Job Board handler.
        if (isReactSelectInput(input)) continue;
        if (input.id?.startsWith('iti-') || input.classList?.contains('iti__search-input')) continue;

        let inputLabel = fieldLabel(doc, input) || input.getAttribute('aria-label') || input.placeholder || input.name || '';
        const consentish = input.type === 'checkbox'
          && /consent|privacy|gdpr|terms|policy/i.test(inputLabel)
          && /consent|privacy|agree|policy/i.test(label);
        if (!inputLabel || (!labelsMatch(inputLabel, label) && !consentish)) continue;
        if (/resume|cv|cover letter/i.test(inputLabel)) continue;

        await sleep(80);

        if (input.type === 'checkbox') {
          const yes = /^(yes|true|agree|i agree|on|1)$/i.test(String(answer).trim());
          if (yes !== input.checked) input.click();
          if (yes && !input.checked) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          focusFilledField(input, label);
          filled++;
          break;
        }
        if (input.type === 'radio') {
          const choice = fieldLabel(doc, input) || input.value;
          if (optionMatch(answer, choice)) {
            input.checked = true;
            input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            focusFilledField(input, label);
            filled++;
          }
          continue;
        }
        if (input.tagName === 'SELECT') {
          const hit = pickSelectOption(input, answer);
          if (hit) {
            input.value = hit.value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            focusFilledField(input, label);
            filled++;
          }
        } else {
          setNativeValue(input, answer, label);
          filled++;
        }
        break;
      }
    }
    return filled;
  }
};

/** Street lines are typed. A search button inside the same Workday field is not the answer list. */
function isWorkdayStreetLine(label) {
  return /address\s*line\s*[12]|street address|\baddress\s*[12]\b/i.test(String(label || ''));
}

function workdayTextControl(field) {
  return field.querySelector('textarea')
    || field.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])');
}

// ── Portal: Workday ───────────────────────────────────────────────────────────

PortalEngine.register('workday', {
  detect(url, hostname) {
    return hostname.includes('myworkdayjobs.com') || hostname.includes('workday.com');
  },

  scrape(doc) {
    const fields = [];
    // Do NOT dedupe by label or automation-id — Work Experience 2+ and
    // "Add" rows reuse "Job Title" / formField-jobTitle. Only collapse
    // nested duplicates (radioGroup inside a formField wrapper).
    const rawFields = [...doc.querySelectorAll(
      '[data-automation-id^="formField-"], [data-automation-id="radioGroup"]',
    )];
    const allFields = rawFields.filter((el) => !rawFields.some((other) => other !== el && other.contains(el)));
    console.log(`[PortalEngine] Workday: found ${allFields.length} fields`);

    let experienceIndex = -1;
    let inWorkExpBlock = false;

    const pushField = (base) => {
      const label = base.label;
      const n = String(label || '').toLowerCase().replace(/[*:]+$/g, '').trim();
      let expIdx = null;

      if (/^job title$/.test(n) && !/desired|preferred|target|sought/.test(String(label || '').toLowerCase())) {
        experienceIndex += 1;
        inWorkExpBlock = true;
        expIdx = experienceIndex;
      } else if (inWorkExpBlock && isWorkExperienceLabel(label)) {
        expIdx = experienceIndex;
      } else if (inWorkExpBlock) {
        // Hit a non–work-experience field → close the block.
        inWorkExpBlock = false;
      }

      fields.push({
        ...base,
        experienceIndex: expIdx,
        section: expIdx != null ? 'work_experience' : null,
      });
    };

    allFields.forEach((field) => {
      const labelEl = field.querySelector('[data-automation-id="formLabel"], label, .css-1ud5i8o');
      const label = labelEl ? cleanLabel(labelEl) : null;
      if (!label) return;

      const radios = field.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        pushField({
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

      const checkbox = field.querySelector('input[type="checkbox"]');
      if (checkbox) {
        pushField({
          label, type: 'checkbox', name: checkbox.name || null, id: checkbox.id || null,
          required: checkbox.required || checkbox.getAttribute('aria-required') === 'true',
          options: null, placeholder: null,
          currentValue: checkbox.checked ? 'Yes' : '',
        });
        return;
      }

      // Address Line 1/2 stay text even when Workday nests an address-search listbox.
      if (isWorkdayStreetLine(label) && workdayTextControl(field)) {
        const input = workdayTextControl(field);
        pushField({
          label,
          type: input.tagName === 'TEXTAREA' ? 'textarea' : (input.type || 'text'),
          name: input.name || null,
          id: input.id || null,
          required: input.required || input.getAttribute('aria-required') === 'true',
          options: null,
          placeholder: input.placeholder || null,
          currentValue: input.value || null,
        });
        return;
      }

      const selectWidget = field.querySelector('[data-automation-id="selectWidget"]');
      if (selectWidget) {
        const rawSelectText = (selectWidget.innerText || '').trim().replace(/\s+/g, ' ');
        const emptySelect = !rawSelectText
          || /^(please\s+)?(select|choose)\b/i.test(rawSelectText);
        pushField({
          label, type: 'select', name: null, id: selectWidget.id || null,
          required: selectWidget.getAttribute('aria-required') === 'true',
          options: Array.from(doc.querySelectorAll('[data-automation-id="promptOption"]')).map(o => o.innerText.trim()).filter(Boolean),
          placeholder: emptySelect ? rawSelectText || 'Select One' : null,
          currentValue: emptySelect ? null : rawSelectText,
        });
        return;
      }

      // Country / State / Device Type listbox buttons.
      // Live WD mounts options in document-level responsiveMonikerPrompt — not inside formField.
      const listBtn = field.querySelector('button[aria-haspopup="listbox"]');
      if (listBtn) {
        const shown = (listBtn.innerText || listBtn.textContent || listBtn.getAttribute('aria-label') || '')
          .trim().replace(/\s+/g, ' ');
        const empty = !shown || /^(please\s+)?(select|choose)\b/i.test(shown);
        const openPrompt = doc.querySelector('[data-automation-id="responsiveMonikerPrompt"]:not([hidden])');
        const optNodes = openPrompt
          ? openPrompt.querySelectorAll('[data-automation-id="promptOption"], [role="option"], [data-automation-id="promptLeafNode"]')
          : [];
        pushField({
          label, type: 'select', name: null, id: listBtn.id || null,
          required: listBtn.getAttribute('aria-required') === 'true'
            || !!field.querySelector('.required, [aria-required="true"]'),
          options: Array.from(optNodes).map((o) => (o.innerText || o.textContent || '').trim()).filter(Boolean),
          placeholder: empty ? shown || 'Select One' : null,
          currentValue: empty ? null : shown,
        });
        return;
      }

      const select = field.querySelector('select');
      if (select) {
        pushField({
          label, type: 'select', name: select.name || null, id: select.id || null,
          required: select.required,
          options: Array.from(select.options).map(o => o.text.trim()).filter(t => t && !/^(select|choose)/i.test(t)),
          placeholder: null, currentValue: select.value || null,
        });
        return;
      }

      const textarea = field.querySelector('textarea');
      if (textarea) {
        pushField({
          label, type: 'textarea', name: textarea.name || null, id: textarea.id || null,
          required: textarea.required || textarea.getAttribute('aria-required') === 'true',
          options: null, placeholder: textarea.placeholder || null, currentValue: textarea.value || null,
        });
        return;
      }

      const input = field.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])');
      if (input) {
        pushField({
          label, type: input.type || 'text', name: input.name || null, id: input.id || null,
          required: input.required || input.getAttribute('aria-required') === 'true',
          options: null, placeholder: input.placeholder || null, currentValue: input.value || null,
        });
      }
    });
    return fields;
  },

  async inject(doc, answers) {
    let filled = 0;
    const formFields = [...doc.querySelectorAll('[data-automation-id^="formField-"], [data-automation-id="radioGroup"]')];
    const getLabel = (field) => {
      const labelEl = field.querySelector('[data-automation-id="formLabel"], label, .css-1ud5i8o');
      return labelEl ? cleanLabel(labelEl) : null;
    };

    const clickPromptOption = async (answer) => {
      await sleep(400);
      // Prefer the open prompt panel so we don't click phone-code options.
      const scope = doc.querySelector('[data-automation-id="responsiveMonikerPrompt"]') || doc;
      const opts = [...scope.querySelectorAll(
        '[data-automation-id="promptLeafNode"], [data-automation-id="promptOption"], [role="option"]',
      )];
      let best = null;
      let bestScore = 0;
      for (const opt of opts) {
        const text = (opt.innerText || opt.textContent || '').trim();
        if (!text || text.length > 120) continue;
        let score = optionMatchScore(answer, text);
        // Common ATS mapping: LinkedIn / Indeed → Social Media / Job Board parent nodes.
        if (!score && /linkedin|indeed|glassdoor|twitter|facebook/i.test(answer) && /social media/i.test(text)) {
          score = 50;
        }
        if (!score && /linkedin|indeed|glassdoor/i.test(answer) && /job board/i.test(text)) {
          score = 40;
        }
        if (score > bestScore) {
          bestScore = score;
          best = opt;
        }
      }
      if (best) {
        best.scrollIntoView?.({ block: 'nearest' });
        best.click();
        await sleep(300);
        // Some sources are hierarchical — pick a leaf if another panel opened.
        const nested = [...(doc.querySelector('[data-automation-id="responsiveMonikerPrompt"]') || doc)
          .querySelectorAll('[data-automation-id="promptLeafNode"], [data-automation-id="promptOption"]')];
        const nestedHit = nested.find((o) => {
          const t = (o.innerText || o.textContent || '').trim();
          return optionMatch(answer, t) || (/linkedin/i.test(answer) && /linkedin/i.test(t));
        });
        if (nestedHit && nestedHit !== best) {
          nestedHit.click();
          await sleep(200);
        }
        return true;
      }
      return false;
    };

    const rankAnswer = ({ label }) => {
      const l = String(label || '').toLowerCase();
      if (/how did you hear|source|phone code/i.test(l)) return 2; // multiselects last
      if (/country|state|region|device type/i.test(l)) return 1; // listboxes mid
      return 0; // text/radio first
    };
    const ordered = [...answers].filter((a) => a.answer).sort((a, b) => rankAnswer(a) - rankAnswer(b));

    for (const item of ordered) {
      const { label, answer } = item;
      const occurrence = Number.isInteger(item.experienceIndex) ? item.experienceIndex : 0;
      const field = pickBestField(formFields, label, getLabel, occurrence);
      if (!field) continue;

      const checkbox = field.querySelector('input[type="checkbox"]');
      if (checkbox) {
        const wantOn = /^(yes|true|1|on|checked)$/i.test(String(answer).trim());
        if (checkbox.checked !== wantOn) {
          checkbox.click();
          checkbox.checked = wantOn;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        filled++;
        continue;
      }

      const radios = field.querySelectorAll('input[type="radio"]');
      if (radios.length > 0) {
        for (const r of radios) {
          const rLabel = doc.querySelector(`label[for="${r.id}"]`);
          const rText = rLabel ? cleanLabel(rLabel) : r.value;
          if (optionMatch(answer, rText) || norm(r.value) === norm(answer)) {
            r.click();
            r.checked = true;
            r.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
            break;
          }
        }
        continue;
      }

      if (isWorkdayStreetLine(label)) {
        const street = workdayTextControl(field);
        if (street) {
          setNativeValue(street, answer, label);
          filled++;
          continue;
        }
      }

      // Workday listbox (Country, State, Phone Device Type) — never type into the companion <input>.
      const listBtn = field.querySelector('button[aria-haspopup="listbox"]');
      if (listBtn) {
        const shown = `${listBtn.innerText || ''} ${listBtn.getAttribute('aria-label') || ''}`;
        if (optionMatch(answer, shown) || (answer.length > 4 && norm(shown).includes(norm(answer)))) {
          filled++;
          continue;
        }
        listBtn.click();
        await sleep(300);
        // Prefer the open prompt panel (live WD); fall back to any promptOption in the doc.
        const optionText = (o) => (o.innerText || o.textContent || '').trim();
        const scope = doc.querySelector('[data-automation-id="responsiveMonikerPrompt"]:not([hidden])')
          || doc.querySelector('[data-automation-id="responsiveMonikerPrompt"]')
          || doc;
        const opts = [...scope.querySelectorAll(
          '[data-automation-id="promptOption"], [data-automation-id="promptLeafNode"], [role="option"]',
        )];
        const hit = opts.find((o) => {
          const t = optionText(o);
          return optionMatch(answer, t) || (answer.length > 3 && norm(t).includes(norm(answer)));
        });
        if (hit) {
          hit.click();
          await sleep(200);
          // Only count filled if the trigger reflects the choice (React/fixture must commit).
          const after = (listBtn.innerText || listBtn.textContent || '').trim();
          if (optionMatch(answer, after) || (answer.length > 3 && norm(after).includes(norm(answer)))) {
            filled++;
          }
        }
        continue;
      }

      // How did you hear / Country Phone Code multiselect prompts.
      const multi = field.querySelector('[data-automation-id="multiSelectContainer"]');
      if (multi) {
        const selected = [...multi.querySelectorAll('[data-automation-id="selectedItem"]')]
          .map((el) => (el.innerText || '').trim())
          .filter(Boolean);
        if (selected.some((t) => optionMatch(answer, t) || norm(t).includes(norm(answer)))) {
          filled++;
          continue;
        }
        const input = field.querySelector('input[type="text"]');
        if (input) {
          multi.click();
          await sleep(200);
          input.click();
          input.focus();
          await sleep(200);
          let ok = await clickPromptOption(answer);
          if (!ok) {
            setNativeValue(input, '');
            let typed = '';
            for (const ch of String(answer)) {
              typed += ch;
              setNativeValue(input, typed);
              if (typeof InputEvent === 'function') {
                input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }));
              }
              await sleep(40);
            }
            await sleep(500);
            ok = await clickPromptOption(answer);
          }
          if (ok) filled++;
        }
        continue;
      }

      const selectWidget = field.querySelector('[data-automation-id="selectWidget"]');
      if (selectWidget) {
        selectWidget.click();
        if (await clickPromptOption(answer)) filled++;
        continue;
      }

      const select = field.querySelector('select');
      if (select) {
        const hit = pickSelectOption(select, answer);
        if (hit) {
          select.value = hit.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
        }
        continue;
      }

      const el = field.querySelector('textarea')
        || field.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"])');
      if (el) {
        setNativeValue(el, answer);
        filled++;
      }
    }
    // Generic pass would type into listbox companion inputs and can wipe the form.
    return { filled, skipGeneric: true };
  }
});

// ── Portal: Lever ─────────────────────────────────────────────────────────────

/** Lever checkbox UIs: EEO uses data-qa=checkboxes; pronouns use candidatePronounsCheckboxes. */
function leverCheckboxList(fieldDiv) {
  if (!fieldDiv) return null;
  const explicit = fieldDiv.querySelector(
    'ul[data-qa="checkboxes"], ul[data-qa="candidatePronounsCheckboxes"], ul#candidatePronounsCheckboxes',
  );
  if (explicit) return explicit;
  // Fallback: any list with 2+ checkboxes (covers Lever markup drift).
  return [...fieldDiv.querySelectorAll('ul')].find(
    (ul) => ul.querySelectorAll('input[type="checkbox"]').length >= 2,
  ) || null;
}

PortalEngine.register('lever', {
  detect(url, hostname) {
    return hostname.includes('lever.co') || hostname.includes('jobs.lever.co');
  },

  scrape(doc) {
    const fields = [];
    const seen = new Set();
    const leverQuestionLabel = (question) => {
      const text = question.querySelector('.application-label .text');
      if (text) return cleanLabel(text);
      const appLabel = question.querySelector('.application-label');
      if (!appLabel) return null;
      // EEO block often has bare text nodes (no .text wrapper).
      const direct = [...appLabel.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent || '')
        .join(' ')
        .trim();
      return String(direct || appLabel.textContent || '')
        .replace(/\s+/g, ' ')
        .replace(/[*:✱＊]+$/g, '')
        .trim();
    };

    doc.querySelectorAll('.application-question').forEach(question => {
      const label = leverQuestionLabel(question);
      if (!label || seen.has(norm(label))) return;
      const fieldDiv = question.querySelector('.application-field');
      if (!fieldDiv) return;

      const radioGroup = fieldDiv.querySelector('ul[data-qa="multiple-choice"]');
      if (radioGroup) {
        const radios = Array.from(radioGroup.querySelectorAll('input[type="radio"]'));
        seen.add(norm(label));
        fields.push({ label, type: 'radio', name: radios[0]?.name || null, id: null,
          required: !!radios.find(r => r.required),
          // Prefer visible label text — Lever value attrs can disagree with the span text.
          options: radios.map((r) => {
            const span = r.parentElement?.querySelector('.application-answer-alternative');
            return (span?.textContent || r.value || '').trim();
          }).filter(Boolean),
          placeholder: null, currentValue: null });
        return;
      }

      const checkGroup = leverCheckboxList(fieldDiv);
      if (checkGroup) {
        const boxes = Array.from(checkGroup.querySelectorAll('input[type="checkbox"]'));
        seen.add(norm(label));
        fields.push({
          label, type: 'checkbox', name: boxes[0]?.name || null, id: null,
          required: false,
          options: boxes.map((b) => {
            const span = b.parentElement?.querySelector('.application-answer-alternative');
            return (span?.textContent || b.value || '').trim();
          }).filter(Boolean),
          placeholder: null, currentValue: null,
        });
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
    const questions = [...doc.querySelectorAll('.application-question')];
    const getLabel = (question) => {
      const text = question.querySelector('.application-label .text');
      if (text) return cleanLabel(text);
      const appLabel = question.querySelector('.application-label');
      if (!appLabel) return null;
      const direct = [...appLabel.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent || '')
        .join(' ')
        .trim();
      return (direct || cleanLabel(appLabel) || '').replace(/[*:✱＊]+$/g, '').trim();
    };
    const visibleChoiceText = (input) => {
      const span = input.parentElement?.querySelector('.application-answer-alternative');
      return (span?.textContent || input.value || '').trim();
    };

    for (const { label, answer } of answers) {
      if (!answer) continue;
      const question = pickBestField(questions, label, getLabel);
      if (!question) continue;
      const fieldDiv = question.querySelector('.application-field');
      if (!fieldDiv) continue;

      const checkList = leverCheckboxList(fieldDiv);
      const checkboxes = checkList
        ? [...checkList.querySelectorAll('input[type="checkbox"]')]
        : [];
      if (checkboxes.length > 0) {
        // Match visible text only — Lever's value= can be wrong (e.g. value=Asian on White).
        // Pronouns: support "She/her" or free-text that matches an option / Custom.
        const box = pickBestChoice(checkboxes, answer, visibleChoiceText);
        if (box) {
          if (!box.checked) {
            box.click();
            box.checked = true;
            box.dispatchEvent(new Event('change', { bubbles: true }));
          }
          // Custom pronouns: Lever reveals #customPronounsTextField after Custom is checked.
          if (/^custom$/i.test(box.value || '') || box.id === 'customPronounsOption') {
            const customInput = fieldDiv.querySelector('#customPronounsTextField, input.card-field-input[name="pronouns"]');
            if (customInput && answer && !/^custom$/i.test(String(answer).trim())) {
              customInput.style.display = '';
              setNativeValue(customInput, answer, label);
            }
          }
          focusFilledField(box, label);
          filled++;
        }
        continue;
      }

      const radios = [...fieldDiv.querySelectorAll('input[type="radio"]')];
      if (radios.length > 0) {
        const r = pickBestChoice(radios, answer, (el) => visibleChoiceText(el) || el.value);
        if (r) {
          r.checked = true;
          r.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          r.dispatchEvent(new Event('change', { bubbles: true }));
          focusFilledField(r, label);
          filled++;
        }
        continue;
      }

      const select = fieldDiv.querySelector('select');
      if (select) {
        const hit = pickSelectOption(select, answer);
        if (hit) {
          select.value = hit.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          focusFilledField(select, label);
          filled++;
        }
        continue;
      }

      const el = fieldDiv.querySelector('textarea')
        || fieldDiv.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])');
      if (el) {
        let value = answer;
        if (/^phone$|phone\b|mobile|cell/i.test(label)) {
          const digits = String(answer).replace(/\D/g, '');
          const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(-10);
          if (national.length >= 10) value = national;
        }
        setNativeValue(el, value, label);
        filled++;
      }
    }
    // Avoid generic pass rematching Lever checkboxes by broken value= attrs.
    return { filled, skipGeneric: true };
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

  async inject(doc, answers) {
    if (isGreenhouseJobBoard(doc)) {
      console.log('[PortalEngine] Greenhouse Job Board — using portals/greenhouseJobBoard.js');
      const result = await injectGreenhouseJobBoard(doc, answers);
      // injectGreenhouseJobBoard returns { filled, okLabels, failed } — do not nest it as filled.
      if (result && typeof result === 'object') {
        return {
          filled: typeof result.filled === 'number' ? result.filled : 0,
          okLabels: Array.isArray(result.okLabels) ? result.okLabels : [],
          failed: Array.isArray(result.failed) ? result.failed : [],
          skipGeneric: true,
        };
      }
      return { filled: result || 0, okLabels: [], failed: [], skipGeneric: true };
    }
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
          let matched = null;
          for (const r of radios) {
            const rLabel = r.closest('label') ? cleanLabel(r.closest('label')) : r.value;
            if (optionMatch(answer, rLabel) || optionMatch(answer, r.value)) { matched = r; break; }
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
          const hit = pickSelectOption(select, answer);
          if (hit) {
            select.value = hit.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            filled++;
          }
          break;
        }

        const el = field.querySelector('textarea') || field.querySelector('input:not([type="hidden"]):not([type="file"])');
        if (el && !isReactSelectInput(el)) { setNativeValue(el, answer); filled++; }
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

  async inject(doc, answers) {
    let filled = 0;
    const fieldEls = [...doc.querySelectorAll('[data-field-path]')];
    const getLabel = (fieldEl) => {
      const labelEl = fieldEl.querySelector('.ashby-application-form-question-title, label, [class*="title"]');
      return labelEl ? cleanLabel(labelEl) : null;
    };

    const fillAutocomplete = async (input, answer) => {
      const query = String(answer).split(',')[0].trim();
      input.scrollIntoView?.({ block: 'center' });
      input.click();
      input.focus();
      setNativeValue(input, '');
      setNativeValue(input, query);
      if (typeof InputEvent === 'function') {
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: query, inputType: 'insertText' }));
      }
      await sleep(700);
      const opts = [...doc.querySelectorAll('[role="option"], [role="listbox"] li, [class*="option"]')]
        .filter((el) => (el.textContent || '').trim().length > 1);
      const hit = opts.find((o) => optionMatch(answer, (o.textContent || '').trim()))
        || opts.find((o) => optionMatch(query, (o.textContent || '').trim()))
        || opts.find((o) => norm(o.textContent).includes(norm(query)));
      // Never click opts[0] — that invents a location/employer the candidate did not choose.
      if (hit) {
        hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        hit.click();
        await sleep(250);
        return true;
      }
      // Leave typed query; do not ArrowDown+Enter (accepts first unrelated suggestion).
      return false;
    };

    for (const { label, answer } of answers) {
      if (!answer) continue;
      const fieldEl = pickBestField(fieldEls, label, getLabel);
      if (!fieldEl) continue;

      const yesNo = Array.from(fieldEl.querySelectorAll('[data-value]'));
      if (yesNo.length) {
        const btn = yesNo.find((b) => optionMatch(answer, b.dataset.value || b.innerText));
        if (btn) { btn.click(); filled++; }
        continue;
      }

      const select = fieldEl.querySelector('select');
      if (select) {
        const hit = pickSelectOption(select, answer);
        if (hit) {
          select.value = hit.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          filled++;
        }
        continue;
      }

      const checkbox = fieldEl.querySelector('input[type="checkbox"]');
      if (checkbox && !fieldEl.querySelector('input[role="combobox"], .ashby-application-form-input-autocomplete')) {
        const want = /^(yes|true|1|on|checked)$/i.test(String(answer).trim());
        const wantNo = /^(no|false|0|off|uncheck)/i.test(String(answer).trim());
        if (wantNo && checkbox.checked) {
          checkbox.click();
          filled++;
        } else if (want && !checkbox.checked) {
          checkbox.click();
          filled++;
        } else if (wantNo || want) {
          filled++;
        }
        continue;
      }

      const combo = fieldEl.querySelector(
        'input[role="combobox"], input.ashby-application-form-input-autocomplete, input[aria-autocomplete="list"]',
      );
      if (combo) {
        if (await fillAutocomplete(combo, answer)) filled++;
        continue;
      }

      const el = fieldEl.querySelector('textarea')
        || fieldEl.querySelector('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"])');
      if (el) { setNativeValue(el, answer); filled++; }
    }
    return { filled, skipGeneric: true };
  }
});

export { PortalEngine, isSubmitControl };
