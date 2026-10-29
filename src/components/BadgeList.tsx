"use client";

import { knownBadges } from "@/lib/badges";
import { useUserBadges } from "@/components/UserBadgeProvider";

const categoryClass = {
  staff: "border-af-brand/50 bg-af-brand/15 text-af-brand-soft",
  membership: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  milestone: "border-af-border-strong bg-af-surface-2 text-af-text-2",
} as const;

export function BadgeList({ userId, className = "" }: { userId: string | null | undefined; className?: string }) {
  const ids = useUserBadges(userId);
  const badges = knownBadges(ids ?? []);
  if (!badges.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} aria-label="Account badges">
      {badges.map((badge) => (
        <span
          key={badge.id}
          role="img"
          aria-label={badge.label}
          title={badge.label}
          data-tooltip={badge.label}
          className={`af-badge inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1 text-[10px] font-bold leading-none outline-none focus-visible:ring-2 focus-visible:ring-af-focus ${categoryClass[badge.category]}`}
          tabIndex={0}
        >
          {badge.mark}
        </span>
      ))}
    </span>
  );
}
