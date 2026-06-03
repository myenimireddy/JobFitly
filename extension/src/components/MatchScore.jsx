import React from 'react';

/**
 * MatchScore component - displays large score with color coding
 * @param {Object} props
 * @param {number} props.score - Match score 0-100
 */
export function MatchScore({ score }) {
  const getColorClass = () => {
    if (score < 40) return 'text-red-500';
    if (score < 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="flex flex-col items-center py-4">
      <span className={`text-5xl font-bold ${getColorClass()}`}>
        {score}
      </span>
      <span className="text-xs text-slate-400 mt-1 uppercase tracking-wide">
        Match Score
      </span>
    </div>
  );
}
