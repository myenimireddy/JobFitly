import React, { useState, useCallback, useRef } from 'react';

const API_BASE = 'http://localhost:3000/api';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendMessageSafe(tabId, message, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function looksLikeDialCode(text) {
  const t = String(text || '').trim();
  return /^\+\d{1,4}$/.test(t) || (/\+\d{1,4}\b/.test(t) && t.length <= 48);
}

function cleanOptions(label, options) {
  const opts = (options || []).map(String).filter(Boolean);
  if (!opts.length) return [];
  if (/country|phone|dial|calling/i.test(label || '')) return opts;
  return opts.filter((o) => !looksLikeDialCode(o));
}

function hasAnswer(f) {
  return !!(f?.answer && String(f.answer).trim());
}

/** Country dial before phone — same order a person would fill. */
function humanFillOrder(a, b) {
  const rank = (label) => (/^country$/i.test(String(label || '').trim()) ? 0
    : /phone/i.test(String(label || '')) ? 1 : 2);
  return rank(a.label) - rank(b.label);
}

function isConsentField(label) {
  return /i agree|i consent|by selecting|by checking|privacy|gdpr|consent to|terms and conditions/i
    .test(String(label || ''));
}

/** When live scrape fails, still show a dropdown for common ATS choice questions. */
function fallbackChoices(label) {
  const l = String(label || '');
  if (isConsentField(l)) {
    return ['I agree', 'Yes'];
  }
  if (/sexual orientation/i.test(l)) {
    return [
      'Heterosexual', 'Gay', 'Lesbian', 'Bisexual', 'Queer', 'Asexual',
      'Prefer not to say', "I don't wish to answer",
    ];
  }
  if (/gender identity|what gender/i.test(l)) {
    return [
      'Man', 'Woman', 'Non-binary', 'Prefer not to say', "I don't wish to answer",
    ];
  }
  if (/transgender/i.test(l)) {
    return ['Yes', 'No', 'Prefer not to say', "I don't wish to answer"];
  }
  if (/ethnicit|race|hispanic|latino/i.test(l)) {
    return [
      'Asian', 'South Asian', 'East Asian', 'Black or African American',
      'Hispanic or Latino', 'White', 'Middle Eastern', 'Native American',
      'Prefer not to say', "I don't wish to answer",
    ];
  }
  if (/veteran|military/i.test(l)) {
    return ['Yes', 'No', 'Prefer not to say', "I don't wish to answer", 'I am not a protected veteran'];
  }
  if (/disabilit/i.test(l)) {
    return ['Yes', 'No', 'Prefer not to say', "I don't wish to answer"];
  }
  if (/authorized to work|sponsorship|18 or over|over the age/i.test(l)) {
    return ['Yes', 'No'];
  }
  return null;
}

function looksLikeDropdownField(field) {
  const l = String(field?.label || '');
  if (isConsentField(l)) return true;
  const type = String(field?.type || '').toLowerCase();
  if (type === 'select' || type === 'radio') return true;
  if (Array.isArray(field?.options) && field.options.length) return true;
  return /sexual orientation|gender identity|transgender|ethnicit|veteran|disabilit|authorized to work|sponsorship|how did you hear|device type|^country$/i.test(l);
}

function isPhoneNumberField(field) {
  const label = field?.label || '';
  const type = (field?.type || '').toLowerCase();
  if (type === 'tel') return true;
  // National number box — not Country dial / device type.
  return /^phone$|phone\b|mobile|cell|telephone/i.test(label)
    && !/country|dial|device|extension|type/i.test(label);
}

/** Free-text / open questions get an on-demand Ask AI affordance. */
function canAskAi(field, hasChoices) {
  if (hasChoices) return false;
  if (isConsentField(field?.label)) return false;
  if (isPhoneNumberField(field)) return false;
  const type = String(field?.type || '').toLowerCase();
  if (type === 'email' || type === 'tel' || type === 'number' || type === 'date') return false;
  const label = String(field?.label || '');
  if (/^(email|first name|last name|full name|linkedin|github|website|city|state|zip|postal)/i.test(label)
    && label.length < 40) {
    return false;
  }
  return true;
}

function FieldPrompt({
  field, value, onSelect, onTyped, onCommitText, onAskAi, onSkip, busy, draftingAi, askAiError,
}) {
  const scraped = cleanOptions(field.label, field.options);
  const choices = scraped.length ? scraped : (fallbackChoices(field.label) || []);
  const consent = isConsentField(field.label);
  const showAskAi = canAskAi(field, choices.length > 0);
  const shortLabel = consent
    ? 'Privacy / consent acknowledgment'
    : field.label;
  const hasText = !!(value && String(value).trim());
  const disabled = busy || draftingAi;

  return (
    <div className="rounded-lg border border-amber-700/40 bg-slate-800/50 px-2.5 py-2">
      <p className="text-[11px] text-slate-400 mb-1 leading-snug line-clamp-4" title={field.label}>
        {shortLabel}
      </p>
      {field._reviewHint && (
        <p className="text-[10px] text-amber-400/90 mb-1">{field._reviewHint}</p>
      )}
      {consent && (
        <p className="text-[10px] text-slate-500 mb-1.5 line-clamp-2" title={field.label}>
          {String(field.label || '').slice(0, 160)}
          {String(field.label || '').length > 160 ? '…' : ''}
        </p>
      )}
      {choices.length > 0 ? (
        consent ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(choices[0])}
              className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
            >
              {choices[0]}
            </button>
            {choices[1] && choices[1] !== choices[0] && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(choices[1])}
                className="py-2 px-3 rounded-lg text-xs text-slate-300 border border-slate-600/50 hover:bg-slate-700/50 disabled:opacity-50"
              >
                {choices[1]}
              </button>
            )}
            <button
              type="button"
              disabled={disabled}
              onClick={onSkip}
              className="py-2 px-2.5 rounded-lg text-xs text-slate-400 border border-slate-600/40 hover:bg-slate-700/40 disabled:opacity-50"
            >
              Skip
            </button>
          </div>
        ) : (
          <>
            <select
              value={choices.includes(value) ? value : ''}
              disabled={disabled}
              onChange={(e) => {
                if (e.target.value) onSelect(e.target.value);
              }}
              className="w-full bg-slate-900/80 border border-slate-600/40 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            >
              <option value="">Choose an option</option>
              {choices.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <div className="flex justify-end mt-1.5">
              <button
                type="button"
                disabled={disabled}
                onClick={onSkip}
                className="py-1.5 px-2.5 rounded-lg text-[11px] text-slate-400 border border-slate-600/40 hover:bg-slate-700/40 disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <textarea
            rows={showAskAi ? 4 : 2}
            value={value || ''}
            disabled={disabled}
            onChange={(e) => onTyped(e.target.value)}
            placeholder={showAskAi ? 'Type an answer, or Ask AI for a draft' : 'Type answer, then Fill'}
            className="w-full bg-slate-900/80 border border-slate-600/40 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-y min-h-[2.5rem] disabled:opacity-50"
          />
          <div className="flex gap-1.5 mt-1.5">
            {showAskAi && (
              <button
                type="button"
                disabled={disabled}
                onClick={onAskAi}
                className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium border border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/15 disabled:opacity-50"
              >
                {draftingAi ? 'Drafting…' : (hasText ? 'Ask AI again' : 'Ask AI')}
              </button>
            )}
            <button
              type="button"
              disabled={disabled || !hasText}
              onClick={() => onCommitText(String(value).trim())}
              className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
            >
              Fill
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onSkip}
              className="py-1.5 px-2.5 rounded-lg text-[11px] text-slate-400 border border-slate-600/40 hover:bg-slate-700/40 disabled:opacity-50"
            >
              Skip
            </button>
          </div>
          {askAiError && (
            <p className="text-[10px] text-red-400 mt-1">{askAiError}</p>
          )}
          {draftingAi && (
            <p className="text-[10px] text-slate-500 mt-1">Using your profile — usually 10–60s</p>
          )}
        </>
      )}
      {busy && !draftingAi && <p className="text-[10px] text-slate-500 mt-1">Filling…</p>}
    </div>
  );
}

async function ensureContentScript(tabId) {
  // Avoid re-injecting: the content bundle used top-level `const _` (PortalEngine),
  // so a second inject threw "Identifier '_' has already been declared" (seen on Ashby).
  const alive = await sendMessageSafe(tabId, { action: 'ping' }, 1200);
  if (alive?.ok) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
      injectImmediately: true,
    });
  } catch { /* page may already have an older inject */ }
  await sleep(350);
}

function filledCount(result) {
  const n = result?.filled;
  if (typeof n === 'number') return n;
  // Guard against nested { filled: { filled: N } } from older content scripts.
  if (n && typeof n === 'object' && typeof n.filled === 'number') return n.filled;
  return 0;
}

async function injectOne(tabId, profileId, label, answer, experienceIndex = null) {
  const payload = [{
    label,
    answer: String(answer).trim(),
    experienceIndex: Number.isInteger(experienceIndex) ? experienceIndex : undefined,
  }];
  const result = (await sendMessageSafe(tabId, { action: 'injectAutofill', answers: payload })) || {};
  const okLabels = result.okLabels || [];
  const failed = Array.isArray(result.failed) ? result.failed : [];
  const count = filledCount(result);
  const ok = (count > 0 && !failed.some((f) => f.label === label)) || okLabels.includes(label);
  if (ok) {
    try {
      await fetch(`${API_BASE}/autofill/save-answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, answers: [{ label, answer: String(answer).trim() }] }),
      });
    } catch { /* ignore */ }
    return { ok: true, filled: count || 1 };
  }
  return { ok: false, filled: 0, suggested: failed.find((f) => f.label === label)?.answer || answer };
}

async function loadOptionsForField(tabId, field) {
  // Never open the Country dial React-Select when asking about the phone number.
  if (isPhoneNumberField(field)) {
    return { ...field, options: null, type: 'tel' };
  }
  // Consent is Yes / I agree — don't scrape (opens wrong menus, shows "Loading…").
  if (isConsentField(field.label)) {
    return { ...field, options: fallbackChoices(field.label), type: 'select' };
  }
  const existing = cleanOptions(field.label, field.options);
  if (existing.length >= 2) {
    return { ...field, options: existing, type: 'select' };
  }

  let opts = [];
  for (let attempt = 0; attempt < 2 && opts.length < 2; attempt++) {
    const res = await sendMessageSafe(tabId, {
      action: 'scrapeFieldOptions',
      label: field.label,
    }, 90000);
    opts = cleanOptions(field.label, res?.options || []);
    if (opts.length < 2) await sleep(200);
  }

  if (opts.length >= 2) {
    return { ...field, options: opts, type: 'select' };
  }

  const fallback = fallbackChoices(field.label);
  if (fallback?.length) {
    return { ...field, options: fallback, type: 'select' };
  }

  return {
    ...field,
    options: null,
    type: looksLikeDropdownField(field) ? 'select' : field.type,
  };
}

export function AutofillSection({ profile, onFillActiveChange }) {
  const [status, setStatus] = useState('idle');
  const [progressLabel, setProgressLabel] = useState('');
  const [progressIndex, setProgressIndex] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [currentField, setCurrentField] = useState(null);
  const [fieldValue, setFieldValue] = useState('');
  const [filledCount, setFilledCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draftingAi, setDraftingAi] = useState(false);
  const [askAiError, setAskAiError] = useState(null);

  const tabIdRef = useRef(null);
  const abortRef = useRef(false);
  const pickResolverRef = useRef(null);
  const pageContextRef = useRef({});

  const setFillActive = (active) => {
    if (typeof onFillActiveChange === 'function') onFillActiveChange(active);
  };

  const reset = () => {
    abortRef.current = true;
    if (pickResolverRef.current) {
      pickResolverRef.current(null);
      pickResolverRef.current = null;
    }
    setStatus('idle');
    setProgressLabel('');
    setProgressIndex(0);
    setProgressTotal(0);
    setCurrentField(null);
    setFieldValue('');
    setFilledCount(0);
    setErrorMsg(null);
    setBusy(false);
    setDraftingAi(false);
    setAskAiError(null);
    tabIdRef.current = null;
    setFillActive(false);
  };

  const askHuman = async (tabId, field, suggested = '') => {
    const enriched = await loadOptionsForField(tabId, field);
    const allowDial = /country|phone|dial|calling/i.test(field.label || '');
    const llmDraft = field.bucket === 'ask' || field.source === 'llm';
    let hint = String(suggested || enriched.suggested || '').trim();
    // Never show Country dial text as the pick for orientation / EEO.
    if (!allowDial && looksLikeDialCode(hint)) hint = '';
    if (hint && enriched.options?.length && !enriched.options.includes(hint) && !llmDraft) {
      // Suggested isn't in the real menu — don't prefill garbage (keep LLM drafts for edit).
      if (!allowDial) hint = '';
    }
    setCurrentField({
      ...enriched,
      _reviewHint: llmDraft ? 'Review AI draft, edit if needed, then Fill' : null,
    });
    setFieldValue(hint);
    setAskAiError(null);
    setDraftingAi(false);
    setStatus('needs_input');
    setBusy(false);
    setErrorMsg(null);
    return new Promise((resolve) => {
      pickResolverRef.current = resolve;
    });
  };

  const resolveHuman = (value) => {
    const resolve = pickResolverRef.current;
    if (!resolve) return;
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    pickResolverRef.current = null;
    setBusy(true);
    setDraftingAi(false);
    setAskAiError(null);
    setStatus('working');
    setCurrentField(null);
    resolve({ kind: 'answer', value: trimmed });
  };

  /** Skip this field only — continue the fill queue. Stop still aborts the run. */
  const skipHuman = () => {
    const resolve = pickResolverRef.current;
    if (!resolve) return;
    pickResolverRef.current = null;
    setBusy(true);
    setDraftingAi(false);
    setAskAiError(null);
    setStatus('working');
    setCurrentField(null);
    resolve({ kind: 'skip' });
  };

  const handleAskAi = async () => {
    if (!profile || !currentField || draftingAi || busy) return;
    setDraftingAi(true);
    setAskAiError(null);
    try {
      const response = await fetch(`${API_BASE}/autofill/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          pageContext: pageContextRef.current,
          field: {
            label: currentField.label,
            type: currentField.type,
            required: currentField.required,
            options: currentField.options || null,
          },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'AI draft failed');
      }
      const draft = String(body?.data?.answer || '').trim();
      if (!draft) {
        setAskAiError('AI had nothing grounded in your profile — type your answer.');
        return;
      }
      setFieldValue(draft);
      setCurrentField((prev) => (prev ? {
        ...prev,
        _reviewHint: 'Review AI draft, edit if needed, then Fill',
      } : prev));
    } catch (err) {
      setAskAiError(err.message || 'AI draft failed');
    } finally {
      setDraftingAi(false);
    }
  };

  const handleFillForm = useCallback(async () => {
    if (!profile) return;
    abortRef.current = false;
    setStatus('working');
    setFillActive(true);
    setErrorMsg(null);
    setFilledCount(0);
    setCurrentField(null);
    setProgressLabel('Reading form…');
    setProgressIndex(0);
    setProgressTotal(0);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab — click the application page, then Fill Form');
      }
      tabIdRef.current = tab.id;
      await ensureContentScript(tab.id);

      const scraped = await sendMessageSafe(tab.id, { action: 'scrapeFormFields' }, 120000);
      if (abortRef.current) return;
      if (!scraped?.fields?.length) {
        setErrorMsg('No form fields found on this page.');
        setStatus('error');
        return;
      }

      pageContextRef.current = { url: scraped.url, title: scraped.title };

      setProgressLabel('Matching answers…');
      const response = await fetch(`${API_BASE}/autofill/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          fields: scraped.fields,
          pageContext: pageContextRef.current,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Autofill failed');
      }

      const result = await response.json();
      const queue = [...(result.data.answers || [])].sort(humanFillOrder);
      setProgressTotal(queue.length);

      let filled = 0;
      for (let i = 0; i < queue.length; i++) {
        if (abortRef.current) return;
        const field = queue[i];
        setProgressIndex(i + 1);
        setProgressLabel(field.label);
        setStatus('working');
        setCurrentField(null);

        let answer = hasAnswer(field) ? String(field.answer).trim() : '';
        const allowDial = /country|phone|dial|calling/i.test(field.label || '');
        // Poisoned stored answers (orientation ← dial code) → ask, don't inject.
        if (answer && !allowDial && looksLikeDialCode(answer)) answer = '';

        // LLM drafts (bucket ask) must be reviewed — never auto-inject into the live form.
        const needsReview = field.bucket === 'ask' || field.source === 'llm';

        if (!answer) {
          const pick = await askHuman(tab.id, field, '');
          if (abortRef.current || !pick) {
            if (!abortRef.current) setErrorMsg('Stopped.');
            break;
          }
          if (pick.kind === 'skip') {
            await sleep(120);
            continue;
          }
          answer = pick.value;
        } else if (needsReview) {
          const pick = await askHuman(tab.id, field, answer);
          if (abortRef.current || !pick) {
            if (!abortRef.current) setErrorMsg('Stopped.');
            break;
          }
          if (pick.kind === 'skip') {
            await sleep(120);
            continue;
          }
          answer = pick.value;
        }

        const expIdx = Number.isInteger(field.experienceIndex) ? field.experienceIndex : null;
        let injectResult = await injectOne(tab.id, profile.id, field.label, answer, expIdx);

        // Inject missed → open that field's real options and ask.
        if (!injectResult.ok) {
          const pick = await askHuman(tab.id, { ...field, answer: null }, injectResult.suggested || answer);
          if (abortRef.current || !pick) break;
          if (pick.kind === 'skip') {
            await sleep(120);
            continue;
          }
          answer = pick.value;
          injectResult = await injectOne(tab.id, profile.id, field.label, answer, expIdx);
          if (!injectResult.ok) {
            setErrorMsg(`Could not set “${field.label.slice(0, 40)}”. Continuing…`);
            await sleep(400);
            continue;
          }
        }

        filled += injectResult.filled || 1;
        setFilledCount(filled);
        // Brief pause between fields — human pacing.
        await sleep(280 + Math.floor(Math.random() * 180));
      }

      if (!abortRef.current) {
        setFilledCount(filled);
        setStatus('done');
        setProgressLabel('');
        setFillActive(false);
      }
    } catch (err) {
      if (!abortRef.current) {
        setErrorMsg(err.message || 'Autofill failed');
        setStatus('error');
        setFillActive(false);
      }
    }
  }, [profile]);

  if (!profile) return null;

  const sessionLive = status === 'working' || status === 'needs_input';

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${sessionLive ? 'bg-slate-900' : ''}`}>
      <div className="p-3 flex-1 min-h-0 overflow-y-auto">
        <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Autofill
        </h2>

        {(status === 'idle' || status === 'error') && (
          <>
            <button
              type="button"
              onClick={handleFillForm}
              className="w-full py-2.5 px-3 rounded-lg font-medium text-sm bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Fill Form
            </button>
            <ul className="mt-2 space-y-1 text-[11px] text-slate-500 leading-snug list-disc pl-4">
              <li>One field at a time — this panel stays open while you click the page</li>
              <li>Pauses for your pick — Ask AI, Fill, or Skip</li>
              <li>Never clicks Submit</li>
            </ul>
            {errorMsg && <p className="text-xs text-red-400 mt-2">{errorMsg}</p>}
          </>
        )}

        {status === 'working' && (
          <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-3 text-center">
            <p className="text-xs text-slate-200">
              {progressTotal
                ? `Field ${progressIndex} of ${progressTotal}`
                : 'Working…'}
            </p>
            {progressLabel && (
              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 px-1" title={progressLabel}>
                {progressLabel}
              </p>
            )}
            <p className="text-[10px] text-green-400/80 mt-2">{filledCount} filled so far</p>
            <button type="button" onClick={reset} className="text-xs text-slate-500 mt-3 hover:text-slate-300">
              Stop
            </button>
          </div>
        )}

        {status === 'needs_input' && currentField && (
          <div className="sticky top-0 z-[1]">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[11px] text-slate-400">
                Field {progressIndex} of {progressTotal} · {filledCount} filled
              </p>
              <button type="button" onClick={reset} className="text-[10px] text-slate-500 hover:text-slate-300">
                Stop
              </button>
            </div>
            <p className="text-[11px] text-amber-400/95 font-medium mb-2">Your pick for this field</p>
            <FieldPrompt
              field={currentField}
              value={fieldValue}
              busy={busy}
              draftingAi={draftingAi}
              askAiError={askAiError}
              onSelect={(v) => resolveHuman(v)}
              onTyped={(v) => {
                setFieldValue(v);
                if (askAiError) setAskAiError(null);
              }}
              onCommitText={(v) => resolveHuman(v)}
              onAskAi={handleAskAi}
              onSkip={skipHuman}
            />
            {errorMsg && <p className="text-xs text-red-400 mt-2">{errorMsg}</p>}
          </div>
        )}

        {status === 'done' && (
          <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-4 text-center">
            <p className="text-green-400 font-medium text-sm">{filledCount} fields filled</p>
            <p className="text-[11px] text-slate-500 mt-1">Review the page, then submit yourself.</p>
            <button type="button" onClick={reset} className="text-xs text-indigo-400 mt-3 hover:text-indigo-300">
              Run again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
