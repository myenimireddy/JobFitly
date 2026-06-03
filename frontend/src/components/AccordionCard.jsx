import React, { useState } from 'react';

/**
 * AccordionCard component - expandable recommendation card
 * @param {Object} props
 * @param {string} props.title - Gap/title (shown when collapsed)
 * @param {string} props.content - Suggestion/body (shown when expanded)
 */
export function AccordionCard({ title, content }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!content) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
        <span className="text-cyan-400 mt-0.5">→</span>
        <span className="text-slate-200 text-sm">{title}</span>
      </div>
    );
  }

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800 transition-colors"
      >
        <span className="font-medium text-slate-200">{title}</span>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: isOpen ? '200px' : '0' }}
      >
        <div className="p-4 pt-0 text-slate-300 text-sm leading-relaxed border-t border-slate-700/50">
          {content}
        </div>
      </div>
    </div>
  );
}
