import React from 'react';

/**
 * SkillChip component - displays a skill as a colored badge
 * @param {Object} props
 * @param {string} props.label - Skill name to display
 * @param {'matched'|'missing'} props.variant - Color variant
 */
export function SkillChip({ label, variant }) {
  const baseClasses = 'inline-block px-2.5 py-1 rounded-full text-xs font-medium';
  
  const variantClasses = {
    matched: 'bg-green-500/20 text-green-400 border border-green-500/30',
    missing: 'bg-red-500/20 text-red-400 border border-red-500/30'
  };

  return (
    <span className={`${baseClasses} ${variantClasses[variant]}`}>
      {label}
    </span>
  );
}
