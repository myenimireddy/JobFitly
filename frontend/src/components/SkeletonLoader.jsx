import React from 'react';

/**
 * SkeletonLoader component - animated pulse placeholder
 * @param {Object} props
 * @param {number} props.lines - Number of skeleton lines (default: 3)
 * @param {string} props.height - Height class for each line (default: "h-4")
 */
export function SkeletonLoader({ lines = 3, height = "h-4" }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`${height} bg-slate-700 rounded`}
          style={{
            width: i === lines - 1 ? '75%' : '100%'
          }}
        />
      ))}
    </div>
  );
}
