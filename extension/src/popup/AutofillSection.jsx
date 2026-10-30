import React, { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3000/api';

/** Page is never written until the human clicks Fill Form Now. */
export const AUTO_INJECT_ON_GENERATE = false;

function sendMessageSafe(tabId, message, timeoutMs = 10000) {
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

function FieldRow({ label, value, bucket, onChange }) {
  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-800/50 px-2.5 py-2">
      <p className="text-[11px] text-slate-400 mb-1">{label}</p>
      <textarea
        rows={value && value.length > 60 ? 3 : 1}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={bucket === 'missing' ? 'Type an answer' : ''}
        className="w-full bg-slate-900/80 border border-slate-600/40 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
      />
    </div>
  );
}

export function AutofillSection({ profile }) {
  const [status, setStatus] = useState('idle');
  const [allFields, setAllFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [filledCount, setFilledCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [privacyMode, setPrivacyMode] = useState(null);

  const setFieldValue = useCallback((label, value) => {
    setFieldValues((prev) => ({ ...prev, [label]: value }));
  }, []);

  const handleAutofill = useCallback(async () => {
    if (!profile) return;
    setStatus('scraping');
    setErrorMsg(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
          injectImmediately: true,
        });
      } catch {
        // already injected
      }
      await new Promise((r) => setTimeout(r, 400));

      const scraped = await sendMessageSafe(tab.id, { action: 'scrapeFormFields' });
      if (!scraped?.fields?.length) {
        setErrorMsg('No form fields found on this page.');
        setStatus('error');
        return;
      }

      setStatus('loading');
      const response = await fetch(`${API_BASE}/autofill/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id,
          fields: scraped.fields,
          pageContext: { url: scraped.url, title: scraped.title },
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Autofill failed');
      }

      const result = await response.json();
      const answers = result.data.answers || [];
      const vals = {};
      answers.forEach((f) => { vals[f.label] = f.answer || ''; });
      setAllFields(answers);
      setFieldValues(vals);
      setPrivacyMode(result.data.privacyMode || 'local');
      setStatus('review');
    } catch (err) {
      setErrorMsg(err.message || 'Autofill failed');
      setStatus('error');
    }
  }, [profile]);

  const handleInject = useCallback(async () => {
    setStatus('injecting');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const answersToInject = allFields
        .map((f) => ({ label: f.label, answer: fieldValues[f.label] || '' }))
        .filter((a) => a.answer);

      const result = await sendMessageSafe(tab.id, {
        action: 'injectAutofill',
        answers: answersToInject,
      });
      setFilledCount(result?.filled || 0);

      if (answersToInject.length > 0) {
        await fetch(`${API_BASE}/autofill/save-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: profile.id, answers: answersToInject }),
        });
      }

      setStatus('done');
    } catch (err) {
      setErrorMsg(err.message || 'Injection failed');
      setStatus('error');
    }
  }, [allFields, fieldValues, profile]);

  if (!profile) return null;

  const known = allFields.filter((f) => f.bucket === 'known');
  const ask = allFields.filter((f) => f.bucket === 'ask');
  const missing = allFields.filter((f) => f.bucket === 'missing' || !f.bucket);

  return (
    <div className="p-4 border-t border-slate-800">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Autofill Application
      </h2>

      {(status === 'idle' || status === 'error') && (
        <>
          <button
            onClick={handleAutofill}
            className="w-full py-3 px-4 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Scan this form
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            Suggests answers. Nothing is written until you confirm.
          </p>
          {errorMsg && <p className="text-xs text-red-400 text-center mt-2">{errorMsg}</p>}
        </>
      )}

      {(status === 'scraping' || status === 'loading' || status === 'injecting') && (
        <p className="text-xs text-slate-400 text-center py-4">
          {status === 'scraping' && 'Scanning form fields...'}
          {status === 'loading' && 'Matching your profile...'}
          {status === 'injecting' && 'Filling form...'}
        </p>
      )}

      {status === 'review' && (
        <div>
          {privacyMode === 'cloud' ? (
            <p className="text-xs text-amber-300 mb-3">Cloud LLM — PII was replaced with placeholders.</p>
          ) : (
            <p className="text-xs text-green-300 mb-3">Local Ollama — data stayed on this machine.</p>
          )}

          {known.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-green-400 font-medium mb-2">Known ({known.length})</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {known.map((f) => (
                  <FieldRow key={f.label} label={f.label} value={fieldValues[f.label]} bucket="known" onChange={(v) => setFieldValue(f.label, v)} />
                ))}
              </div>
            </div>
          )}

          {ask.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-indigo-300 font-medium mb-2">Please check ({ask.length})</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {ask.map((f) => (
                  <FieldRow key={f.label} label={f.label} value={fieldValues[f.label]} bucket="ask" onChange={(v) => setFieldValue(f.label, v)} />
                ))}
              </div>
            </div>
          )}

          {missing.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-amber-400 font-medium mb-2">Need your input ({missing.length})</p>
              <div className="space-y-1.5">
                {missing.map((f) => (
                  <FieldRow key={f.label} label={f.label} value={fieldValues[f.label]} bucket="missing" onChange={(v) => setFieldValue(f.label, v)} />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleInject}
            className="w-full py-2.5 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
          >
            Fill Form Now
          </button>
          <button onClick={() => setStatus('idle')} className="w-full py-1.5 text-xs text-slate-500 mt-1">
            Cancel
          </button>
        </div>
      )}

      {status === 'done' && (
        <div className="text-center py-3">
          <p className="text-green-400 font-medium text-sm">✓ {filledCount} fields filled</p>
          <button
            onClick={() => { setStatus('idle'); setAllFields([]); setFieldValues({}); }}
            className="text-xs text-indigo-400 mt-2"
          >
            Run again
          </button>
        </div>
      )}
    </div>
  );
}
