import React from 'react';

/**
 * ErrorBanner component - inline error display
 * @param {Object} props
 * @param {string} props.message - Error message to display
 */
export function ErrorBanner({ message }) {
  if (!message) return null;

  // Map common errors to user-friendly messages
  const getDisplayMessage = (msg) => {
    if (msg.includes('Backend') || msg.includes('Failed to fetch')) {
      return 'Backend not running — run: npm run dev';
    }
    if (msg.includes('Not a job') || msg.includes('job posting')) {
      return 'Navigate to a job posting first';
    }
    return msg;
  };

  return (
    <div className="bg-red-500 text-white px-4 py-3 text-sm text-center">
      {getDisplayMessage(message)}
    </div>
  );
}
