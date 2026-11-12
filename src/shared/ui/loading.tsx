/** Placeholder shown at once while a page loads, so a tap on a slow connection always shows something happening. */
export function PageLoading({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <span className="skel skel-title" />
      <span className="skel skel-line" />
      <div className="grid g3 mt-8">
        <span className="skel skel-card" /><span className="skel skel-card" /><span className="skel skel-card" />
      </div>
      <div className="stack tight mt-8">
        {Array.from({ length: rows }, (_, i) => <span key={i} className="skel skel-row" />)}
      </div>
    </div>
  );
}
