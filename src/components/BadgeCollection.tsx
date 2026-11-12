"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { badgeImageFor, knownBadges, type BadgeDefinition } from "@/lib/badges";
import { useUserBadges } from "@/components/UserBadgeProvider";

function BadgeTile({ badge }: { badge: BadgeDefinition }) {
  const src = badgeImageFor(badge.id);
  return (
    <li className="flex items-start gap-3 rounded-xl border border-af-border/80 bg-af-surface/50 p-3">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-af-surface-2">
        {src ? (
          <Image src={src} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
        ) : (
          <span aria-hidden="true" className="text-sm font-bold text-af-brand-soft">{badge.mark}</span>
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-af-text">{badge.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-af-text-2">{badge.description}</p>
      </div>
    </li>
  );
}

/**
 * Shows a user's full badge collection on demand.
 *
 * Only catalogue labels and descriptions are rendered; internal badge IDs are
 * never exposed in the UI.
 */
export function BadgeCollection({ userId, username }: { userId: string; username: string }) {
  const [open, setOpen] = useState(false);
  const ids = useUserBadges(userId);
  const badges = useMemo(() => knownBadges(ids ?? []), [ids]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (badges.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-af-border px-3 text-xs font-semibold text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text"
        aria-label={`View ${username}'s badges`}
      >
        <span aria-hidden="true" className="h-3.5 w-3.5 bg-current" style={{ maskImage: "url(/icons/afterfur/sparkles.svg)", WebkitMaskImage: "url(/icons/afterfur/sparkles.svg)", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskSize: "contain", WebkitMaskSize: "contain" }} />
        {badges.length} {badges.length === 1 ? "badge" : "badges"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="badge-collection-title"
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-af-border bg-af-surface p-4 shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="badge-collection-title" className="text-base font-semibold text-af-text">Badges</h2>
                <p className="mt-0.5 text-xs text-af-muted">{`${username}'s collection`}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close badges"
                className="flex h-9 w-9 items-center justify-center rounded-full text-af-muted transition-colors hover:bg-af-surface-2 hover:text-af-text"
              >
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {badges.map((badge) => <BadgeTile key={badge.id} badge={badge} />)}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

export default BadgeCollection;