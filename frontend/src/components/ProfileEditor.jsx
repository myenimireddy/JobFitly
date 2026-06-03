import React, { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';

/**
 * Tag input — comma or Enter to add, × to remove
 */
function TagInput({ values = [], onChange, placeholder }) {
  const [input, setInput] = useState('');

  const commit = useCallback(() => {
    const tag = input.trim();
    if (tag && !values.includes(tag)) onChange([...values, tag]);
    setInput('');
  }, [input, values, onChange]);

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !input && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5 p-2 bg-slate-900 border border-slate-700 rounded-lg min-h-[42px] focus-within:border-indigo-500">
      {values.map((v, i) => (
        <span key={i} className="flex items-center gap-1 bg-slate-700 text-slate-200 text-xs px-2 py-0.5 rounded-full">
          {v}
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-slate-400 hover:text-red-400 leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={commit}
        placeholder={values.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-100 placeholder-slate-500"
      />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
    />
  );
}

function SectionHeader({ title, onAdd, addLabel }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">{title}</h3>
      {onAdd && (
        <button type="button" onClick={onAdd}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          + {addLabel}
        </button>
      )}
    </div>
  );
}

/**
 * ProfileEditor — inline editor for all parsedData categories
 * Shows all fields the parser extracted and allows correction
 */
export function ProfileEditor({ onClose }) {
  const { profile, updateProfile, loading } = useApp();
  const raw = profile?.parsedData || {};

  const [personalInfo, setPersonalInfo] = useState({
    fullName: raw.personalInfo?.fullName || '',
    email: raw.personalInfo?.email || '',
    phone: raw.personalInfo?.phone || '',
    linkedin: raw.personalInfo?.linkedin || '',
    location: raw.personalInfo?.location || '',
    website: raw.personalInfo?.website || '',
  });

  const [skills, setSkills] = useState(raw.skills || []);

  const [workExperience, setWorkExperience] = useState(
    (raw.workExperience || []).map(w => ({ ...w, achievements: w.achievements || [] }))
  );

  const [education, setEducation] = useState(raw.education || []);

  const [certifications, setCertifications] = useState(raw.certifications || []);

  const [saveError, setSaveError] = useState(null);
  const [saved, setSaved] = useState(false);

  // ── Work Experience helpers ────────────────────────────────────────────────

  const addWork = () => setWorkExperience(prev => [...prev, {
    title: '', company: '', startDate: '', endDate: '', achievements: []
  }]);

  const updateWork = (i, field, value) => setWorkExperience(prev =>
    prev.map((w, idx) => idx === i ? { ...w, [field]: value } : w)
  );

  const removeWork = (i) => setWorkExperience(prev => prev.filter((_, idx) => idx !== i));

  // ── Education helpers ──────────────────────────────────────────────────────

  const addEducation = () => setEducation(prev => [...prev, {
    degree: '', school: '', field: '', startDate: '', endDate: ''
  }]);

  const updateEducation = (i, field, value) => setEducation(prev =>
    prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e)
  );

  const removeEducation = (i) => setEducation(prev => prev.filter((_, idx) => idx !== i));

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveError(null);
    setSaved(false);
    const updatedParsedData = {
      ...raw,
      personalInfo,
      skills,
      workExperience,
      education,
      certifications: certifications.length > 0 ? certifications : undefined,
    };
    const result = await updateProfile(updatedParsedData);
    if (result.success) {
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 800);
    } else {
      setSaveError(result.error || 'Save failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl my-8">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Edit Profile</h2>
            <p className="text-xs text-slate-400 mt-0.5">Review and correct what the parser extracted from your resume</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-8">

          {/* ── Personal Info ─────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Personal Info" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name">
                <TextInput value={personalInfo.fullName} onChange={v => setPersonalInfo(p => ({ ...p, fullName: v }))} placeholder="Jane Doe" />
              </Field>
              <Field label="Email">
                <TextInput type="email" value={personalInfo.email} onChange={v => setPersonalInfo(p => ({ ...p, email: v }))} placeholder="jane@example.com" />
              </Field>
              <Field label="Phone">
                <TextInput value={personalInfo.phone} onChange={v => setPersonalInfo(p => ({ ...p, phone: v }))} placeholder="+1 555 000 0000" />
              </Field>
              <Field label="Location">
                <TextInput value={personalInfo.location} onChange={v => setPersonalInfo(p => ({ ...p, location: v }))} placeholder="City, State" />
              </Field>
              <Field label="LinkedIn URL">
                <TextInput value={personalInfo.linkedin} onChange={v => setPersonalInfo(p => ({ ...p, linkedin: v }))} placeholder="linkedin.com/in/..." />
              </Field>
              <Field label="Website / Portfolio">
                <TextInput value={personalInfo.website} onChange={v => setPersonalInfo(p => ({ ...p, website: v }))} placeholder="https://..." />
              </Field>
            </div>
          </section>

          {/* ── Skills ───────────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Skills" />
            <Field label="Add or remove skills (press Enter or comma to add)">
              <TagInput values={skills} onChange={setSkills} placeholder="e.g. React, TypeScript…" />
            </Field>
          </section>

          {/* ── Work Experience ───────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Work Experience" onAdd={addWork} addLabel="Add Role" />
            {workExperience.length === 0 && (
              <p className="text-sm text-slate-500 italic">No experience entries found — add one above.</p>
            )}
            <div className="space-y-5">
              {workExperience.map((w, i) => (
                <div key={i} className="bg-slate-900/60 rounded-xl p-4 border border-slate-700 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-slate-400 font-medium">Role {i + 1}</span>
                    <button type="button" onClick={() => removeWork(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Job Title">
                      <TextInput value={w.title} onChange={v => updateWork(i, 'title', v)} placeholder="Senior Engineer" />
                    </Field>
                    <Field label="Company">
                      <TextInput value={w.company} onChange={v => updateWork(i, 'company', v)} placeholder="Acme Corp" />
                    </Field>
                    <Field label="Start Date">
                      <TextInput value={w.startDate} onChange={v => updateWork(i, 'startDate', v)} placeholder="Jan 2020" />
                    </Field>
                    <Field label="End Date">
                      <TextInput value={w.endDate} onChange={v => updateWork(i, 'endDate', v)} placeholder="Present" />
                    </Field>
                  </div>
                  <Field label="Achievements / Bullets (one per line)">
                    <textarea
                      value={(w.achievements || []).join('\n')}
                      onChange={e => updateWork(i, 'achievements', e.target.value.split('\n'))}
                      rows={3}
                      placeholder="• Led migration to microservices…"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </Field>
                </div>
              ))}
            </div>
          </section>

          {/* ── Education ─────────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Education" onAdd={addEducation} addLabel="Add Entry" />
            {education.length === 0 && (
              <p className="text-sm text-slate-500 italic">No education entries found — add one above.</p>
            )}
            <div className="space-y-4">
              {education.map((e, i) => (
                <div key={i} className="bg-slate-900/60 rounded-xl p-4 border border-slate-700 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-slate-400 font-medium">Entry {i + 1}</span>
                    <button type="button" onClick={() => removeEducation(i)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Degree">
                      <TextInput value={e.degree} onChange={v => updateEducation(i, 'degree', v)} placeholder="B.S. Computer Science" />
                    </Field>
                    <Field label="School">
                      <TextInput value={e.school} onChange={v => updateEducation(i, 'school', v)} placeholder="MIT" />
                    </Field>
                    <Field label="Field of Study">
                      <TextInput value={e.field} onChange={v => updateEducation(i, 'field', v)} placeholder="Computer Science" />
                    </Field>
                    <Field label="Graduation Year">
                      <TextInput value={e.endDate} onChange={v => updateEducation(i, 'endDate', v)} placeholder="2019" />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Certifications ────────────────────────────────────────────── */}
          <section>
            <SectionHeader title="Certifications" />
            <Field label="Add certifications (press Enter to add)">
              <TagInput values={certifications} onChange={setCertifications} placeholder="e.g. AWS Certified Solutions Architect…" />
            </Field>
          </section>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-slate-700 gap-3">
          {saveError && <p className="text-sm text-red-400 flex-1">{saveError}</p>}
          {saved && <p className="text-sm text-green-400 flex-1">✓ Saved!</p>}
          {!saveError && !saved && <span className="flex-1" />}
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading.profile}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading.profile ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
