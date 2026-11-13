"use client";

/**
 * PostMedia renders one or more post attachments.
 *
 * Sizing rules:
 *  - A single image fills the available post width and keeps its intrinsic
 *    aspect ratio, so portrait images stay portrait without side columns or
 *    cropping, and landscape/square images stay natural.
 *  - Multiple attachments use a responsive square grid with object-cover
 *    thumbnails (the full-size media is available in the viewer).
 *  - Videos use native responsive controls.
 *  - GIFs are rendered with a plain <img> so the animation is preserved.
 *
 * NSFW attachments are blurred until explicitly revealed. URL protection is
 * enforced server-side by the signed-URL route; this component only resolves
 * and renders the media.
 */

import { useCallback, useMemo, useState } from "react";
import MediaViewer from "@/components/ui/media-viewer";
import { classifyMediaUrl, isVideoUrl } from "@/lib/media";
import { useResolvedMediaUrls } from "@/lib/media-url-state";

export type PostMediaProps = {
  urls: readonly string[] | null | undefined;
  nsfw?: boolean;
  alt?: string;
};

type ViewerItem = { url: string; type: "image" | "video"; alt: string };
type ViewerState = { items: ViewerItem[]; index: number };

function PlayIcon() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20">
        <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true">
          <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
        </svg>
      </span>
    </span>
  );
}

export function PostMedia({ urls, nsfw = false, alt = "Post attachment" }: PostMediaProps) {
  const mediaUrls = useMemo(() => (urls ?? []).filter((url): url is string => Boolean(url)), [urls]);
  const { items, loading } = useResolvedMediaUrls(mediaUrls);
  const [revealed, setRevealed] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);

  const resolvedItems = useMemo(
    () => items.filter((item): item is typeof item & { resolved: string } => Boolean(item.resolved)),
    [items],
  );

  const viewerItems = useMemo<ViewerItem[]>(
    () => resolvedItems.map((item) => ({
      url: item.resolved,
      type: isVideoUrl(item.resolved) ? "video" : "image",
      alt,
    })),
    [resolvedItems, alt],
  );

  const openViewer = useCallback(
    (index: number) => {
      if (nsfw && !revealed) {
        setRevealed(true);
        return;
      }
      if (viewerItems.length === 0) return;
      setViewer({ items: viewerItems, index: Math.max(0, Math.min(index, viewerItems.length - 1)) });
    },
    [nsfw, revealed, viewerItems],
  );

  const closeViewer = useCallback(() => setViewer(null), []);

  if (mediaUrls.length === 0) return null;

  const blurClasses = nsfw && !revealed ? "blur-[14px] grayscale" : "";

  if (loading && resolvedItems.length === 0) {
    return (
      <div className="mt-2">
        {mediaUrls.length === 1 ? (
          <div
            className="w-full animate-pulse rounded-2xl border border-af-border bg-af-surface-2"
            style={{ aspectRatio: "4 / 3" }}
            aria-label="Loading media"
          />
        ) : (
          <div className={`grid gap-1 ${mediaUrls.length === 2 ? "grid-cols-2" : "grid-cols-2"}`}>
            {mediaUrls.slice(0, 4).map((url, index) => (
              <div
                key={url + index}
                className={`animate-pulse rounded-xl bg-af-surface-2 ${mediaUrls.length === 3 && index === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square"}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (resolvedItems.length === 0) {
    return (
      <div className="mt-2 flex min-h-32 items-center justify-center rounded-2xl border border-af-border bg-af-surface-2 px-4 text-sm text-af-muted">
        {loading ? "Loading media…" : "Media unavailable"}
      </div>
    );
  }

  if (mediaUrls.length === 1) {
    const item = resolvedItems[0];
    const isVideo = classifyMediaUrl(item.resolved) === "video";

    return (
      <div className="relative mt-2">
        <div className="relative flex justify-center overflow-hidden rounded-2xl border border-af-border bg-af-surface-2">
          {isVideo ? (
            <div className="relative w-full">
              <video
                src={item.resolved}
                controls
                playsInline
                preload="metadata"
                aria-label={alt}
                className={`block h-auto w-full bg-black object-contain ${blurClasses}`}
              >
                Your browser does not support embedded video.
              </video>
              <button
                type="button"
                onClick={() => openViewer(0)}
                aria-label="Open video in full screen"
                title="Full screen"
                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white ring-1 ring-white/20 transition-colors hover:bg-black/85"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openViewer(0)}
              aria-label={`Open media: ${alt}`}
              className="flex w-full cursor-zoom-in justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-af-focus"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.resolved}
                alt={alt}
                loading="lazy"
                decoding="async"
                className={`block h-auto w-full object-contain ${blurClasses}`}
              />
            </button>
          )}
        </div>

        {nsfw && !revealed && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/35">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="min-h-10 rounded-full border border-white/30 bg-black/70 px-4 text-sm font-semibold text-white transition-colors hover:bg-black/90"
            >
              Reveal sensitive media
            </button>
          </div>
        )}
        {nsfw && revealed && (
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="absolute right-2 top-2 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-black/90"
          >
            Hide
          </button>
        )}
      </div>
    );
  }

  const visible = resolvedItems.slice(0, 4);
  const isTrio = visible.length === 3;

  return (
    <>
      <div className="relative mt-2">
        <div className="grid grid-cols-2 gap-1 overflow-hidden rounded-2xl">
          {visible.map((item, index) => {
            const isVideo = isVideoUrl(item.resolved);
            const wide = isTrio && index === 0;
            return (
              <button
                key={item.original + index}
                type="button"
                onClick={() => openViewer(index)}
                aria-label={`Open media ${index + 1} of ${visible.length}: ${alt}`}
                className={`group relative overflow-hidden bg-af-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-af-focus ${
                  wide ? "col-span-2 aspect-[2/1]" : "aspect-square"
                }`}
              >
                {isVideo ? (
                  <video
                    src={item.resolved}
                    muted
                    playsInline
                    preload="metadata"
                    aria-label={alt}
                    className={`h-full w-full object-cover ${blurClasses}`}
                  />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={item.resolved}
                    alt={alt}
                    loading="lazy"
                    decoding="async"
                    className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] ${blurClasses}`}
                  />
                )}
                {isVideo && <PlayIcon />}
              </button>
            );
          })}
        </div>

        {nsfw && !revealed && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/35">
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="min-h-10 rounded-full border border-white/30 bg-black/70 px-4 text-sm font-semibold text-white transition-colors hover:bg-black/90"
            >
              Reveal sensitive media
            </button>
          </div>
        )}
        {nsfw && revealed && (
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="absolute right-2 top-2 rounded-full border border-white/20 bg-black/70 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-black/90"
          >
            Hide
          </button>
        )}
      </div>

      {viewer && (
        <MediaViewer
          open={viewer.items.length > 0}
          onClose={closeViewer}
          items={viewer.items}
          initialIndex={viewer.index}
        />
      )}
    </>
  );
}

export default PostMedia;