import React from 'react';

/**
 * SkillChip component - displays a skill as a colored badge
 * @param {Object} props
 * @param {string} props.label - Skill name to display
 * @param {'matched'|'missing'|'required'|'optional'|'neutral'} props.variant - Color variant
 */
export function SkillChip({ label, variant }) {
  const variantClasses = {
    matched: 'bg-green-900 text-green-300 border-green-700',
    missing: 'bg-red-900 text-red-300 border-red-700',
    required: 'bg-slate-700 text-slate-200',
    optional: 'bg-transparent border border-slate-600 text-slate-400',
    neutral: 'bg-indigo-900 text-indigo-300'
  };

  const hasBorder = variant === 'matched' || variant === 'missing' || variant === 'optional';

  return (
    <span 
      className={`
        inline-block px-3 py-1.5 rounded-full text-sm font-medium
        ${variantClasses[variant]}
        ${hasBorder ? 'border' : ''}
      `}
    >
      {label}
    </span>
  );
}
