/**
 * Side Panel Settings overlay.
 * - Backend API origin (default localhost:3000)
 * - Groq API key via /api/settings/llm; "Use Ollama" sets forceOllama.
 * Full Groq key never returned by API.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  DEFAULT_API_ORIGIN,
  getApiBase,
  getApiOrigin,
  getHealthUrl,
  normalizeApiOrigin,
  setApiOrigin,
} from '../lib/apiConfig';

export function SettingsPanel({ open, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingOrigin, setSavingOrigin] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [originInput, setOriginInput] = useState(DEFAULT_API_ORIGIN);
  const [originStatus, setOriginStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const origin = await getApiOrigin();
      setOriginInput(origin);
      const res = await fetch(`${await getApiBase()}/settings/llm`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Could not load settings');
      setInfo(body.data);
      setKeyInput('');
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const saveOrigin = async () => {
    setSavingOrigin(true);
    setError(null);
    setOriginStatus(null);
    try {
      const normalized = await setApiOrigin(originInput);
      setOriginInput(normalized);
      const health = await fetch(await getHealthUrl(), { signal: AbortSignal.timeout(3000) });
      if (!health.ok) throw new Error('Backend responded but health check failed');
      setOriginStatus(`Saved — using ${normalized}`);
      if (typeof onSaved === 'function') onSaved({ apiOrigin: normalized });
      await load();
    } catch (err) {
      setError(
        err.name === 'TimeoutError' || err.name === 'AbortError'
          ? 'Saved origin, but backend did not respond in time. Check ./scripts/start.sh'
          : err.message || 'Could not reach backend at that URL',
      );
    } finally {
      setSavingOrigin(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${await getApiBase()}/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groqApiKey: keyInput.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Save failed');
      setInfo(body.data);
      setKeyInput('');
      if (typeof onSaved === 'function') onSaved(body.data);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${await getApiBase()}/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groqApiKey: null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) throw new Error(body.error || 'Clear failed');
      setInfo(body.data);
      setKeyInput('');
      if (typeof onSaved === 'function') onSaved(body.data);
    } catch (err) {
      setError(err.message || 'Clear failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const provider = info?.provider || info?.status?.provider;
  const isGroq = provider === 'groq';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm">
      <header className="flex items-center justify-between px-3 py-2.5 border-b border-slate-700 shrink-0">
        <h2 className="text-sm font-semibold text-slate-100">Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <section className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 space-y-2">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Backend URL
          </h3>
          <p className="text-[11px] text-slate-500 leading-snug">
            Default is local JobFitly (<code className="text-slate-400">{DEFAULT_API_ORIGIN}</code>).
            Change only if your API runs elsewhere. Do not point this at a random cloud host with your resume.
          </p>
          <input
            type="url"
            value={originInput}
            onChange={(e) => setOriginInput(e.target.value)}
            placeholder={DEFAULT_API_ORIGIN}
            spellCheck={false}
            className="w-full rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={savingOrigin || !originInput.trim()}
              onClick={saveOrigin}
              className="flex-1 py-1.5 rounded-md text-xs font-medium bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-40"
            >
              {savingOrigin ? 'Checking…' : 'Save & check'}
            </button>
            <button
              type="button"
              disabled={savingOrigin}
              onClick={() => setOriginInput(DEFAULT_API_ORIGIN)}
              className="py-1.5 px-2.5 rounded-md text-xs text-slate-400 border border-slate-600 hover:bg-slate-700/50 disabled:opacity-40"
            >
              Reset
            </button>
          </div>
          {originStatus && <p className="text-[10px] text-green-400">{originStatus}</p>}
          {originInput.trim() && normalizeApiOrigin(originInput) !== originInput.trim().replace(/\/+$/, '') && (
            <p className="text-[10px] text-slate-500">
              Will normalize to <span className="text-slate-300">{normalizeApiOrigin(originInput)}</span>
            </p>
          )}
        </section>

        <section className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            LLM speed
          </h3>
          {loading ? (
            <p className="text-xs text-slate-500">Loading…</p>
          ) : (
            <>
              <p className={`text-sm font-medium ${isGroq ? 'text-green-400' : 'text-amber-300'}`}>
                {isGroq ? 'Groq — fast (cloud)' : 'Ollama — local (slower)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                {info?.message || info?.status?.message || '—'}
              </p>
              {info?.hasGroqKey && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Key on file …{info.groqKeySuffix}
                  {info.groqFromEnv && !info.groqFromSettings ? ' (from .env)' : ''}
                </p>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-3 space-y-2">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Groq API key
          </h3>
          <p className="text-[11px] text-slate-500 leading-snug">
            Free key from{' '}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              console.groq.com/keys
            </a>
            . Without it, Analyze / Ask AI use local Ollama (~30–60s).
          </p>
          <div className="flex gap-1.5">
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="gsk_…"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 rounded-md bg-slate-900 border border-slate-600 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="text-[10px] text-slate-400 hover:text-slate-200 px-1.5 shrink-0"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={saving || !keyInput.trim()}
              onClick={save}
              className="flex-1 py-1.5 rounded-md text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save key'}
            </button>
            <button
              type="button"
              disabled={saving || !isGroq}
              onClick={clearKey}
              className="py-1.5 px-2.5 rounded-md text-xs text-slate-400 border border-slate-600 hover:bg-slate-700/50 disabled:opacity-40"
            >
              Use Ollama
            </button>
          </div>
          <p className="text-[10px] text-slate-600 leading-snug">
            JobFitly does <span className="text-slate-400">not</span> upload your profile to our servers.
            Data stays in your local backend. With Groq: contact PII (name, email, phone, …) is
            replaced with placeholders before Analyze / Ask AI. Resume parse prefers local Ollama
            when available. Ollama keeps prompts on this machine entirely.
          </p>
        </section>

        <section className="rounded-lg border border-slate-700/80 bg-slate-900/40 px-3 py-2.5">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
            Privacy goal
          </h3>
          <p className="text-[11px] text-slate-500 leading-snug">
            We aim to avoid storing or sharing personal data beyond this device. Prefer Ollama if you
            want zero cloud LLM traffic. Never paste API keys into GitHub issues.
          </p>
        </section>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
