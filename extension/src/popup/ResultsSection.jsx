import React from 'react';
import { MatchScore } from '../components/MatchScore';
import { SkillChip } from '../components/SkillChip';

/**
 * ResultsSection component - displays match analysis results
 * @param {Object} props
 * @param {Object} props.match - Match data with resultData
 */
export function ResultsSection({ match }) {
  if (!match) return null;

  const resultData = match.resultData || {};
  const matchScore = match.matchScore ?? resultData.matchScore ?? 0;
  const {
    matchingSkills = [],
    missingSkills = [],
    recommendations = [],
    blockers = [],
    pros = [],
  } = resultData;

  // Get top 3 recommendations
  const topRecommendations = recommendations.slice(0, 3);

  return (
    <div className="p-4 border-t border-slate-800 animate-fade-in">
      <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        Match Results
      </h2>

      {/* Match Score */}
      <div className="bg-slate-800 rounded-lg p-4 mb-4">
        <MatchScore score={matchScore} />
      </div>

      {/* Blocker / Pro signals */}
      {(blockers.length > 0 || pros.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-3">
          {blockers.map((b, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-900/60 text-red-300">⚠ {b.message}</span>
          ))}
          {pros.map((p, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-green-900/60 text-green-300">✓ {p.message}</span>
          ))}
        </div>
      )}

      {/* Matched Skills */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-300 mb-2">
          Matched Skills
        </h3>
        <div className="flex flex-wrap gap-2">
          {matchingSkills.length > 0 ? (
            matchingSkills.map((skill, i) => (
              <SkillChip key={i} label={skill} variant="matched" />
            ))
          ) : (
            <span className="text-xs text-slate-500">No matching skills found</span>
          )}
        </div>
      </div>

      {/* Missing Skills */}
      <div className="mb-4">
        <h3 className="text-sm font-medium text-slate-300 mb-2">
          Missing Skills
        </h3>
        <div className="flex flex-wrap gap-2">
          {missingSkills.length > 0 ? (
            missingSkills.map((skill, i) => (
              <SkillChip key={i} label={skill} variant="missing" />
            ))
          ) : (
            <span className="text-xs text-slate-500">No missing skills</span>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {topRecommendations.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">
            Top Recommendations
          </h3>
          <ol className="list-decimal list-inside space-y-2">
            {topRecommendations.map((rec, i) => (
              <li key={i} className="text-sm text-slate-300 leading-relaxed">
                {typeof rec === 'string' ? rec : <><strong className="text-slate-200">{rec.gap}</strong>{' — '}{rec.suggestion}</>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
