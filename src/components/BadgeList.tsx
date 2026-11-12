"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { knownBadges, STAFF_BADGE_IDS, badgeImageFor } from "@/lib/badges";
import { useUserBadges } from "@/components/UserBadgeProvider";

const MAX_INLINE_BADGES = 3;
const INLINE_BADGE_SIZE = 20;
const POPOVER_BADGE_SIZE = 40;

function BadgeImage({ src, size, className = "" }: { src: string | null; size: number; className?: string }) {
  if (!src) return null;
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={`block ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

function InlineBadge({ badge, imageSrc }: { badge: { id: string; label: string; category: string; mark: string; description: string }; imageSrc: string | null }) {
  return (
    <span
      role="img"
      aria-label={badge.label}
      title={badge.label}
      className="af-badge inline-flex shrink-0 items-center justify-center"
      style={{ width: INLINE_BADGE_SIZE, height: INLINE_BADGE_SIZE }}
    >
      {imageSrc ? (
        <Image src={imageSrc} alt="" width={INLINE_BADGE_SIZE} height={INLINE_BADGE_SIZE} className="h-full w-full object-contain" />
      ) : (
        <span className="text-[10px] font-bold leading-none text-af-text">{badge.mark}</span>
      )}
    </span>
  );
}

function BadgeTip({ badge, imageSrc, children }: { badge: { id: string; label: string; category: string; mark: string; description: string }; imageSrc: string | null; children: ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      tabIndex={0}
    >
      {children}
      {hovered && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-af-border-strong bg-af-surface-2 p-2.5 text-left shadow-xl"
        >
          <div className="flex items-center gap-2">
            <BadgeImage src={imageSrc} size={24} className="shrink-0" />
            <span className="truncate text-xs font-semibold text-af-text">{badge.label}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-af-text-2">{badge.description}</p>
        </div>
      )}
    </div>
  );
}

export function BadgeList({ userId, className = "", social = false }: { userId: string | null | undefined; className?: string; social?: boolean }) {
  const ids = useUserBadges(userId);
  const allowed = social ? (ids ?? []).filter((id) => (STAFF_BADGE_IDS as readonly string[]).includes(id) || id === "pawpass_member" || id === "pawpass_prime" || id.startsWith("access_")) : (ids ?? []);
  const badges = knownBadges(allowed);
  if (!badges.length) return null;

  const visible = badges.slice(0, MAX_INLINE_BADGES);
  const remaining = badges.slice(MAX_INLINE_BADGES);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="Account badges">
      {visible.map((badge) => {
        const src = badgeImageFor(badge.id);
        return (
          <BadgeTip key={badge.id} badge={badge} imageSrc={src}>
            <InlineBadge badge={badge} imageSrc={src} />
          </BadgeTip>
        );
      })}
      {remaining.length > 0 && (
        <BadgeOverflow badges={remaining} count={remaining.length} />
      )}
    </span>
  );
}

function BadgeOverflow({ badges, count }: { badges: { id: string; label: string; category: string; mark: string; description: string }[]; count: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        aria-label={`${count} more badge${count === 1 ? "" : "s"}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-af-surface-2 px-1 text-[10px] font-semibold leading-none text-af-muted ring-1 ring-af-border hover:text-af-text-2 focus-visible:outline focus-visible:ring-2 focus-visible:ring-af-focus"
      >
        +{count}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-72 max-w-[85vw] rounded-xl border border-af-border-strong bg-af-surface-2 p-3 shadow-2xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-af-muted">All badges</p>
          <div className="grid grid-cols-4 gap-2">
            {badges.map((badge) => {
              const src = badgeImageFor(badge.id);
              return (
                <BadgeTip key={badge.id} badge={badge} imageSrc={src}>
                  <span className="flex items-center justify-center">
                    <BadgeImage src={src} size={POPOVER_BADGE_SIZE} />
                  </span>
                </BadgeTip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}