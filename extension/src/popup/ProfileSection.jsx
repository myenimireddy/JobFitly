import React, { useState } from 'react';

/**
 * Profile upload / summary for the side panel.
 * Clear = local UI only. Delete = permanent backend + local clear (confirm first).
 * One profile for this user. Empty panel can load the newest resume on this machine.
 */
export function ProfileSection({
  profile,
  profileSummaries = [],
  loading,
  onUpload,
  onClear,
  onDelete,
  onLoadLatest,
  onSelectProfile,
  compact = false,
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const skillCount = profile?.parsedData?.skills?.length ?? profile?.skills?.length ?? 0;
  const name = profile?.parsedData?.personalInfo?.fullName || profile?.name || 'Candidate';

  const profileSelector = profileSummaries.length > 1 && onSelectProfile ? (
    <label className="block mt-2 text-[10px] text-slate-500">
      Switch profile
      <select
        data-testid="profile-selector"
        value={profile?.id || ''}
        onChange={(event) => {
          if (event.target.value) onSelectProfile(event.target.value);
        }}
        disabled={loading}
        className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
      >
        {!profile ? <option value="">Choose a saved profile…</option> : null}
        {profileSummaries.map((summary) => (
          <option key={summary.id} value={summary.id}>
            {summary.name}{summary.captureComplete ? ' · ready' : ' · details needed'}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) onUpload(file);
    e.target.value = '';
  };

  const deleteControls = (
    <>
      {confirmDelete ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            disabled={loading}
            className="text-[10px] text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-delete-profile"
            onClick={async () => {
              setConfirmDelete(false);
              await onDelete?.();
            }}
            disabled={loading || !onDelete}
            className="text-[10px] text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
          >
            Yes, delete
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClear}
            disabled={loading}
            className="text-[10px] text-slate-500 hover:text-slate-300 disabled:opacity-50"
            title="Hide profile in this panel only (keeps local DB row)"
          >
            {skillCount === 0 && !compact ? 'Re-upload' : 'Clear'}
          </button>
          {onDelete ? (
            <button
              type="button"
              data-testid="delete-profile"
              onClick={() => setConfirmDelete(true)}
              disabled={loading}
              className="text-[10px] text-red-400/90 hover:text-red-300 disabled:opacity-50"
              title="Permanently delete from local database"
            >
              Delete
            </button>
          ) : null}
        </div>
      )}
    </>
  );

  if (compact && profile) {
    return (
      <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-300 truncate" title={name}>
          {name}
          {skillCount > 0 ? (
            <span className="text-slate-500"> · {skillCount} skills</span>
          ) : null}
        </p>
        {deleteControls}
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
          {profileSummaries.length > 0 && onLoadLatest ? (
            <button
              type="button"
              data-testid="load-latest-profile"
              onClick={onLoadLatest}
              disabled={loading}
              className="mt-2 w-full text-[11px] text-indigo-300 hover:text-indigo-200 underline disabled:opacity-50"
            >
              Load latest on this machine ({profileSummaries.length} saved)
            </button>
          ) : null}
          {profileSelector}
        </div>
      ) : (
        <div className="bg-slate-800/80 rounded-lg p-3 border border-slate-700/80">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-slate-100 text-sm truncate">{name}</p>
              <p className={`text-[11px] ${skillCount > 0 ? 'text-green-400/90' : 'text-amber-400/90'}`}>
                {skillCount > 0 ? `${skillCount} skills parsed` : 'No skills found — re-upload'}
              </p>
              {profile?.id ? (
                <p className="text-[10px] text-slate-500 mt-0.5 font-mono truncate" title={profile.id}>
                  id {profile.id.slice(0, 8)}…
                </p>
              ) : null}
            </div>
            {deleteControls}
          </div>

          {confirmDelete && (
            <p className="text-[10px] text-red-300/90 mt-2 leading-relaxed">
              Permanently removes this resume and match history from the local database.
              Clear only hides it in this panel.
            </p>
          )}
          {skillCount === 0 && !confirmDelete && (
            <p className="text-[11px] text-amber-300/80 mt-2 leading-relaxed">
              Re-upload so autofill has skills and work history to draft from.
            </p>
          )}
          {profileSelector}
        </div>
      )}
    </div>
  );
}
