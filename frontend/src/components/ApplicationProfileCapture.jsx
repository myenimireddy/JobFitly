import React, { useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:3000/api';

const GROUPS = [
  { id: 'identity', title: 'Identity' },
  { id: 'contact', title: 'Contact & location' },
  { id: 'eligibility', title: 'Work eligibility' },
  { id: 'preferences', title: 'Preferences' },
  { id: 'eeo', title: 'Demographic (optional)' },
];

/**
 * Post-parse wizard: capture consolidated ATS fields once.
 * Phone is { country, countryCode, nationalNumber }.
 */
export function ApplicationProfileCapture({ profileId, onSaved, onSkip }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [values, setValues] = useState({});
  const [missing, setMissing] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API}/profile/${profileId}/application-capture`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load capture form');
        if (cancelled) return;
        setCatalog(json.data.catalog || []);
        setValues(json.data.values || {});
        setMissing(json.data.missing || []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  const byGroup = useMemo(() => {
    const map = {};
    for (const g of GROUPS) map[g.id] = [];
    for (const field of catalog) {
      if (!map[field.group]) map[field.group] = [];
      map[field.group].push(field);
    }
    return map;
  }, [catalog]);

  const setField = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const setPhone = (patch) => setValues((v) => ({
    ...v,
    phone: { ...(v.phone || { country: '', countryCode: '', nationalNumber: '' }), ...patch },
  }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/profile/${profileId}/application-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationProfile: values }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setMissing(json.data?.capture?.missing || []);
      onSaved?.(json.data.profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-400 py-4">Loading application fields…</p>;
  }

  return (
    <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/20 p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-slate-100 font-semibold">Complete your application profile</h3>
          <p className="text-xs text-slate-400 mt-1">
            Answer these once. Autofill uses them on Greenhouse, Lever, Ashby, and Workday.
            Open questions like “Why this role?” are drafted by AI from your resume at fill time.
          </p>
        </div>
        {onSkip && (
          <button type="button" onClick={onSkip} className="text-xs text-slate-500 hover:text-slate-300 shrink-0">
            Later
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-300 mb-3">{error}</p>
      )}

      {missing.length > 0 && (
        <p className="text-xs text-amber-300/90 mb-3">
          Still needed: {missing.join(', ')}
        </p>
      )}

      <div className="space-y-5 max-h-[28rem] overflow-y-auto pr-1">
        {GROUPS.map((g) => (
          <div key={g.id}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{g.title}</h4>
            <div className="space-y-3">
              {(byGroup[g.id] || []).map((field) => {
                if (field.type === 'phone') {
                  const phone = values.phone || { country: '', countryCode: '', nationalNumber: '' };
                  return (
                    <div key={field.key} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="block text-xs text-slate-400 sm:col-span-3">{field.label}
                        <span className="block font-normal text-slate-500 mt-0.5">{field.help}</span>
                      </label>
                      <input
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                        placeholder="Country (United States)"
                        value={phone.country || ''}
                        onChange={(e) => setPhone({ country: e.target.value })}
                      />
                      <input
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                        placeholder="Dial (+1)"
                        value={phone.countryCode || ''}
                        onChange={(e) => setPhone({ countryCode: e.target.value })}
                      />
                      <input
                        className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                        placeholder="Number (5551234567)"
                        value={phone.nationalNumber || ''}
                        onChange={(e) => setPhone({ nationalNumber: e.target.value.replace(/\D/g, '').slice(0, 15) })}
                      />
                    </div>
                  );
                }

                if (field.type === 'select' && field.options) {
                  return (
                    <label key={field.key} className="block text-xs text-slate-400">
                      {field.label}{field.optional ? ' (optional)' : ''}
                      <select
                        className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                        value={values[field.key] || ''}
                        onChange={(e) => setField(field.key, e.target.value)}
                      >
                        <option value="">Select…</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </label>
                  );
                }

                return (
                  <label key={field.key} className="block text-xs text-slate-400">
                    {field.label}{field.optional ? ' (optional)' : ''}
                    <input
                      className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
                      value={values[field.key] || ''}
                      onChange={(e) => setField(field.key, e.target.value)}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium"
        >
          {saving ? 'Saving…' : 'Save application profile'}
        </button>
      </div>
    </div>
  );
}
