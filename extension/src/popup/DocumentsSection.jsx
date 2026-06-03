import React, { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3000/api';

/**
 * Copy text to clipboard with a brief visual confirmation
 */
function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
        copied
          ? 'bg-green-800/60 text-green-300 border border-green-700/40'
          : 'bg-slate-700/60 text-slate-400 hover:text-slate-200 border border-slate-600/40'
      }`}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

/**
 * DocumentsSection — generates tailored resume bullets + cover letter
 * Shown in the extension popup after a match is available.
 */
export function DocumentsSection({ profile, job }) {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [activeTab, setActiveTab] = useState('resume'); // resume | cover
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleGenerate = useCallback(async (type) => {
    if (!profile || !job) return;
    setStatus('loading');
    setErrorMsg(null);
    try {
      const response = await fetch(`${API_BASE}/documents/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.id, jobId: job.id, type }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Generation failed');
      setResult(data.data);
      setActiveTab(type === 'cover_letter' ? 'cover' : 'resume');
      setStatus('done');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to generate documents');
      setStatus('error');
    }
  }, [profile, job]);

  if (!profile || !job) return null;

  const bullets = result?.resume?.tailoredBullets || [];
  const keywords = result?.resume?.keywordsToAdd || [];
  const summary = result?.resume?.summaryStatement;
  const coverLetter = result?.coverLetter?.coverLetter;
  const coverHighlights = result?.coverLetter?.highlights || [];

  return (
    <div className="p-4 border-t border-slate-800">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Tailored Documents
      </h2>

      {/* Idle / trigger buttons */}
      {(status === 'idle' || status === 'error') && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => handleGenerate('both')}
              className="flex-1 py-2.5 px-3 rounded-lg font-medium bg-violet-600 hover:bg-violet-500 text-white text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>✦</span> Both
            </button>
            <button
              onClick={() => handleGenerate('resume')}
              className="flex-1 py-2.5 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              📄 Resume
            </button>
            <button
              onClick={() => handleGenerate('cover_letter')}
              className="flex-1 py-2.5 px-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              ✉ Cover
            </button>
          </div>
          <p className="text-[11px] text-slate-500 text-center mt-2">
            AI writes tailored content for <span className="text-slate-400">{job.parsedData?.title || 'this role'}</span>
          </p>
          {errorMsg && (
            <p className="text-xs text-red-400 text-center mt-2">{errorMsg}</p>
          )}
        </>
      )}

      {/* Loading */}
      {status === 'loading' && (
        <div className="text-center py-5">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-violet-400 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400">AI is writing your tailored documents…</p>
          <p className="text-[11px] text-slate-600 mt-1">This may take 30–60 seconds</p>
        </div>
      )}

      {/* Results */}
      {status === 'done' && result && (
        <div>
          {/* Tabs */}
          {(result.resume && result.coverLetter) && (
            <div className="flex gap-1 mb-3 bg-slate-800/60 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('resume')}
                className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  activeTab === 'resume'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                📄 Resume
              </button>
              <button
                onClick={() => setActiveTab('cover')}
                className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  activeTab === 'cover'
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                ✉ Cover Letter
              </button>
            </div>
          )}

          {/* Resume tab */}
          {activeTab === 'resume' && result.resume && (
            <div className="space-y-3">
              {result.resume.error ? (
                <p className="text-xs text-amber-400 text-center py-3">{result.resume.error}</p>
              ) : (
                <>
                  {/* Summary */}
                  {summary && (
                    <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Professional Summary</span>
                        <CopyButton text={summary} />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{summary}</p>
                    </div>
                  )}

                  {/* Bullets */}
                  {bullets.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">Tailored Bullets</span>
                        <CopyButton text={bullets.map(b => `• ${b.tailored}`).join('\n')} label="Copy all" />
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                        {bullets.map((b, i) => (
                          <div key={i} className="bg-slate-800/60 rounded-lg p-2.5 border border-slate-700/30">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/40 text-indigo-300 border border-indigo-800/30 shrink-0">
                                {b.section}
                              </span>
                              <CopyButton text={b.tailored} />
                            </div>
                            <p className="text-xs text-slate-200 leading-relaxed">• {b.tailored}</p>
                            {b.reason && (
                              <p className="text-[10px] text-slate-500 mt-1 italic">{b.reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ATS keywords */}
                  {keywords.length > 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide block mb-1.5">Add These Keywords</span>
                      <div className="flex flex-wrap gap-1">
                        {keywords.map((kw, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/30">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Cover letter tab */}
          {activeTab === 'cover' && result.coverLetter && (
            <div className="space-y-2">
              {result.coverLetter.error ? (
                <p className="text-xs text-amber-400 text-center py-3">{result.coverLetter.error}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-slate-500">
                      {result.coverLetter.toneUsed && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-700/60 border border-slate-600/40 capitalize">
                          {result.coverLetter.toneUsed}
                        </span>
                      )}
                    </span>
                    <CopyButton text={coverLetter} label="Copy letter" />
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40 max-h-56 overflow-y-auto">
                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">{coverLetter}</p>
                  </div>
                  {coverHighlights.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {coverHighlights.map((h, i) => (
                        <div key={i} className="flex gap-1.5 text-[11px] text-slate-400">
                          <span className="text-green-500 shrink-0">✓</span>
                          <span>{h}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Regenerate */}
          <button
            onClick={() => { setStatus('idle'); setResult(null); }}
            className="w-full text-xs text-slate-500 hover:text-slate-300 mt-3 py-1 transition-colors"
          >
            ↺ Regenerate
          </button>
        </div>
      )}
    </div>
  );
}
