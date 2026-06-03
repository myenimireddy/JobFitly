import React, { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MatchScoreCircle } from './MatchScoreCircle';
import { SkillChip } from './SkillChip';
import { SkeletonLoader } from './SkeletonLoader';
import { ErrorBanner } from './ErrorBanner';
import { AccordionCard } from './AccordionCard';

/**
 * MatchReport component - Section 3: Match analysis results
 */
export function MatchReport() {
  const { profile, job, match, loading, error, runMatch, resetJob, clearError } = useApp();

  const hasProfile = !!profile;
  const hasJob = !!job;
  const hasMatch = !!match;

  // Auto-run match when component becomes visible
  useEffect(() => {
    if (hasProfile && hasJob && !hasMatch && !loading.match) {
      runMatch();
    }
  }, [hasProfile, hasJob, hasMatch, loading.match, runMatch]);

  // If prerequisites not met, show disabled state
  if (!hasProfile || !hasJob) {
    return (
      <section className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 opacity-60">
        <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold">3</span>
          Match Analysis
        </h2>
        <p className="text-slate-400 text-center py-8">
          Complete steps 1 and 2 to see your match analysis
        </p>
      </section>
    );
  }

  const resultData = match?.resultData || {};
  const matchScore = match?.matchScore ?? resultData?.matchScore ?? 0;
  const {
    matchingSkills = [],
    missingSkills = [],
    partialSkills = [],
    recommendations = [],
    blockers = [],
    pros = [],
    scoreReasoning,
    experienceAssessment,
    coverLetterTips = [],
    _analysisMethod,
    _llmStatus = null,
  } = resultData;

  const highBlockers = blockers.filter(b => b.severity === 'high');
  const otherBlockers = blockers.filter(b => b.severity !== 'high');

  // Truncate long skill strings (LLM sometimes returns sentences) to a short label
  const chipLabel = (s) => {
    if (typeof s !== 'string') return String(s);
    // If it's a short phrase already, use as-is
    if (s.length <= 40) return s;
    // Take only the first meaningful segment before a parenthesis, comma, or dash
    const cut = s.split(/[,(–\-]/)[0].trim();
    return cut.length > 3 ? cut : s.slice(0, 38) + '…';
  };

  const blockerColor = {
    high:   'bg-red-900/25 border-red-800/40 text-red-300',
    medium: 'bg-orange-900/20 border-orange-800/30 text-orange-300',
    low:    'bg-yellow-900/15 border-yellow-800/20 text-yellow-300',
  };
  const blockerIcon = { high: '🚫', medium: '⚠', low: '⚡' };

  return (
    <section className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">3</span>
        Match Analysis
      </h2>

      {error.match && (
        <ErrorBanner message={error.match} onDismiss={() => clearError('match')} />
      )}

      {loading.match ? (
        <div className="py-8">
          <SkeletonLoader lines={5} />
          <p className="text-center text-slate-400 mt-4 text-sm">AI is analyzing your fit — this may take 30–60 s…</p>
        </div>
      ) : hasMatch ? (
        <div>
          {/* Score hero */}
          <div className="mb-5">
            <MatchScoreCircle score={matchScore} reasoning={scoreReasoning} />
            <div className="flex justify-center mt-2">
              {_analysisMethod === 'llm'
                ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-700/30">✦ AI analysis</span>
                : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-300 border border-amber-700/30">⚠ Regex — start Ollama for deeper insights</span>
              }
            </div>
          </div>

          {/* Hard blockers — shown prominently */}
          {highBlockers.length > 0 && (
            <div className="mb-4 space-y-2">
              <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide">Hard Blockers</h4>
              {highBlockers.map((b, i) => (
                <div key={i} className={`flex gap-2 items-start px-3 py-2.5 rounded-lg border text-xs ${blockerColor.high}`}>
                  <span className="shrink-0 text-sm">{blockerIcon.high}</span>
                  <div>
                    <span className="font-semibold capitalize">{b.type?.replace(/_/g,' ')}</span>
                    {' — '}{b.message}
                    {b.detail && <p className="mt-0.5 opacity-60 italic">"{b.detail}"</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Experience assessment */}
          {experienceAssessment && experienceAssessment.verdict !== 'unknown' && (
            <div className={`flex gap-2 items-center px-3 py-2 rounded-lg border text-xs mb-4
              ${experienceAssessment.verdict === 'exceeds' || experienceAssessment.verdict === 'meets'
                ? 'bg-green-900/20 border-green-800/30 text-green-300'
                : 'bg-orange-900/20 border-orange-800/30 text-orange-300'}`}>
              <span>{experienceAssessment.verdict === 'exceeds' ? '✓' : experienceAssessment.verdict === 'meets' ? '✓' : '⚡'}</span>
              <span>
                <span className="font-semibold capitalize">Experience: </span>
                {experienceAssessment.candidate != null ? `You have ~${experienceAssessment.candidate} yrs` : 'Experience unknown'}
                {experienceAssessment.required != null ? `, job requires ${experienceAssessment.required}+ yrs` : ''}
                {' — '}<span className="font-medium capitalize">{experienceAssessment.verdict}</span>
              </span>
            </div>
          )}

          {/* Pros */}
          {pros.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {pros.map((p, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-green-900/30 text-green-300 border border-green-700/30">
                  ✓ {p.message}
                </span>
              ))}
            </div>
          )}

          {/* Medium/low blockers */}
          {otherBlockers.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {otherBlockers.map((b, i) => (
                <div key={i} className={`flex gap-2 items-start px-3 py-2 rounded-lg border text-xs ${blockerColor[b.severity] || blockerColor.low}`}>
                  <span className="shrink-0">{blockerIcon[b.severity] || '⚡'}</span>
                  <span><span className="font-semibold capitalize">{b.type?.replace(/_/g,' ')}</span>{' — '}{b.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Skills grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <div className="bg-slate-900/50 rounded-lg p-3">
              <h4 className="text-xs font-medium text-green-400 uppercase tracking-wide mb-2">
                Matched ({matchingSkills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {matchingSkills.length > 0
                  ? matchingSkills.map((s, i) => (
                      <span key={i} title={s}>
                        <SkillChip label={chipLabel(s)} variant="matched" />
                      </span>
                    ))
                  : <span className="text-slate-500 text-xs">None found</span>}
              </div>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3">
              <h4 className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">
                Missing ({missingSkills.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {missingSkills.length > 0
                  ? missingSkills.map((s, i) => (
                      <span key={i} title={s}>
                        <SkillChip label={chipLabel(s)} variant="missing" />
                      </span>
                    ))
                  : <span className="text-slate-500 text-xs">None — great match!</span>}
              </div>
            </div>
          </div>

          {/* Partial skill matches */}
          {partialSkills.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-medium text-amber-400 uppercase tracking-wide mb-2">Partial Matches</h4>
              <div className="space-y-1.5">
                {partialSkills.map((p, i) => (
                  <div key={i} className="flex gap-2 items-start px-3 py-1.5 rounded-lg bg-amber-900/15 border border-amber-800/20 text-xs text-amber-300">
                    <span className="shrink-0">≈</span>
                    <span><span className="font-medium">{p.jobRequires}</span> ← you have <span className="font-medium">{p.candidateHas}</span>{p.note ? ` — ${p.note}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Recommendations</h4>
              <div className="space-y-1.5">
                {recommendations.map((rec, i) => (
                  <div key={i} className="flex gap-2 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/30 text-xs text-slate-300">
                    <span className="shrink-0 text-indigo-400">→</span>
                    <span>{typeof rec === 'string' ? rec : rec.suggestion || rec.gap}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cover letter tips */}
          {coverLetterTips.length > 0 && (
            <div className="mb-5">
              <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Cover Letter Tips</h4>
              <div className="space-y-1.5">
                {coverLetterTips.map((tip, i) => (
                  <div key={i} className="flex gap-2 px-3 py-2 rounded-lg bg-indigo-900/15 border border-indigo-800/20 text-xs text-indigo-300">
                    <span className="shrink-0">✉</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={resetJob}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
          >
            Analyze Another Job
          </button>
        </div>
      ) : null}
    </section>
  );
}
