"use client";

export function NewPostsIndicator({
  count,
  onRefresh,
  refreshing = false,
}: {
  /** Number of newly detected posts. */
  count: number;
  /** Loads the latest posts when the user activates the indicator. */
  onRefresh: () => void;
  /** Whether a refresh is currently in flight. */
  refreshing?: boolean;
}) {
  const label = count === 1 ? "1 new post" : `${count} new posts`;

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={label}
      aria-live="polite"
      className="inline-flex items-center justify-center gap-2 rounded-full border border-af-brand/60 bg-af-brand/10 px-3 py-1.5 text-xs font-semibold text-af-brand-soft hover:bg-af-brand/20 hover:text-af-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-af-brand focus-visible:ring-offset-2 focus-visible:ring-offset-af-bg disabled:opacity-50 disabled:pointer-events-none transition-colors"
    >
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-af-brand" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
