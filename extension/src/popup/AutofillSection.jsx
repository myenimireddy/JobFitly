import React, { useState, useCallback, useMemo } from 'react';

const API_BASE = 'http://localhost:3000/api';

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

// Field categories for smart UI treatment
const EDITABLE_LABELS = ['salary', 'compensation', 'pay', 'location', 'city', 'timezone', 'time zone'];
const MOTIVATION_LABELS = ['why are you interested', 'why do you want', 'why this company', 'why veeva', 'why join', 'interested in'];
const SKILLS_LABELS = ['skill', 'how do your skill', 'align', 'experience align', 'relevant experience', 'how does your background'];

function fieldCategory(label) {
  const l = label.toLowerCase();
  if (MOTIVATION_LABELS.some(k => l.includes(k))) return 'motivation';
  if (SKILLS_LABELS.some(k => l.includes(k))) return 'skills';
  if (EDITABLE_LABELS.some(k => l.includes(k))) return 'editable';
  return 'normal';
}

// Generate suggestion chips based on field category and profile context
function getSuggestions(category, label, profile) {
  const name = profile?.parsedData?.personalInfo?.fullName?.split(' ')[0] || 'I';
  const skills = (profile?.parsedData?.skills || []).slice(0, 4).join(', ') || 'my skills';
  const company = (profile?.parsedData?.workExperience?.[0]?.company) || 'my previous company';
  const title = (profile?.parsedData?.workExperience?.[0]?.title) || 'my role';

  if (category === 'motivation') {
    return [
      `I'm excited about this role because it aligns with my experience in ${skills} and the company's mission resonates with my career goals.`,
      `This opportunity combines my technical background with the chance to work on impactful products at scale. I'm particularly drawn to the team's approach to innovation.`,
      `I've followed the company's growth closely and believe my background in ${skills} would let me contribute meaningfully from day one.`,
    ];
  }
  if (category === 'skills') {
    return [
      `My experience with ${skills} at ${company} directly maps to the core requirements. As ${title}, I built and maintained similar systems at scale.`,
      `I bring hands-on experience in ${skills}, with a track record of delivering results in fast-paced environments. My background covers both the technical depth and collaborative skills needed for this role.`,
      `The role requires ${skills.split(',')[0]} expertise — I've used this extensively and can ramp up on any gaps quickly given my strong foundation.`,
    ];
  }
  return [];
}

// Inline editable field row — editing state is controlled by parent
function FieldRow({ label, value, onChange, category, suggestions, editing, onToggleEdit }) {
  const isLong = value && value.length > 60;
  const isMotivationOrSkills = category === 'motivation' || category === 'skills';

  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-800/50 overflow-hidden">
      {/* Label + edit toggle */}
      <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
        <span className="text-[11px] text-slate-400 truncate mr-2">{label}</span>
        <button
          onClick={onToggleEdit}
          className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
            editing
              ? 'bg-indigo-700/50 text-indigo-300'
              : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'
          }`}
        >
          {editing ? 'done' : 'edit'}
        </button>
      </div>

      {/* Value display or textarea */}
      {editing ? (
        <div className="px-2.5 pb-2.5">
          <textarea
            autoFocus
            rows={isMotivationOrSkills ? 4 : 1}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-slate-900/80 border border-indigo-600/40 rounded px-2 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
          {/* Suggestion chips */}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Suggestions — click to use</p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onChange(s)}
                  className="w-full text-left text-[11px] text-slate-300 bg-slate-700/40 hover:bg-indigo-900/30 border border-slate-600/30 hover:border-indigo-700/40 rounded px-2 py-1.5 leading-relaxed transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className={`px-2.5 pb-2 text-xs text-slate-200 leading-relaxed ${!isLong ? 'truncate' : 'line-clamp-2'}`}>
          {value || <span className="text-slate-500 italic">empty — click edit</span>}
        </p>
      )}
    </div>
  );
}

/**
 * AutofillSection - scrapes page fields, sends to backend LLM, injects answers
 */
export function AutofillSection({ profile }) {
  const [status, setStatus] = useState('idle');
  const [allFields, setAllFields] = useState([]); // merged answered + missing
  const [filledFields, setFilledFields] = useState([]); // frozen at review time
  const [emptyFields, setEmptyFields] = useState([]);   // frozen at review time
  const [fieldValues, setFieldValues] = useState({}); // label → current value
  const [editingFields, setEditingFields] = useState(new Set()); // labels currently in edit mode
  const [filledCount, setFilledCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState(null);
  const [privacyMode, setPrivacyMode] = useState(null);
  const [clearing, setClearing] = useState(false);

  const toggleEdit = useCallback((label) => {
    setEditingFields(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const setFieldValue = useCallback((label, value) => {
    setFieldValues(prev => ({ ...prev, [label]: value }));
  }, []);

  const handleClearSaved = useCallback(async () => {
    if (!profile) return;
    setClearing(true);
    try {
      await fetch(`${API_BASE}/autofill/saved-answers`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.id }),
      });
    } finally {
      setClearing(false);
    }
  }, [profile]);

  const handleAutofill = useCallback(async () => {
    if (!profile) return;
    setStatus('scraping');
    setErrorMsg(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      // Programmatically inject content script to bypass cache and get latest code
      // This is more reliable than relying on manifest auto-injection which uses cached version
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
          injectImmediately: true
        });
        console.log('[AutofillSection] content script injected programmatically');
      } catch (injectErr) {
        console.log('[AutofillSection] injection may have failed or script already exists:', injectErr?.message);
      }

      // Delay to let script initialize and React portals render their initial DOM
      await new Promise(r => setTimeout(r, 600));

      const scraped = await sendMessageSafe(tab.id, { action: 'scrapeFormFields' });
      console.log('[AutofillSection] scraped response:', scraped);
      if (!scraped?.fields?.length) {
        setErrorMsg(`No form fields found on this page. (received: ${scraped?.fields?.length || 0} fields)`);
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
      const answered = result.data.answers || [];
      const missing = result.data.missingFields || [];

      // Merge into one flat list: answered + missing
      const merged = [
        ...answered,
        ...missing.filter(m => !answered.find(a => a.label === m.label)),
      ];
      setAllFields(merged);

      // Seed editable values from answers
      const vals = {};
      merged.forEach(f => { vals[f.label] = f.answer || ''; });
      setFieldValues(vals);

      // Freeze filled/filled split so typing doesn't move fields between sections
      setFilledFields(merged.filter(f => f.answer));
      setEmptyFields(merged.filter(f => !f.answer));

      // Auto-inject the answered fields into the page
      const answersToInject = answered.filter(a => a.answer);
      if (answersToInject.length > 0) {
        console.log('[AutofillSection] Auto-injecting', answersToInject.length, 'answers');
        await sendMessageSafe(tab.id, { 
          action: 'injectAutofill', 
          answers: answersToInject 
        });
      }

      setPrivacyMode(result.data.privacyMode || 'local');
      setEditingFields(new Set());
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
        .map(f => ({ label: f.label, answer: fieldValues[f.label] || '' }))
        .filter(a => a.answer);

      const result = await sendMessageSafe(tab.id, { action: 'injectAutofill', answers: answersToInject });
      setFilledCount(result?.filled || 0);

      // Save ALL current values back to DB for future reuse
      const toSave = answersToInject.filter(a => a.answer.trim());
      if (toSave.length > 0) {
        await fetch(`${API_BASE}/autofill/save-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: profile.id, answers: toSave }),
        });
      }

      setStatus('done');
    } catch (err) {
      setErrorMsg(err.message || 'Injection failed');
      setStatus('error');
    }
  }, [allFields, fieldValues, profile]);

  if (!profile) return null;

  return (
    <div className="p-4 border-t border-slate-800">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Autofill Application
      </h2>

      {/* Idle / trigger */}
      {(status === 'idle' || status === 'error') && (
        <>
          <button
            onClick={handleAutofill}
            className="w-full py-3 px-4 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 transition-colors"
          >
            <span>✨</span>
            <span>Autofill This Form</span>
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            Scans this page's form fields and fills them using your resume
          </p>
          {errorMsg && <p className="text-xs text-red-400 text-center mt-2">{errorMsg}</p>}
          <button
            onClick={handleClearSaved}
            disabled={clearing}
            className="w-full text-[11px] text-slate-600 hover:text-slate-400 mt-2 py-1 transition-colors disabled:opacity-40"
          >
            {clearing ? 'Clearing…' : '↺ Reset saved answers'}
          </button>
        </>
      )}

      {/* Loading */}
      {(status === 'scraping' || status === 'loading' || status === 'injecting') && (
        <div className="text-center py-4">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400">
            {status === 'scraping' && 'Scanning form fields...'}
            {status === 'loading' && 'AI is filling your answers...'}
            {status === 'injecting' && 'Filling form...'}
          </p>
        </div>
      )}

      {/* Review */}
      {status === 'review' && (
        <div>
          {/* Privacy banner */}
          {privacyMode === 'cloud' ? (
            <div className="flex gap-2 bg-amber-900/40 border border-amber-700/50 rounded-lg px-3 py-2 mb-3">
              <span className="text-amber-400 shrink-0">⚠</span>
              <p className="text-xs text-amber-300"><strong>Cloud LLM.</strong> PII replaced with placeholders before sending.</p>
            </div>
          ) : (
            <div className="flex gap-2 bg-green-900/30 border border-green-800/40 rounded-lg px-3 py-2 mb-3">
              <span className="text-green-400 shrink-0">🔒</span>
              <p className="text-xs text-green-300"><strong>Local Ollama.</strong> Nothing sent externally.</p>
            </div>
          )}

          {/* All fields — pre-filled and editable */}
          {filledFields.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-green-400 font-medium mb-2">
                ✓ {filledFields.length} fields ready — tap <span className="text-slate-400">edit</span> to change
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                {filledFields.map((f, i) => {
                  const cat = fieldCategory(f.label);
                  const suggestions = getSuggestions(cat, f.label, profile);
                  return (
                    <FieldRow
                      key={f.label}
                      label={f.label}
                      value={fieldValues[f.label]}
                      onChange={v => setFieldValue(f.label, v)}
                      category={cat}
                      suggestions={suggestions}
                      editing={editingFields.has(f.label)}
                      onToggleEdit={() => toggleEdit(f.label)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty fields — need input */}
          {emptyFields.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] text-amber-400 font-medium mb-2">
                ⚠ {emptyFields.length} field{emptyFields.length > 1 ? 's' : ''} need your input
              </p>
              <div className="space-y-1.5">
                {emptyFields.map((f, i) => {
                  const cat = fieldCategory(f.label);
                  const suggestions = getSuggestions(cat, f.label, profile);
                  return (
                    <FieldRow
                      key={f.label}
                      label={f.label}
                      value={fieldValues[f.label] || ''}
                      onChange={v => setFieldValue(f.label, v)}
                      category={cat}
                      suggestions={suggestions}
                      editing={editingFields.has(f.label)}
                      onToggleEdit={() => toggleEdit(f.label)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={handleInject}
            className="w-full py-2.5 px-4 rounded-lg font-medium bg-emerald-600 hover:bg-emerald-500 text-white text-sm transition-colors mt-1"
          >
            Fill Form Now
          </button>
          <button
            onClick={() => setStatus('idle')}
            className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 mt-1 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Done */}
      {status === 'done' && (
        <div className="text-center py-3">
          <p className="text-green-400 font-medium text-sm">✓ {filledCount} fields filled!</p>
          <p className="text-xs text-slate-500 mt-1">Fields highlighted in purple on the page</p>
          <button
            onClick={() => { setStatus('idle'); setAllFields([]); setFilledFields([]); setEmptyFields([]); setFieldValues({}); setEditingFields(new Set()); }}
            className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 block mx-auto"
          >
            Run Again
          </button>
        </div>
      )}
    </div>
  );
}
