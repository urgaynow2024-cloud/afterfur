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
import { isStoragePath } from "@/lib/media";
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
  const lower = url.toLowerCase();
  if (lower.endsWith(".gif")) return "gif";
  if (/\.(mp4|webm|mov)$/i.test(lower)) return "video";
  return "image";
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
                <video src={resolved} aria-label="Video thumbnail" className="h-full w-full object-contain" />
                <span className="absolute inset-0 flex items-center justify-center text-4xl text-white drop-shadow-lg">▶</span>
              </div>
            ) : (
              <img src={resolved} alt="Profile media" loading="lazy" className="h-full w-full object-contain" />
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default PrivateMediaGrid;