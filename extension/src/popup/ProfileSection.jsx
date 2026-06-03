import React from 'react';

/**
 * ProfileSection component - handles resume upload and profile display
 * @param {Object} props
 * @param {Object|null} props.profile - Profile data or null
 * @param {boolean} props.loading - Whether upload is in progress
 * @param {Function} props.onUpload - Callback(file) when PDF selected
 * @param {Function} props.onClear - Callback() when clear clicked
 */
export function ProfileSection({ profile, loading, onUpload, onClear }) {
  const skillCount = profile?.parsedData?.skills?.length ?? profile?.skills?.length ?? 0;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onUpload(file);
    }
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="p-4">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        My Profile
      </h2>

      {!profile ? (
        // Upload state
        <div>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            disabled={loading}
            className="hidden"
            id="pdf-upload"
          />
          <label
            htmlFor="pdf-upload"
            className={`
              block w-full py-3 px-4 rounded-lg text-center cursor-pointer
              transition-colors duration-200
              ${loading 
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }
            `}
          >
            <span className="flex items-center justify-center gap-2">
              <span>📄</span>
              <span>{loading ? 'Uploading...' : 'Upload Resume PDF'}</span>
            </span>
          </label>
          <p className="text-xs text-slate-500 text-center mt-2">
            Max 5MB • PDF only
          </p>
        </div>
      ) : (
        // Profile saved state
        <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-100">
                {profile.parsedData?.personalInfo?.fullName || profile.name || 'Candidate'}
              </p>
              <p className={`text-xs ${skillCount > 0 ? 'text-green-400' : 'text-amber-400'}`}>
                {skillCount > 0 ? `${skillCount} skills parsed` : '⚠ No skills found — re-upload'}
              </p>
            </div>
            <button
              onClick={onClear}
              disabled={loading}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
            >
              {skillCount === 0 ? 'Re-upload' : 'Clear'}
            </button>
          </div>
          {skillCount === 0 && (
            <p className="text-xs text-amber-300/80 mt-2 leading-relaxed">
              Skills are required for match scoring. Click Re-upload to parse your resume again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
