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
