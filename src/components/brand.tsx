export function BrandMark({ className = "size-7", inverted = false }: { className?: string; inverted?: boolean }) {
  const bg = inverted ? "#ffffff" : "var(--color-accent)";
  const fg = inverted ? "var(--color-accent)" : "#ffffff";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill={bg} />
      <path d="M16 6l8 3v6.2c0 5-3.4 9.3-8 10.8-4.6-1.5-8-5.8-8-10.8V9l8-3z" fill="none" stroke={fg} strokeWidth="2" />
      <path d="M12.5 16l2.5 2.5 4.8-5" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Project illustration: application documents flowing through checks (magnifier = extraction,
 * check marks = validation, shield = verification). Drawn in currentColor so it tints per role.
 */
export function ValidationIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 200" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {/* document stack */}
      <rect x="22" y="48" width="78" height="100" rx="6" opacity="0.35" />
      <rect x="32" y="38" width="78" height="100" rx="6" opacity="0.6" />
      <path d="M42 28h48l20 20v86a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6z" />
      <path d="M90 28v20h20" />
      <path d="M50 64h44M50 76h44M50 88h30" opacity="0.8" />
      <path d="M50 108l8 8 16-16" strokeWidth="3" />
      {/* magnifier over a field */}
      <circle cx="96" cy="84" r="17" />
      <path d="M108 96l14 14" strokeWidth="3" />
      {/* flow to checks */}
      <path d="M134 90h36" strokeDasharray="4 6" />
      <circle cx="186" cy="62" r="12" />
      <path d="M180 62l4 4 8-8" />
      <circle cx="186" cy="100" r="12" />
      <path d="M180 100l4 4 8-8" />
      <circle cx="186" cy="138" r="12" opacity="0.6" />
      <path d="M181 133l10 10M191 133l-10 10" opacity="0.6" />
      <path d="M198 62h28M198 100h28M198 138h28" strokeDasharray="4 6" opacity="0.7" />
      {/* verification shield */}
      <path d="M262 52l36 13v28c0 24-15 40-36 48-21-8-36-24-36-48V65z" />
      <path d="M248 98l10 10 20-20" strokeWidth="3" />
      {/* seal / certificate */}
      <circle cx="322" cy="152" r="16" opacity="0.7" />
      <path d="M314 166l-4 18 12-6 12 6-4-18" opacity="0.7" />
      <path d="M316 152l4 4 8-8" opacity="0.7" />
    </svg>
  );
}
