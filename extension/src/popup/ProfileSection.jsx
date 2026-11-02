import React from 'react';

/**
 * Profile upload / summary for the side panel.
 */
export function ProfileSection({ profile, loading, onUpload, onClear, compact = false }) {
  const skillCount = profile?.parsedData?.skills?.length ?? profile?.skills?.length ?? 0;
  const name = profile?.parsedData?.personalInfo?.fullName || profile?.name || 'Candidate';

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) onUpload(file);
    e.target.value = '';
  };

  if (compact && profile) {
    return (
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-300 truncate" title={name}>
          {name}
          {skillCount > 0 ? (
            <span className="text-slate-500"> · {skillCount} skills</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={onClear}
          disabled={loading}
          className="text-[10px] text-slate-500 hover:text-slate-300 shrink-0 disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 border-b border-slate-800">
      <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Profile
      </h2>

      {!profile ? (
        <div>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={loading}
            className="hidden"
            id="pdf-upload"
            data-testid="resume-upload-input"
          />
          <label
            htmlFor="pdf-upload"
            data-testid="resume-upload-label"
            className={`
              block w-full py-2.5 px-3 rounded-lg text-center cursor-pointer text-sm
              transition-colors duration-200
              ${loading
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'}
            `}
          >
            {loading ? 'Uploading…' : 'Upload resume PDF'}
          </label>
          <p className="text-[10px] text-slate-500 text-center mt-1.5">
            Max 5MB · PDF only
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/80">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-slate-100 text-sm truncate">{name}</p>
              <p className={`text-[11px] ${skillCount > 0 ? 'text-green-400/90' : 'text-amber-400/90'}`}>
                {skillCount > 0 ? `${skillCount} skills parsed` : 'No skills found — re-upload'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClear}
              disabled={loading}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 disabled:opacity-50 shrink-0"
            >
              {skillCount === 0 ? 'Re-upload' : 'Clear'}
            </button>
          </div>
          {skillCount === 0 && (
            <p className="text-[11px] text-amber-300/80 mt-2 leading-relaxed">
              Re-upload so autofill has skills and work history to draft from.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
