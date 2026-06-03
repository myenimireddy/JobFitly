import React, { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { SkillChip } from './SkillChip';
import { SkeletonLoader } from './SkeletonLoader';
import { ErrorBanner } from './ErrorBanner';

/**
 * JobAnalyzer component - Section 2: Job extraction via URL or text
 */
export function JobAnalyzer() {
  const { profile, job, loading, error, extractJob, resetJob, clearError } = useApp();
  const [activeTab, setActiveTab] = useState('url');
  const [url, setUrl] = useState('');
  const [rawText, setRawText] = useState('');

  const hasProfile = !!profile;
  const hasJob = !!job;

  const parsedData = job?.parsedData || {};
  const {
    title,
    company,
    location,
    locationType,
    employmentType,
    salary,
    yearsOfExperience,
    requiredSkills = [],
    preferredSkills = [],
    sponsorship,
    clearanceRequired,
    clearanceLevel,
    _parseMethod,
  } = parsedData;

  const salaryStr = salary?.min
    ? `${salary.currency || '$'}${(salary.min/1000).toFixed(0)}k${salary.max ? `–${(salary.max/1000).toFixed(0)}k` : '+'} / ${salary.period || 'yr'}`
    : null;
  const expStr = yearsOfExperience?.min != null
    ? `${yearsOfExperience.min}${yearsOfExperience.max ? `–${yearsOfExperience.max}` : '+'} yrs`
    : null;

  const handleAnalyze = useCallback(async () => {
    if (activeTab === 'url') {
      // URL tab: text is required, url is the label
      await extractJob({ url: url || 'pasted-text', rawText: rawText });
    } else {
      await extractJob({ url: 'pasted-text', rawText });
    }
  }, [activeTab, url, rawText, extractJob]);

  const handleReset = useCallback(() => {
    resetJob();
    setUrl('');
    setRawText('');
  }, [resetJob]);

  // If no profile, show disabled state
  if (!hasProfile) {
    return (
      <section className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 opacity-60">
        <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold">2</span>
          Job Details
        </h2>
        <p className="text-slate-400 text-center py-8">
          Upload your resume first to analyze job postings
        </p>
      </section>
    );
  }

  return (
    <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">2</span>
        Job Details
      </h2>

      {error.job && (
        <ErrorBanner 
          message={error.job} 
          onDismiss={() => clearError('job')} 
        />
      )}

      {!hasJob ? (
        // Input state
        <div>
          {loading.job ? (
            <SkeletonLoader lines={4} />
          ) : (
            <>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Job URL (optional — for reference)"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-3"
              />
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Paste job description text here..."
                rows={6}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4 resize-none"
              />
              <button
                onClick={handleAnalyze}
                disabled={loading.job || !rawText.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                {loading.job ? 'Analyzing...' : 'Analyze Job'}
              </button>
              <p className="text-xs text-slate-500 text-center mt-2">Paste the full job description text to analyze</p>
            </>
          )}
        </div>
      ) : (
        // Job display state
        <div>
          {loading.job ? (
            <SkeletonLoader lines={4} />
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 mr-3">
                  <h3 className="text-xl font-bold text-slate-100 truncate">{title || 'Job Title'}</h3>
                  <p className="text-sm text-slate-400 truncate">
                    {company || 'Company'}
                    {location && ` • ${location}`}
                  </p>
                </div>
                <button
                  onClick={handleReset}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-slate-600/40 transition-colors"
                >
                  ↩ New Job
                </button>
              </div>

              {/* Meta chips row */}
              <div className="flex flex-wrap gap-2 mb-4">
                {_parseMethod === 'llm' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-700/30">✦ AI-parsed</span>
                )}
                {locationType && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/30 capitalize">{locationType}</span>
                )}
                {employmentType && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/30 capitalize">{employmentType}</span>
                )}
                {expStr && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300 border border-slate-600/30">🕐 {expStr} exp</span>
                )}
                {salaryStr && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-900/40 text-green-300 border border-green-700/30">💰 {salaryStr}</span>
                )}
              </div>

              {/* Sponsorship / Clearance flags */}
              {(sponsorship?.offered === false || clearanceRequired) && (
                <div className="flex flex-col gap-1.5 mb-4">
                  {sponsorship?.offered === false && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/30 text-xs text-red-300">
                      <span className="shrink-0 font-bold">⚠</span>
                      <span><span className="font-semibold">No visa sponsorship</span>{sponsorship.note ? ` — "${sponsorship.note}"` : ''}</span>
                    </div>
                  )}
                  {sponsorship?.offered === true && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-900/20 border border-green-800/30 text-xs text-green-300">
                      <span className="shrink-0">✓</span>
                      <span><span className="font-semibold">Visa sponsorship offered</span>{sponsorship.note ? ` — "${sponsorship.note}"` : ''}</span>
                    </div>
                  )}
                  {clearanceRequired && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-orange-900/20 border border-orange-800/30 text-xs text-orange-300">
                      <span className="shrink-0 font-bold">🔐</span>
                      <span><span className="font-semibold">Security clearance required</span>{clearanceLevel ? ` — ${clearanceLevel}` : ''}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Required Skills */}
              {requiredSkills.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Required Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {requiredSkills.map((skill, i) => (
                      <SkillChip key={i} label={skill} variant="required" />
                    ))}
                  </div>
                </div>
              )}

              {/* Preferred Skills */}
              {preferredSkills.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Preferred / Nice-to-have</h4>
                  <div className="flex flex-wrap gap-2">
                    {preferredSkills.map((skill, i) => (
                      <SkillChip key={i} label={skill} variant="optional" />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
