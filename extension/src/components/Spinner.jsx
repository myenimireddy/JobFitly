import React from 'react';

/**
 * Spinner component - loading overlay with spinner
 * @param {Object} props
 * @param {string} props.text - Loading text to display
 * @param {boolean} props.show - Whether to show the spinner
 */
export function Spinner({ text = 'Loading...', show }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/95 flex flex-col items-center justify-center z-50">
      <div className="w-10 h-10 border-3 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
      <span className="text-slate-300 mt-3 text-sm">{text}</span>
    </div>
  );
}
