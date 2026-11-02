/**
 * Greenhouse Job Board (boards / job-boards.greenhouse.io) — React-Select + intl-tel.
 * Kept separate so Lever / Workday / Ashby / classic Greenhouse are not affected.
 *
 * Hard rules: do not bulk-scrape every option menu; do not .remove() React-owned
 * select menus from the DOM. See .cursor/skills/jobfitly-dev/autofill-pitfalls.md.
 */

function norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function labelTokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Exact > token-subset with penalty so "First Name" ≠ "Preferred First Name". */
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
    return Math.min(ta.length, tb.length) * 100 - Math.abs(ta.length - tb.length) * 80;
  }
  return 0;
}

function labelsMatch(a, b) {
  return labelMatchScore(a, b) > 0;
}

function fieldLabel(doc, el) {
  if (!el) return '';
  if (el.id) {
    const hit = [...doc.querySelectorAll('label[for]')].find((l) => l.getAttribute('for') === el.id);
    if (hit) return (hit.textContent || hit.innerText || '').trim();
  }
  const closest = el.closest('label');
  if (closest) {
    const clone = closest.cloneNode(true);
    clone.querySelectorAll('input, textarea, select').forEach((c) => c.remove());
    return (clone.textContent || '').trim();
  }
  return el.placeholder || el.getAttribute('aria-label') || el.name || el.id || '';
}

/** GH-specific scoring: dial codes, city autocomplete, no East/South Asian guessing. */
function optionScore(answer, optionText) {
  const a = norm(answer);
  const raw = String(optionText || '').trim();
  const o = norm(raw);
  if (!a || !o) return 0;
  if (a === o) return 100;
  const withoutDial = norm(raw.replace(/\+\d[\d\s-]*$/, '').trim());
  if (withoutDial && withoutDial === a) return 98;
  const firstSeg = raw.split(',')[0].trim();
  if (firstSeg && norm(firstSeg) === a) {
    return 90 + (/united states/i.test(raw) ? 5 : 0);
  }
  const tokens = raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(norm);
  if (tokens.length === 1 && tokens[0] === a) return 95;
  if (tokens.includes(a)) {
    return 60 - Math.min(40, Math.max(0, tokens.length - 1) * 10);
  }
  if (a.length <= 6) return 0;
  if (withoutDial.startsWith(a) || o.startsWith(a)) return 40;
  if (withoutDial.includes(a) || o.includes(a)) return 25;
  if (a.includes(withoutDial) && withoutDial.length >= 4) return 15;
  return 0;
}

function pickBestOption(opts, answer) {
  const ranked = [];
  for (const el of opts) {
    const text = (el.textContent || el.text || el.label || '').trim();
    const score = optionScore(answer, text);
    if (score > 0) ranked.push({ el, text, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.text.length - b.text.length);
  if (!ranked.length) return null;
  if (ranked.length >= 2 && ranked[0].score === ranked[1].score && ranked[0].score < 100) {
    const tied = ranked.filter((r) => r.score === ranked[0].score);
    if (tied.every((r) => r.text.includes(','))) return tied[0].el;
    return null;
  }
  return ranked[0].el;
}

function isPhoneCountryOption(el) {
  return !!(el.closest('.iti') || el.closest('.iti__country-list') || el.classList?.contains('iti__country'));
}

/** Greenhouse Country dial React-Select options look like "United States +1" or "+93". */
function looksLikeDialCodeText(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^\+\d{1,4}$/.test(t)) return true;
  if (/\+\d{1,4}\b/.test(t) && t.length <= 48) return true;
  return false;
}

function isDisplayed(el) {
  if (!el?.getClientRects?.()?.length) return false;
  const win = el.ownerDocument?.defaultView;
  if (!win?.getComputedStyle) return true;
  const style = win.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function optionNodesIn(menu) {
  if (!menu) return [];
  return [...menu.querySelectorAll('[role="option"], .select__option')]
    .filter((o) => !isPhoneCountryOption(o) && isDisplayed(o));
}

function menuTexts(menu) {
  return optionNodesIn(menu).map((o) => (o.textContent || '').trim()).filter(Boolean);
}

function dialCodeRatio(texts) {
  const list = (texts || []).filter(Boolean);
  if (!list.length) return 0;
  return list.filter(looksLikeDialCodeText).length / list.length;
}

/** Resolve the listbox for this combobox — GH React-Select portals menus to body. */
function menuForControl(doc, control, input) {
  const ariaId = input?.getAttribute?.('aria-controls')
    || control?.querySelector?.('[aria-controls]')?.getAttribute?.('aria-controls');
  if (ariaId) {
    const byId = doc.getElementById(ariaId);
    if (byId && isDisplayed(byId)) return byId;
  }
  const wrap = control?.closest?.('.select__container, .select, .field-wrapper, .phone-input__country, [class*="field"]')
    || control?.parentElement;
  if (wrap) {
    const local = [...wrap.querySelectorAll('.select__menu, [role="listbox"]')].find(isDisplayed);
    if (local) return local;
  }
  return null;
}

/**
 * Options for a specific control. Never fall back to a leftover Country dial menu.
 * When React-Select portals the menu, prefer aria-controls, else the newest menu
 * that appeared after open (caller can pass `preferMenus`).
 */
function visibleOptions(doc, control = null, input = null, { allowDial = false, preferMenus = null } = {}) {
  let menu = menuForControl(doc, control, input);
  if (!menu && preferMenus?.length) {
    // Newest portaled menu first.
    for (let i = preferMenus.length - 1; i >= 0; i--) {
      const m = preferMenus[i];
      if (!isDisplayed(m)) continue;
      const texts = menuTexts(m);
      if (!texts.length) continue;
      if (!allowDial && dialCodeRatio(texts) >= 0.5) continue;
      menu = m;
      break;
    }
  }
  if (!menu) return [];
  const nodes = optionNodesIn(menu);
  if (!allowDial) {
    return nodes.filter((o) => !looksLikeDialCodeText((o.textContent || '').trim()));
  }
  return nodes;
}

/**
 * Close React-Select / listboxes without detaching DOM nodes.
 * Calling .remove() on Greenhouse menus crashes their React tree
 * (removeChild NotFoundError → "Uh oh, something went wrong").
 */
function closeOpenMenus(doc) {
  if (!doc) return;
  const esc = () => new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
  });
  try {
    doc.activeElement?.dispatchEvent?.(esc());
  } catch { /* ignore */ }
  try {
    doc.body?.dispatchEvent?.(esc());
  } catch { /* ignore */ }
  // Blur comboboxes so menus collapse via React state — never detach nodes.
  try {
    const active = doc.activeElement;
    if (active && (active.getAttribute?.('role') === 'combobox' || active.closest?.('.select__control'))) {
      active.blur?.();
    }
  } catch { /* ignore */ }
}

function selectHasValue(input) {
  const root = input.closest('.select__container, .select, .field-wrapper, .phone-input__country') || input.parentElement;
  if (!root) return false;
  return !!root.querySelector(
    '.select__value-container--has-value .select__single-value, .select__value-container--has-value .select__multi-value, .select__multi-value__label',
  );
}

function selectCommitted(input, answer) {
  const root = input.closest('.select__container, .select, .field-wrapper, .phone-input__country') || input.parentElement;
  if (!root) return false;
  const chips = [...root.querySelectorAll('.select__single-value, .select__multi-value__label')]
    .map((el) => (el.textContent || '').trim())
    .filter(Boolean);
  if (chips.some((t) => optionScore(answer, t) >= 25 || norm(t).includes(norm(answer)) || norm(answer).includes(norm(t)))) {
    return true;
  }
  if (selectHasValue(input) && chips.some((t) => /^\+\d+$/.test(t.replace(/\s/g, '')))) return true;
  const hidden = root.querySelector('input[aria-hidden="true"][required], input[tabindex="-1"][aria-hidden="true"]');
  if (hidden?.value && optionScore(answer, hidden.value) > 0) return true;
  return false;
}

function openReactSelect(control, input, { preventScroll = false } = {}) {
  const rect = control.getBoundingClientRect?.() || { left: 8, top: 8, width: 40, height: 20 };
  const x = rect.left + Math.min(24, rect.width / 2);
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: control.ownerDocument?.defaultView };
  control.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
  control.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
  control.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
  control.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
  control.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
  try {
    input?.focus?.({ preventScroll: !!preventScroll });
  } catch {
    if (!preventScroll) input?.focus?.();
  }
}

async function clickOption(doc, hit) {
  hit.scrollIntoView?.({ block: 'nearest' });
  const rect = hit.getBoundingClientRect?.() || { left: 8, top: 8, width: 40, height: 20 };
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: doc.defaultView };
  hit.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1 }));
  hit.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));
  hit.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
  hit.dispatchEvent(new MouseEvent('mouseup', { ...base, buttons: 0 }));
  hit.dispatchEvent(new MouseEvent('click', { ...base, buttons: 0 }));
  if (typeof hit.click === 'function') hit.click();
}

function labelAllowsDial(label) {
  return /country|phone|dial|calling/i.test(String(label || ''));
}

function displayedMenus(doc) {
  return [...doc.querySelectorAll('.select__menu, [role="listbox"]')].filter(isDisplayed);
}

async function fillReactSelect(doc, input, answer, fieldLabelText = '') {
  if (input.id?.startsWith('iti-') || input.classList?.contains('iti__search-input')) return false;
  const allowDial = labelAllowsDial(fieldLabelText);
  // Never try to put a dial code into orientation / EEO / etc.
  if (!allowDial && looksLikeDialCodeText(answer)) return false;

  const control = input.closest('.select__control') || input;
  for (let attempt = 0; attempt < 3; attempt++) {
    closeOpenMenus(doc);
    await sleep(120);
    control.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    await sleep(80);
    const beforeMenus = new Set(displayedMenus(doc));
    openReactSelect(control, input);
    await sleep(320 + attempt * 150);
    const preferMenus = displayedMenus(doc).filter((m) => !beforeMenus.has(m));
    const allOpen = preferMenus.length ? preferMenus : displayedMenus(doc);

    let opts = visibleOptions(doc, control, input, { allowDial, preferMenus: allOpen });
    let hit = pickBestOption(opts, answer);

    if (!hit) {
      const query = String(answer).split(',')[0].trim().slice(0, 40);
      input.focus();
      setNativeValue(input, '');
      setNativeValue(input, query);
      if (typeof InputEvent === 'function') {
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: query, inputType: 'insertText' }));
      }
      for (const ch of query.slice(0, 12)) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
      }
      await sleep(700 + attempt * 250);
      const afterType = displayedMenus(doc);
      opts = visibleOptions(doc, control, input, { allowDial, preferMenus: afterType });
      hit = pickBestOption(opts, answer) || pickBestOption(opts, query);
    }

    if (hit) {
      const hitText = (hit.textContent || '').trim();
      if (!allowDial && looksLikeDialCodeText(hitText)) {
        closeOpenMenus(doc);
        continue;
      }
      await clickOption(doc, hit);
      await sleep(180);
      if (selectCommitted(input, answer) || selectCommitted(input, hitText) || selectHasValue(input)) {
        closeOpenMenus(doc);
        return true;
      }
      continue;
    }
  }
  if (!selectHasValue(input)) setNativeValue(input, '');
  closeOpenMenus(doc);
  return false;
}

function fillTelInput(input, answer) {
  const digits = String(answer).replace(/\D/g, '');
  let national = digits;
  if (digits.length === 11 && digits.startsWith('1')) national = digits.slice(1);
  else if (digits.length > 10) national = digits.slice(-10);
  // Reject dial-code-only answers ("+1" / "1") — those belong on Country.
  if (national.length < 10) return false;
  const formatted = `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
  // Avoid focus() — it often opens the dial-code UI. Set value via React setters only.
  setNativeValue(input, '');
  setNativeValue(input, formatted);
  if (typeof InputEvent === 'function') {
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: formatted }));
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
  try { input.blur?.(); } catch { /* ignore */ }
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  closeOpenMenus(input.ownerDocument);
  const committed = String(input.value || '').replace(/\D/g, '');
  return committed.slice(-10) === national.slice(-10);
}

function normalizeAnswer(label, answer) {
  let a = String(answer || '').trim();
  if (!a) return a;
  if (/company|employer/i.test(label)) a = a.split(',')[0].trim();
  if (/^phone$|phone\b|mobile|cell/i.test(label) && !/country/i.test(label)) {
    const digits = a.replace(/\D/g, '');
    if (digits.length < 10) return '';
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    return digits.slice(-10);
  }
  return a;
}

function isReactSelectInput(el) {
  return el.getAttribute('role') === 'combobox' || !!el.closest('.select__control');
}

function isDummyRequired(el) {
  return el.getAttribute('aria-hidden') === 'true' && el.tabIndex === -1;
}

export function isGreenhouseJobBoard(doc) {
  // React-Select Job Board only — classic Greenhouse uses native <select>/.field.
  return !!doc.querySelector('.select__control, input.select__input[role="combobox"]');
}

/**
 * Open a Job Board combobox briefly and return option labels (for generate/HITL).
 * Uses preventScroll + scroll restore so reading options does not jump the page.
 */
function readMenuTexts(doc, control, input, allowDial, preferMenus) {
  // Prefer aria-controls listbox (set after React-Select opens).
  const ariaId = input?.getAttribute?.('aria-controls')
    || control?.querySelector?.('[aria-controls]')?.getAttribute?.('aria-controls');
  if (ariaId) {
    const listbox = doc.getElementById(ariaId);
    if (listbox) {
      let texts = menuTexts(listbox).filter((t) => t.length < 160);
      if (!allowDial) texts = texts.filter((t) => !looksLikeDialCodeText(t));
      if (texts.length) return texts;
    }
  }
  let texts = visibleOptions(doc, control, input, { allowDial, preferMenus })
    .map((o) => (o.textContent || '').trim())
    .filter((t) => t && t.length < 160);
  if (!allowDial && texts.length && (dialCodeRatio(texts) >= 0.4 || texts.every(looksLikeDialCodeText))) {
    return [];
  }
  return texts;
}

export async function scrapeReactSelectOptions(doc, input) {
  if (!input || input.closest('.iti')) return null;
  const win = doc.defaultView;
  const sx = win?.scrollX ?? 0;
  const sy = win?.scrollY ?? 0;
  const prevOverflow = doc.documentElement?.style?.overflow;
  const fieldLabelText = (
    fieldLabel(doc, input)
    || input.getAttribute('aria-label')
    || input.placeholder
    || ''
  );
  const allowDial = labelAllowsDial(fieldLabelText);
  try {
    if (doc.documentElement) doc.documentElement.style.overflow = 'hidden';
    const control = input.closest('.select__control') || input;
    const indicator = control.querySelector?.('.select__dropdown-indicator, [class*="indicatorContainer"]');

    for (let attempt = 0; attempt < 3; attempt++) {
      closeOpenMenus(doc);
      await sleep(90 + attempt * 50);
      const beforeMenus = new Set(displayedMenus(doc));
      // Click the chevron when present — more reliable than focusing the input alone.
      if (indicator) openReactSelect(indicator, input, { preventScroll: true });
      else openReactSelect(control, input, { preventScroll: true });
      await sleep(350 + attempt * 200);

      const opened = displayedMenus(doc).filter((m) => !beforeMenus.has(m));
      const preferMenus = opened.length ? opened : displayedMenus(doc);
      const texts = readMenuTexts(doc, control, input, allowDial, preferMenus);
      if (texts.length) {
        closeOpenMenus(doc);
        return [...new Set(texts)];
      }
    }
    closeOpenMenus(doc);
    return null;
  } finally {
    try {
      if (doc.documentElement) doc.documentElement.style.overflow = prevOverflow || '';
      win?.scrollTo?.(sx, sy);
    } catch { /* ignore */ }
  }
}

/**
 * Full inject for Greenhouse Job Board React forms.
 * @returns {Promise<{ filled: number, okLabels: string[], failed: { label: string, answer: string }[] }>}
 */
export async function injectGreenhouseJobBoard(doc, answers) {
  let filled = 0;
  const okLabels = [];
  const failed = [];
  // Country (dial) before Phone so intl-tel formats against the right region.
  const ordered = [...answers].sort((a, b) => {
    const rank = (label) => (/^country$/i.test(String(label).trim()) ? 0
      : /^phone$|phone\b/i.test(String(label)) ? 1 : 2);
    return rank(a.label) - rank(b.label);
  });

  for (const item of ordered) {
    const label = item.label;
    const rawAnswer = item.answer;
    const answer = normalizeAnswer(label, rawAnswer);
    if (!answer) {
      failed.push({ label, answer: String(rawAnswer || '') });
      continue;
    }
    // Stored/profile bugs sometimes put "United States +1" on orientation/EEO.
    if (!labelAllowsDial(label) && looksLikeDialCodeText(answer)) {
      failed.push({ label, answer: '' });
      continue;
    }
    closeOpenMenus(doc);
    await sleep(40);

    const candidates = [];
    const inputs = doc.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([type="search"]), textarea, select',
    );
    /** Reddit has two consent controls — don't let "I agree" select steal the checkbox answer. */
    const answerConsent = /by checking|checkbox/i.test(label) ? 'checkbox'
      : (/by selecting|i agree|privacy policy/i.test(label) ? 'select'
        : (/consent|privacy|gdpr/i.test(label) ? 'any' : null));
    for (const input of inputs) {
      if (isDummyRequired(input)) continue;
      if (input.id?.startsWith('iti-') || input.classList?.contains('iti__search-input')) continue;
      if (input.closest('.iti') && input.type !== 'tel' && !input.classList.contains('iti__tel-input')) continue;

      let inputLabel = fieldLabel(doc, input) || input.getAttribute('aria-label') || input.placeholder || input.name || '';
      if (!inputLabel || /resume|cv|cover letter/i.test(inputLabel)) continue;

      const inputConsent = input.type === 'checkbox' && /consent|privacy|gdpr|checking/i.test(inputLabel + (input.id || '') + (input.name || ''))
        ? 'checkbox'
        : (isReactSelectInput(input) && /i agree|by selecting|privacy policy|consent/i.test(inputLabel) ? 'select' : null);

      let score = labelMatchScore(inputLabel, label);
      // Boost only when consent kinds align (select↔select, checkbox↔checkbox).
      if (answerConsent && inputConsent && (answerConsent === inputConsent || answerConsent === 'any')) {
        score = Math.max(score, inputConsent === 'select' ? 8000 : 7500);
      } else if (answerConsent && inputConsent && answerConsent !== inputConsent) {
        continue; // never map I-agree answer onto demographic checkbox (or vice versa)
      } else if (!score && input.type === 'checkbox' && /consent|agree|privacy/i.test(label)
        && /consent|agree|privacy|checking/i.test(inputLabel)) {
        score = 4000;
      }
      if (score <= 0) continue;
      candidates.push({ input, inputLabel, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) {
      failed.push({ label, answer });
      continue;
    }
    const { input } = best;
    // Bring the field into view before interacting — like focusing each control.
    try {
      input.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    } catch { /* ignore */ }
    await sleep(90);
    let ok = false;

    if (input.type === 'checkbox') {
      const yes = /^(yes|true|agree|i agree|on|1)$/i.test(String(answer).trim());
      if (yes && !input.checked) {
        // Prefer clicking the visible label — GH/React often ignore bare input.click().
        const lab = input.id ? doc.querySelector(`label[for="${input.id}"]`) : null;
        (lab || input).click();
        if (!input.checked) {
          input.checked = true;
          input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (!yes && input.checked) {
        input.click();
      }
      ok = yes ? !!input.checked : !input.checked;
    } else if (input.type === 'tel' || input.classList.contains('iti__tel-input')) {
      ok = fillTelInput(input, answer);
    } else if (isReactSelectInput(input)) {
      // Consent select: try "I agree" then "Agree" / "Yes".
      const tries = /agree|consent|privacy|by selecting/i.test(label)
        ? [...new Set([answer, 'I agree', 'Agree', 'Yes'])]
        : [answer];
      for (const tryAnswer of tries) {
        ok = await fillReactSelect(doc, input, tryAnswer, label);
        if (ok) break;
      }
    } else if (input.tagName === 'SELECT') {
      const hit = pickBestOption([...input.options], answer);
      if (hit) {
        input.value = hit.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        ok = true;
      }
    } else {
      setNativeValue(input, answer);
      ok = true;
    }

    if (ok) {
      filled++;
      okLabels.push(label);
    } else {
      failed.push({ label, answer });
    }
  }
  return { filled, okLabels, failed };
}
