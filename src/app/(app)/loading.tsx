export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-64 rounded bg-border" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-border/60" />)}</div>
      <div className="h-64 rounded-lg bg-border/50" />
    </div>
  );
}
