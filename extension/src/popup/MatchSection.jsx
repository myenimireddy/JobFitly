/**
 * Extract job text from the active tab and score fit via /api/job + /api/match.
 * Speed depends on effective LLM (Groq key in Settings → fast; else Ollama).
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  ensureContentScript,
  getActiveTabId,
  sendMessageSafe,
} from '../lib/contentBridge';
import { getApiBase } from '../lib/apiConfig';

function scoreTone(score) {
  if (score >= 75) return 'text-green-400 border-green-700/50 bg-green-950/30';
  if (score >= 50) return 'text-amber-300 border-amber-700/40 bg-amber-950/20';
  return 'text-red-300 border-red-800/40 bg-red-950/20';
}

function applyAdvice(score, blockers = []) {
  const high = blockers.filter((b) => (b.severity || '').toLowerCase() === 'high');
  if (high.length) return 'Likely skip unless you can clear the blockers below.';
  if (score >= 75) return 'Strong fit — worth applying.';
  if (score >= 50) return 'Partial fit — apply if you can cover the gaps.';
  return 'Weak fit — only apply if you have a strong referral or story.';
}

/** LLM sometimes returns strings, {name}, or {skill}. */
function skillLabel(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'object') {
    return String(
      item.name || item.skill || item.label || item.jobRequires || item.missing || '',
    ).trim();
  }
  return String(item).trim();
}

function normalizeSkills(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const label = skillLabel(item);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

function normalizePartials(list) {
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    if (typeof p === 'string') return p;
    const need = p?.jobRequires || p?.required || p?.name;
    const have = p?.candidateHas || p?.has;
    if (need && have) return `${need} (have: ${have})`;
    return skillLabel(p);
  }).filter(Boolean);
}

/**
 * Separate from Fill Form: scrape the open job tab → score vs profile → apply/skip cue.
 */
export function MatchSection({ profile, disabled = false }) {
  const [status, setStatus] = useState('idle'); // idle | working | done | error
  const [errorMsg, setErrorMsg] = useState(null);
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [score, setScore] = useState(null);
  const [matched, setMatched] = useState([]);
  const [missing, setMissing] = useState([]);
  const [partial, setPartial] = useState([]);
  const [blockers, setBlockers] = useState([]);
  const [reasoning, setReasoning] = useState('');
  /** Bumped on Cancel so in-flight analyze ignores late results. */
  const runIdRef = useRef(0);
  const abortRef = useRef(null);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus('idle');
    setErrorMsg(null);
    setJobTitle('');
    setCompany('');
    setScore(null);
    setMatched([]);
    setMissing([]);
    setPartial([]);
    setBlockers([]);
    setReasoning('');
  }, []);

  const analyze = useCallback(async () => {
    if (!profile?.id || disabled) return;
    const runId = ++runIdRef.current;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('working');
    setErrorMsg(null);
    setScore(null);

    const stillActive = () => runId === runIdRef.current && !controller.signal.aborted;

    try {
      const tabId = await getActiveTabId();
      if (!stillActive()) return;
      if (!tabId) throw new Error('No active tab — open a job posting first');

      await ensureContentScript(tabId);
      if (!stillActive()) return;
      const page = await sendMessageSafe(tabId, { action: 'getJobPageText' }, 30000);
      if (!stillActive()) return;
      if (!page?.success || !page.text) {
        throw new Error(page?.error || 'Could not read job text on this page');
      }
      if (page.text.length < 120) {
        throw new Error('Page text looks too short — open the full job description');
      }

      const API_BASE = await getApiBase();
      const extractRes = await fetch(`${API_BASE}/job/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: page.url || 'active-tab', html: page.text }),
        signal: controller.signal,
      });
      if (!stillActive()) return;
      const extractBody = await extractRes.json().catch(() => ({}));
      if (!extractRes.ok || !extractBody?.success) {
        throw new Error(extractBody.error || 'Job extract failed');
      }

      const job = extractBody.data;
      const parsed = typeof job.parsedData === 'string' ? JSON.parse(job.parsedData) : (job.parsedData || {});
      setJobTitle(parsed.title || page.title || 'This job');
      setCompany(parsed.company || '');

      const matchRes = await fetch(`${API_BASE}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.id, jobId: job.id }),
        signal: controller.signal,
      });
      if (!stillActive()) return;
      const matchBody = await matchRes.json().catch(() => ({}));
      if (!matchRes.ok || !matchBody?.success) {
        throw new Error(matchBody.error || 'Match analysis failed');
      }

      const match = matchBody.data;
      const result = typeof match.resultData === 'string'
        ? JSON.parse(match.resultData)
        : (match.resultData || {});
      const matchScore = match.matchScore ?? result.matchScore ?? 0;

      if (!stillActive()) return;
      setScore(Number(matchScore) || 0);
      const matchedSkills = normalizeSkills(
        result.matchingSkills || result.matchedSkills,
      ).slice(0, 10);
      let gapSkills = normalizeSkills(
        result.missingSkills || result.missing,
      ).slice(0, 10);
      // LLM often puts visa/education in blockers and leaves missingSkills empty —
      // fall back to recommendations / job required skills not in matched.
      if (gapSkills.length === 0) {
        const fromRecs = normalizeSkills(result.recommendations)
          .map((r) => {
            const m = r.match(/experience with\s+(.+?)(?:\s+through|$)/i);
            return m ? m[1] : '';
          })
          .filter(Boolean);
        const required = normalizeSkills([
          ...(parsed.requiredSkills || []),
          ...(parsed.preferredSkills || []),
        ]);
        const matchedSet = new Set(matchedSkills.map((s) => s.toLowerCase()));
        const fromJob = required.filter((s) => !matchedSet.has(s.toLowerCase()));
        gapSkills = normalizeSkills([...fromRecs, ...fromJob]).slice(0, 10);
      }
      setMatched(matchedSkills);
      setMissing(gapSkills);
      setPartial(normalizePartials(result.partialSkills || result.partialMatches).slice(0, 6));
      setBlockers((result.blockers || []).slice(0, 5));
      setReasoning(String(result.scoreReasoning || '').slice(0, 280));
      setStatus('done');
    } catch (err) {
      if (!stillActive() || err?.name === 'AbortError') return;
      setErrorMsg(err.message || 'Analyze failed');
      setStatus('error');
    }
  }, [profile, disabled]);

  if (!profile) return null;

  return (
    <div className={`px-3 pb-2 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Job fit
      </h2>

      {(status === 'idle' || status === 'error') && (
        <>
          <button
            type="button"
            onClick={analyze}
            className="w-full py-2 px-3 rounded-lg font-medium text-sm bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Analyze this job
          </button>
          <p className="mt-1.5 text-[11px] text-slate-500 leading-snug">
            Scores the open tab against your resume — decide apply vs skip before Fill Form.
          </p>
          {errorMsg && <p className="text-xs text-red-400 mt-2">{errorMsg}</p>}
        </>
      )}

      {status === 'working' && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-3 text-center">
          <p className="text-xs text-slate-200">Reading page & matching…</p>
          <p className="text-[10px] text-slate-500 mt-1">Usually 10–60s if the LLM is warm</p>
          <button type="button" onClick={reset} className="text-xs text-slate-500 mt-3 hover:text-slate-300">
            Cancel
          </button>
        </div>
      )}

      {status === 'done' && score != null && (
        <div className={`rounded-lg border px-3 py-3 ${scoreTone(score)}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" title={jobTitle}>{jobTitle}</p>
              {company ? <p className="text-[11px] opacity-80 truncate">{company}</p> : null}
            </div>
            <div className="text-2xl font-bold tabular-nums shrink-0">{Math.round(score)}</div>
          </div>
          <p className="text-[11px] mt-2 leading-snug opacity-95">
            {applyAdvice(score, blockers)}
          </p>
          {reasoning ? (
            <p className="text-[10px] mt-1.5 text-slate-400 leading-snug line-clamp-3">{reasoning}</p>
          ) : null}

          {blockers.length > 0 && (
            <ul className="mt-2 space-y-1">
              {blockers.map((b, i) => (
                <li key={i} className="text-[10px] text-red-300/90 leading-snug">
                  · {typeof b === 'string' ? b : (b.message || b.label || JSON.stringify(b))}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[10px] text-slate-400 mt-2 leading-snug">
            <span className="text-green-400/90">Matched:</span>{' '}
            {matched.length ? matched.join(', ') : 'None listed'}
          </p>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">
            <span className="text-amber-300/90">Gaps:</span>{' '}
            {missing.length ? missing.join(', ') : 'None listed (see blockers)'}
          </p>
          {partial.length > 0 && (
            <p className="text-[10px] text-slate-400 mt-1 leading-snug">
              <span className="text-sky-300/90">Partial:</span>{' '}
              {partial.join('; ')}
            </p>
          )}

          <div className="flex gap-3 justify-center mt-3">
            <button type="button" onClick={analyze} className="text-xs text-indigo-400 hover:text-indigo-300">
              Re-analyze
            </button>
            <button type="button" onClick={reset} className="text-xs text-slate-500 hover:text-slate-300">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
