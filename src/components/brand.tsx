/**
 * Pravah AI mark: two flowing waves ("pravah" = flow) carrying a gold check mark (verified
 * evidence). On coloured headers use `inverted` (white tile, navy waves).
 */
export function BrandMark({ className = "size-7", inverted = false }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? "#ffffff" : "var(--color-accent)";
  const wave = inverted ? "#0b2a5b" : "#ffffff";
  const check = inverted ? "#c77d0a" : "#f6c164";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill={bg} />
      <path d="M6.5 11.5c3.2-3 6.3-3 9.5 0s6.3 3 9.5 0" fill="none" stroke={wave} strokeWidth="2.3" strokeLinecap="round" />
      <path d="M6.5 17c3.2-3 6.3-3 9.5 0" fill="none" stroke={wave} strokeOpacity="0.7" strokeWidth="2.3" strokeLinecap="round" />
      <path d="M15.5 21.5l3 3 6.5-7" fill="none" stroke={check} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

