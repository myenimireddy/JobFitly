import React, { useEffect, useState } from 'react';

const VERDICTS = [
  { max: 30,  label: 'Poor Fit',    bg: 'bg-red-900/30',    border: 'border-red-700/40',    text: 'text-red-300'    },
  { max: 50,  label: 'Weak Fit',    bg: 'bg-orange-900/25', border: 'border-orange-700/30', text: 'text-orange-300' },
  { max: 70,  label: 'Decent Fit',  bg: 'bg-yellow-900/25', border: 'border-yellow-700/30', text: 'text-yellow-300' },
  { max: 85,  label: 'Good Fit',    bg: 'bg-green-900/25',  border: 'border-green-700/30',  text: 'text-green-300'  },
  { max: 101, label: 'Strong Fit',  bg: 'bg-emerald-900/30',border: 'border-emerald-700/40',text: 'text-emerald-300'},
];

function getVerdict(score) {
  return VERDICTS.find(v => score < v.max) || VERDICTS[VERDICTS.length - 1];
}

function getArcColor(score) {
  if (score < 40) return '#ef4444';
  if (score < 70) return '#eab308';
  if (score < 85) return '#22c55e';
  return '#10b981';
}

/**
 * MatchScoreCircle — hero score display with animated arc, verdict pill, and reasoning
 */
export function MatchScoreCircle({ score, reasoning }) {
  const [animated, setAnimated] = useState(0);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;
  const color = getArcColor(score);
  const verdict = getVerdict(score);

  useEffect(() => {
    setAnimated(0);
    let raf;
    const start = performance.now();
    const duration = 900;
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(Math.round(eased * score));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="w-full flex flex-col items-center gap-3 py-2">
      {/* Arc + number */}
      <div className="relative">
        <svg width="130" height="130" className="-rotate-90">
          <circle cx="65" cy="65" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle
            cx="65" cy="65" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.05s linear', filter: `drop-shadow(0 0 6px ${color}60)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold leading-none" style={{ color }}>{animated}</span>
          <span className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Verdict pill */}
      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${verdict.bg} ${verdict.border} ${verdict.text}`}>
        {verdict.label}
      </span>

      {/* Reasoning */}
      {reasoning && (
        <p className="text-sm text-slate-400 text-center max-w-sm leading-relaxed px-2">{reasoning}</p>
      )}
    </div>
  );
}
