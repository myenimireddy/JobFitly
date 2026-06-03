import React from 'react';

/**
 * ErrorBanner component - inline error display with optional dismiss
 * @param {Object} props
 * @param {string} props.message - Error message to display
 * @param {Function} [props.onDismiss] - Callback when X clicked
 */
export function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-start gap-3">
      <span className="text-red-400 text-lg">⚠️</span>
      <p className="text-red-200 text-sm flex-1">{message}</p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-400 hover:text-red-300 transition-colors"
          aria-label="Dismiss error"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
