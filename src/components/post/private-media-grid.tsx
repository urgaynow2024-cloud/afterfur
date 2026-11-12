/**
 * PrivateMediaGrid renders a grid of media attachments, resolving private
 * storage paths through the authorized `/api/media/signed-url` route before
 * rendering.
 *
 * Public URLs (legacy public bucket, avatars, banners) are passed straight
 * through, preserving existing functionality.
 */

"use client";

import { useMemo } from "react";
import Link from "next/link";
import { classifyMediaUrl } from "@/lib/media";
import { useResolvedMediaUrls } from "@/lib/media-url-state";

type MediaItem = {
  url: string;
  postId: string;
};

type PrivateMediaGridProps = {
  items: MediaItem[];
  username: string;
  className?: string;
  gridClassName?: string;
  itemClassName?: string;
  onReady?: () => void;
};

function classify(url: string): "image" | "video" | "gif" {
  return classifyMediaUrl(url);
}

export function PrivateMediaGrid({
  items,
  username,
  className,
  gridClassName,
  itemClassName,
  onReady,
}: PrivateMediaGridProps) {
  const urls = useMemo(() => items.map((i) => i.url), [items]);
  const { items: resolvedItems, loading } = useResolvedMediaUrls(urls);

  if (items.length === 0) return null;

  if (loading) {
    return (
      <div className={className ?? "grid grid-cols-2 gap-1 sm:grid-cols-3"} aria-live="polite">
        {items.map((item, i) => (
          <div key={item.url + i} className="aspect-square rounded-md bg-af-surface-2 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={className ?? "grid grid-cols-2 gap-1 sm:grid-cols-3"} aria-live="polite">
      {resolvedItems.map((ri, i) => {
        const item = items[i];
        const resolved = ri.resolved ?? ri.original;
        const kind = classify(resolved);
        const href = `/${encodeURIComponent(username)}/status/${encodeURIComponent(item.postId)}`;
        return (
          <Link
            key={item.url + i}
            href={href}
            aria-label={`Open media post by ${username}`}
            className={`overflow-hidden rounded-md bg-af-surface-2 ${itemClassName ?? "aspect-square"}`}
          >
            {kind === "video" ? (
              <div className="relative h-full w-full">
                <video src={resolved} aria-label="Video thumbnail" muted playsInline preload="metadata" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" /></svg>
                  </span>
                </span>
              </div>
            ) : (
              <img src={resolved} alt="Profile media" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default PrivateMediaGrid;