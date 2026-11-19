import React from 'react';

// A faceless, ski-masked avatar: the symbol of anonymity used for every account.
// Kenya Watch never shows or stores a photo of a person; the colours are derived
// from the account so people can tell their own profile apart, nothing more.
const PALETTES = [
  ['#14b8a6', '#0f766e'],
  ['#6366f1', '#4338ca'],
  ['#f59e0b', '#b45309'],
  ['#ec4899', '#9d174d'],
  ['#3b82f6', '#1d4ed8'],
  ['#8b5cf6', '#6d28d9'],
  ['#ef4444', '#b91c1c'],
  ['#22c55e', '#15803d']
];

function hash(value) {
  let h = 0;
  for (const ch of String(value || 'anonymous')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function AnonymousAvatar({ seed, size = 64, label = 'Anonymous profile picture: a masked, faceless figure', className = '' }) {
  const [light, dark] = PALETTES[hash(seed) % PALETTES.length];
  const id = `kw-av-${hash(seed)}-${size}`;
  return (
    <svg
      className={`kw-avatar ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <clipPath id={`${id}-clip`}><circle cx="50" cy="50" r="50" /></clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill={`url(#${id}-bg)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {/* shoulders */}
        <path d="M6 104c2-22 18-32 44-32s42 10 44 32z" fill="#1f2937" />
        <path d="M38 72l12 12 12-12" fill="none" stroke="#374151" strokeWidth="3" strokeLinejoin="round" />
        {/* knitted head */}
        <ellipse cx="50" cy="42" rx="23" ry="27" fill="#111827" />
        {/* knit texture */}
        <g stroke="#1f2937" strokeWidth="1.2" strokeLinecap="round" opacity="0.9">
          <path d="M33 26c10-5 24-5 34 0" fill="none" />
          <path d="M29 56c14 8 28 8 42 0" fill="none" />
          <path d="M31 63c12 7 26 7 38 0" fill="none" />
          <path d="M40 20v10M50 18v12M60 20v10" />
        </g>
        {/* eye opening of the balaclava */}
        <rect x="31" y="35" width="38" height="13" rx="6.5" fill="#0b1220" />
        <ellipse cx="42" cy="41.5" rx="3.6" ry="2.2" fill="#e5e7eb" opacity="0.9" />
        <ellipse cx="58" cy="41.5" rx="3.6" ry="2.2" fill="#e5e7eb" opacity="0.9" />
        <circle cx="42.8" cy="41.4" r="1.2" fill="#0b1220" />
        <circle cx="58.8" cy="41.4" r="1.2" fill="#0b1220" />
      </g>
    </svg>
  );
}

export default AnonymousAvatar;
