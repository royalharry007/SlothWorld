// The SlothWorld mark: a sloth face peeking over a floating island.
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="SlothWorld logo">
      <defs>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b86b5" />
          <stop offset="1" stopColor="#f3d3b0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="url(#lg-sky)" />
      <path d="M8 44 Q32 36 56 44 L48 50 Q32 62 16 50 Z" fill="#7d5a44" />
      <path d="M8 44 Q32 36 56 44 Q32 49 8 44Z" fill="#9fcf73" />
      <ellipse cx="32" cy="30" rx="15" ry="14" fill="#8c6b4f" />
      <ellipse cx="32" cy="32" rx="12" ry="10" fill="#efdcbc" />
      <ellipse cx="26.5" cy="31" rx="4.6" ry="2.6" fill="#4a3427" transform="rotate(18 26.5 31)" />
      <ellipse cx="37.5" cy="31" rx="4.6" ry="2.6" fill="#4a3427" transform="rotate(-18 37.5 31)" />
      <circle cx="26.8" cy="31" r="1.3" fill="#111" />
      <circle cx="37.2" cy="31" r="1.3" fill="#111" />
      <ellipse cx="32" cy="35" rx="2" ry="1.3" fill="#3a2a20" />
      <path d="M29.5 37.5 Q32 39.5 34.5 37.5" stroke="#3a2a20" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <path d="M34 16 Q41 12 45 17 Q39 20 34 16Z" fill="#6dbb5a" />
    </svg>
  );
}
