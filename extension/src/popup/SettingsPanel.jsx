/**
 * Side Panel Settings overlay.
 * Saves / clears Groq API key via /api/settings/llm so Analyze & Ask AI stay fast;
 * "Use Ollama" sets forceOllama on the backend (local, slower). Full key never returned by API.
 */
import React, { useEffect, useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3000/api';

export function SettingsPanel({ open, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/settings/llm`);
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

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/settings/llm`, {
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
      const res = await fetch(`${API_BASE}/settings/llm`, {
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
            Groq sends sanitized prompts to the cloud. Ollama keeps everything on this machine.
          </p>
        </section>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
