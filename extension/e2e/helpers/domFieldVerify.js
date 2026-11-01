/**
 * Browser-side inject + read-back used by live portal specs.
 * @param {import('@playwright/test').Page} page
 * @param {{ label: string, answer: string }[]} answers - injected into the form
 * @param {{ label: string, answer: string }[]} [verifyAnswers] - labels/values to assert (defaults to answers)
 * Returns { portal, filled, results[], okCount, failCount, failures[] }.
 */
export async function injectAndVerifyDom(page, answers, verifyAnswers) {
  return page.evaluate(async ({ ans, verify }) => {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const score = (a, b) => {
      const na = norm(a);
      const nb = norm(b);
      if (!na || !nb) return 0;
      if (na === nb) return 10000 + na.length;
      const ta = tokens(a);
      const tb = tokens(b);
      const aInB = ta.every((t) => tb.includes(t));
      const bInA = tb.every((t) => ta.includes(t));
      if (aInB || bInA) {
        return Math.min(ta.length, tb.length) * 100 - Math.abs(ta.length - tb.length) * 80;
      }
      return 0;
    };
    const softMatch = (expected, observed) => {
      if (!expected) return true;
      const e = String(expected).trim();
      const o = String(observed || '').trim();
      if (!o) return false;
      if (norm(e) === norm(o)) return true;
      if (norm(o).includes(norm(e)) || norm(e).includes(norm(o))) return true;
      const ed = e.replace(/\D/g, '');
      const od = o.replace(/\D/g, '');
      if (ed.length >= 10 && od.includes(ed.slice(-10))) return true;
      if (/united states/i.test(e) && /united states/i.test(o)) return true;
      if (/united states/i.test(e) && (/^\+?1$/.test(o) || /\+1/.test(o))) return true;
      if (/^(yes|1|true|on|i agree)$/i.test(e) && /^(yes|1|true|on|i agree)$/i.test(o)) return true;
      if (/i agree|consent/i.test(e) && /^(yes|i agree|true|on|1)$/i.test(o)) return true;
      if (/^yes$/i.test(e) && /^yes\b/i.test(o)) return true;
      if (/^no$/i.test(e) && (/^no\b/i.test(o) || /not a|do not have|no military|not a protected|not hispanic/i.test(o))) return true;
      if (/south\s*asian|east\s*asian|^asian$/i.test(e) && /asian/i.test(o)) return true;
      if (/black|african/i.test(e) && /black|african/i.test(o)) return true;
      if (/hispanic|latino/i.test(e) && /hispanic|latino/i.test(o)) return true;
      if (/white/i.test(e) && /white/i.test(o)) return true;
      if (/heterosexual|straight/i.test(e) && /heterosexual|straight/i.test(o)) return true;
      if (/non-?binary/i.test(e) && /non-?binary/i.test(o)) return true;
      if (/he\/him|she\/her|they\/them/i.test(e) && norm(e) === norm(o)) return true;
      if (/linkedin\.com/i.test(e) && /linkedin\.com/i.test(o)) return true;
      if (/github\.com/i.test(e) && /github\.com/i.test(o)) return true;
      if (/mobile/i.test(e) && /mobile/i.test(o)) return true;
      // City: "Austin" vs "Austin, Texas, United States"
      const cityToken = e.split(',')[0].trim();
      if (cityToken.length >= 3 && new RegExp(cityToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(o)) return true;
      return score(e, o) > 0;
    };

    const clean = (s) => String(s || '').replace(/[*:✱＊]+/g, ' ').replace(/\s+/g, ' ').trim();

    const valueFromContainer = (wrap) => {
      if (!wrap) return '';
      const singles = [...wrap.querySelectorAll('.select__single-value, .select__multi-value__label')]
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean);
      if (singles.length) return singles.join(' | ');

      const listBtn = wrap.querySelector('button[aria-haspopup="listbox"]');
      if (listBtn) return (listBtn.innerText || listBtn.getAttribute('aria-label') || '').trim();

      const multiSelected = [...wrap.querySelectorAll('[data-automation-id="selectedItem"]')]
        .map((el) => (el.innerText || '').trim())
        .filter(Boolean);
      if (multiSelected.length) return multiSelected.join(' | ');

      const checkedRadio = wrap.querySelector('input[type="radio"]:checked');
      if (checkedRadio) {
        const span = checkedRadio.parentElement?.querySelector('.application-answer-alternative');
        if (span) return clean(span.innerText);
        const rl = document.querySelector(`label[for="${checkedRadio.id}"]`);
        return rl ? clean(rl.innerText) : checkedRadio.value;
      }

      const checkedBoxes = [...wrap.querySelectorAll('input[type="checkbox"]:checked')];
      if (checkedBoxes.length) {
        const texts = checkedBoxes.map((cb) => {
          const span = cb.parentElement?.querySelector('.application-answer-alternative');
          return span ? clean(span.innerText) : cb.value;
        }).filter(Boolean);
        if (texts.length) return texts.join(' | ');
      }

      const cb = wrap.querySelector('input[type="checkbox"]');
      if (cb && !wrap.querySelector('input[type="text"], input[type="email"], input[type="tel"], textarea, input[role="combobox"]')) {
        return cb.checked ? 'yes' : 'no';
      }

      const select = wrap.querySelector('select');
      if (select && select.selectedIndex >= 0) {
        const opt = select.options[select.selectedIndex];
        return clean((opt && opt.text) || select.value);
      }

      const input = wrap.querySelector(
        'textarea, input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([aria-hidden="true"])',
      );
      if (input && input.value && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(input.value)) return input.value;
      return '';
    };

    const readFieldValue = (label) => {
      const byAria = [...document.querySelectorAll('input[aria-label], textarea[aria-label], select[aria-label]')]
        .find((el) => score(el.getAttribute('aria-label'), label) > 0);
      if (byAria) {
        if (byAria.tagName === 'SELECT') {
          const opt = byAria.options[byAria.selectedIndex];
          return clean((opt && opt.text) || byAria.value);
        }
        if (byAria.value) return byAria.value;
        const nest = byAria.closest('.field, [class*="field--"], .select__container, div') || byAria.parentElement;
        const fromNest = valueFromContainer(nest);
        if (fromNest) return fromNest;
      }

      let bestLabel = null;
      let bestScore = 0;
      for (const lab of document.querySelectorAll('label')) {
        const text = clean(lab.innerText || lab.textContent);
        const sc = score(text, label);
        if (sc > bestScore) {
          bestScore = sc;
          bestLabel = lab;
        }
      }
      if (bestLabel && bestScore > 0) {
        if (bestLabel.htmlFor) {
          const el = document.getElementById(bestLabel.htmlFor);
          if (el) {
            if (el.tagName === 'SELECT') {
              const opt = el.options[el.selectedIndex];
              const t = clean((opt && opt.text) || el.value);
              if (t) return t;
            }
            if (el.tagName === 'BUTTON' || el.getAttribute('aria-haspopup') === 'listbox') {
              const t = clean(el.innerText || el.getAttribute('aria-label') || '');
              if (t && !/^(select one|select\.\.\.|choose)/i.test(t)) return t;
            }
            if (el.type === 'checkbox') return el.checked ? 'yes' : 'no';
            if (el.value && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(el.value) && el.value.length < 80) {
              return el.value;
            }
            let p = el.parentElement;
            for (let i = 0; i < 8 && p; i++) {
              const v = valueFromContainer(p);
              if (v && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(v)) return v;
              p = p.parentElement;
            }
          }
        }
        const wrap = bestLabel.closest(
          '.field, [class*="field--"], .application-question, [data-field-path], [data-automation-id^="formField-"], [data-automation-id="radioGroup"], li, div',
        );
        const fromWrap = valueFromContainer(wrap);
        if (fromWrap && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(fromWrap)) return fromWrap;
      }

      let bestWrap = null;
      bestScore = 0;
      for (const wrap of document.querySelectorAll(
        '.application-question, [data-field-path], [data-automation-id^="formField-"], [data-automation-id="radioGroup"]',
      )) {
        const textNode = wrap.querySelector('.application-label .text');
        const appLabel = wrap.querySelector('.application-label');
        let fLabel = '';
        if (textNode) {
          fLabel = clean(textNode.innerText || textNode.textContent);
        } else if (appLabel) {
          const direct = [...appLabel.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent || '')
            .join(' ')
            .trim();
          fLabel = clean(direct || appLabel.innerText || appLabel.textContent);
        } else {
          const labelEl = wrap.querySelector('.ashby-application-form-question-title, [data-automation-id="formLabel"], label, [class*="title"]');
          fLabel = labelEl ? clean(labelEl.innerText || labelEl.textContent) : '';
        }
        fLabel = fLabel.split(/\n/)[0].replace(/\bSelect\b.*/i, '').trim();
        const sc = score(fLabel, label);
        if (sc > bestScore) {
          bestScore = sc;
          bestWrap = wrap;
        }
      }
      if (bestWrap && bestScore > 0) {
        const select = bestWrap.querySelector('select');
        if (select && select.selectedIndex >= 0) {
          const t = clean(select.options[select.selectedIndex]?.text || select.value);
          if (t && !/^select/i.test(t)) return t;
        }
        const checkedBoxes = [...bestWrap.querySelectorAll('input[type="checkbox"]:checked')];
        if (checkedBoxes.length) {
          return checkedBoxes.map((cb) => {
            const span = cb.parentElement?.querySelector('.application-answer-alternative');
            return span ? clean(span.innerText) : cb.value;
          }).filter(Boolean).join(' | ');
        }
        const checked = bestWrap.querySelector('input[type="radio"]:checked');
        if (checked) {
          const span = checked.parentElement?.querySelector('.application-answer-alternative');
          return span ? clean(span.innerText) : checked.value;
        }
        const v = valueFromContainer(bestWrap);
        if (v && !/^[0-9a-f]{8}-?[0-9a-f]{4}/i.test(v)) return v;
      }
      return '';
    };

    const portal = window.PortalEngine.detect();
    const filled = await window.PortalEngine.inject(ans);
    await new Promise((r) => setTimeout(r, 900));

    const check = (verify && verify.length) ? verify : ans;
    const results = check.map(({ label, answer }) => {
      const observed = readFieldValue(label);
      const ok = softMatch(answer, observed);
      return { label, expected: answer, observed, ok };
    });

    return {
      portal,
      filled,
      url: location.href,
      results,
      okCount: results.filter((r) => r.ok).length,
      failCount: results.filter((r) => !r.ok).length,
      failures: results.filter((r) => !r.ok),
    };
  }, { ans: answers, verify: verifyAnswers || null });
}
