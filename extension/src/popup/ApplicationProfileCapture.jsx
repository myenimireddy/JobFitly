import React, { useEffect, useMemo, useState } from 'react';

const API = 'http://localhost:3000/api';

const GROUPS = [
  { id: 'identity', title: 'Identity' },
  { id: 'contact', title: 'Contact & location' },
  { id: 'eligibility', title: 'Work eligibility' },
  { id: 'preferences', title: 'Preferences' },
  { id: 'eeo', title: 'Demographic (optional)', collapsedByDefault: true },
];

const PRONOUN_CHOICES = [
  'He/him',
  'She/her',
  'They/them',
  'Use name only',
  'Xe/xem',
  'Ze/hir',
  'Ey/em',
  'Custom…',
];

/**
 * Side Panel post-upload wizard — same catalog/API as the web ApplicationProfileCapture.
 * Collects shared ATS facts (pronouns, phone, work auth, …) into applicationProfile.
 */
export function ApplicationProfileCapture({ profileId, onSaved, onSkip, compact = true }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [values, setValues] = useState({});
  const [missing, setMissing] = useState([]);
  const [collapsed, setCollapsed] = useState(() => {
    const init = {};
    for (const g of GROUPS) if (g.collapsedByDefault) init[g.id] = true;
    return init;
  });
  const [customPronouns, setCustomPronouns] = useState(false);

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
        const vals = json.data.values || {};
        setCatalog(json.data.catalog || []);
        setValues(vals);
        setMissing(json.data.missing || []);
        const p = String(vals.pronouns || '').trim();
        setCustomPronouns(!!p && !PRONOUN_CHOICES.slice(0, -1).includes(p));
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

  const inputCls = compact
    ? 'mt-0.5 w-full rounded-md bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-100'
    : 'mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100';

  if (loading) {
    return <p className="text-xs text-slate-400 px-3 py-3">Loading application fields…</p>;
  }

  return (
    <div className="mx-3 mb-3 rounded-lg border border-indigo-700/40 bg-indigo-950/25 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-slate-100">Application details</h3>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
            Answer once for Lever / Greenhouse / Ashby / Workday. Open questions stay for Fill Form.
          </p>
        </div>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-[10px] text-slate-500 hover:text-slate-300 shrink-0"
          >
            Later
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-300 mb-2">{error}</p>}

      {missing.length > 0 && (
        <p className="text-[10px] text-amber-300/90 mb-2">
          Still needed: {missing.join(', ')}
        </p>
      )}

      <div className="space-y-3 max-h-[22rem] overflow-y-auto pr-0.5">
        {GROUPS.map((g) => {
          const fields = byGroup[g.id] || [];
          if (!fields.length) return null;
          const isCollapsed = !!collapsed[g.id];
          return (
            <div key={g.id}>
              <button
                type="button"
                className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5"
                onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              >
                <span>{g.title}</span>
                <span className="text-slate-600 normal-case tracking-normal">
                  {isCollapsed ? 'Show' : 'Hide'}
                </span>
              </button>
              {!isCollapsed && (
                <div className="space-y-2">
                  {fields.map((field) => {
                    if (field.type === 'phone') {
                      const phone = values.phone || { country: '', countryCode: '', nationalNumber: '' };
                      return (
                        <div key={field.key} className="space-y-1.5">
                          <p className="text-[10px] text-slate-400">
                            {field.label}
                            {field.help ? (
                              <span className="block text-slate-500 font-normal mt-0.5 leading-snug">{field.help}</span>
                            ) : null}
                          </p>
                          <input
                            className={inputCls}
                            placeholder="Country (United States)"
                            value={phone.country || ''}
                            onChange={(e) => setPhone({ country: e.target.value })}
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <input
                              className={inputCls}
                              placeholder="Dial (+1)"
                              value={phone.countryCode || ''}
                              onChange={(e) => setPhone({ countryCode: e.target.value })}
                            />
                            <input
                              className={inputCls}
                              placeholder="Number"
                              value={phone.nationalNumber || ''}
                              onChange={(e) => setPhone({
                                nationalNumber: e.target.value.replace(/\D/g, '').slice(0, 15),
                              })}
                            />
                          </div>
                        </div>
                      );
                    }

                    if (field.key === 'pronouns') {
                      const current = String(values.pronouns || '');
                      const selectVal = customPronouns
                        ? 'Custom…'
                        : (PRONOUN_CHOICES.includes(current) ? current : (current ? 'Custom…' : ''));
                      return (
                        <label key={field.key} className="block text-[10px] text-slate-400">
                          {field.label}{field.optional ? ' (optional)' : ''}
                          <select
                            className={inputCls}
                            value={selectVal}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === 'Custom…') {
                                setCustomPronouns(true);
                                if (PRONOUN_CHOICES.includes(current)) setField('pronouns', '');
                              } else {
                                setCustomPronouns(false);
                                setField('pronouns', v);
                              }
                            }}
                          >
                            <option value="">Select…</option>
                            {PRONOUN_CHOICES.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          {(customPronouns || selectVal === 'Custom…') && (
                            <input
                              className={`${inputCls} mt-1`}
                              placeholder="Custom pronouns"
                              value={customPronouns ? current : ''}
                              onChange={(e) => setField('pronouns', e.target.value)}
                            />
                          )}
                        </label>
                      );
                    }

                    if (field.type === 'select' && field.options) {
                      return (
                        <label key={field.key} className="block text-[10px] text-slate-400">
                          {field.label}{field.optional ? ' (optional)' : ''}
                          <select
                            className={inputCls}
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
                      <label key={field.key} className="block text-[10px] text-slate-400">
                        {field.label}{field.optional ? ' (optional)' : ''}
                        <input
                          className={inputCls}
                          value={values[field.key] || ''}
                          onChange={(e) => setField(field.key, e.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          data-testid="save-application-profile"
          disabled={saving}
          onClick={save}
          className="px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium"
        >
          {saving ? 'Saving…' : 'Save application profile'}
        </button>
      </div>
    </div>
  );
}
