import React from 'react';

/**
 * AnalyzeSection component - triggers job analysis
 * @param {Object} props
 * @param {Object|null} props.profile - Profile data or null
 * @param {boolean} props.loading - Whether analysis is in progress
 * @param {Function} props.onAnalyze - Callback() when analyze clicked
 */
export function AnalyzeSection({ profile, loading, onAnalyze }) {
  const hasProfile = !!profile;

  return (
    <div className="p-4 border-t border-slate-800">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Analyze This Job
      </h2>

      <button
        onClick={onAnalyze}
        disabled={!hasProfile || loading}
        title={!hasProfile ? 'Upload your resume first' : ''}
        className={`
          w-full py-3 px-4 rounded-lg font-medium
          flex items-center justify-center gap-2
          transition-colors duration-200
          ${!hasProfile
            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
            : loading
              ? 'bg-slate-700 text-slate-400 cursor-wait'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }
        `}
      >
        <span>🔍</span>
        <span>
          {loading ? 'Analyzing...' : 'Analyze This Page'}
        </span>
      </button>

      <p className="text-xs text-slate-500 text-center mt-2">
        {!hasProfile 
          ? 'Upload your resume first' 
          : 'Ready to analyze job postings'
        }
      </p>
    </div>
  );
}
