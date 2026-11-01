"use client";

import { knownBadges, STAFF_BADGE_IDS } from "@/lib/badges";
import { useUserBadges } from "@/components/UserBadgeProvider";

const categoryClass = {
  staff: "border-af-brand/50 bg-af-brand/15 text-af-brand-soft",
  membership: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  milestone: "border-af-border-strong bg-af-surface-2 text-af-text-2",
  trust: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  creator: "border-purple-400/40 bg-purple-400/10 text-purple-300",
  achievement: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  community: "border-rose-400/40 bg-rose-400/10 text-rose-300",
} as const;

export function BadgeList({ userId, className = "", social = false }: { userId: string | null | undefined; className?: string; social?: boolean }) {
  const ids = useUserBadges(userId);
  const allowed = social ? (ids ?? []).filter((id) => (STAFF_BADGE_IDS as readonly string[]).includes(id) || id === "pawpass_member" || id === "pawpass_prime" || id.startsWith("access_")) : (ids ?? []);
  const badges = knownBadges(allowed);
  if (!badges.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Account badges">
      {badges.map((badge) => (
        <span
          key={badge.id}
          role="img"
          aria-label={badge.label}
          title={badge.label}
          data-tooltip={badge.label}
          className={`af-badge inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-1.5 text-[11px] font-bold leading-none outline-none focus-visible:ring-2 focus-visible:ring-af-focus ${categoryClass[badge.category]}`}
          tabIndex={0}
        >
          {badge.mark}
        </span>
      ))}
    </span>
  );
}
