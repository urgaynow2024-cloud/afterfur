"use client";
import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import MediaViewer from "@/components/ui/media-viewer";
import { isStoragePath } from "@/lib/media";
import { useResolvedMediaUrl } from "@/lib/media-url-state";

type MediaItemProps = {
  url: string;
  type: "image" | "video";
  alt: string;
  className?: string;
  onOpenViewer?: (items: { url: string; type: "image" | "video"; alt: string }[], index: number) => void;
  maxHeight?: string;
};

/**
 * MediaItem renders a single image or video attachment.
 *
 * If `url` is a public URL (legacy public bucket, avatars, banners) it is used
 * directly. If `url` is a private storage path it is resolved through the
 * authorized `/api/media/signed-url` route before rendering.
 */
export function MediaItem({
  url,
  type,
  alt,
  className,
  onOpenViewer,
  maxHeight = "min(70vh, 640px)",
}: MediaItemProps) {
  const { url: resolved, loading, error } = useResolvedMediaUrl(url);

  const [imageError, setError] = useState(false);
  const [imageLoading, setLoading] = useState(true);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Reset local render state whenever the resolved URL changes.
  const key = resolved ?? url;

  const handleError = useCallback(() => {
    setError(true);
    setLoading(false);
  }, []);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const openViewer = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (onOpenViewer && resolved) onOpenViewer([{ url: resolved, type, alt }], 0);
    },
    [resolved, type, alt, onOpenViewer],
  );

  if (loading || !resolved) {
    return (
      <div
        ref={viewerRef}
        className={`rounded-lg border border-af-border bg-af-surface-2 flex items-center justify-center text-xs text-af-muted ${className ?? ""}`}
        role={onOpenViewer ? "button" : undefined}
        tabIndex={onOpenViewer ? 0 : undefined}
        aria-label={onOpenViewer ? `Open media: ${alt}` : undefined}
      >
        {loading ? "Loading…" : "Media unavailable"}
      </div>
    );
  }

  if (error || imageError) {
    return (
      <div
        ref={viewerRef}
        className={`rounded-lg border border-af-border bg-af-surface-2 flex items-center justify-center text-xs text-af-muted ${className ?? ""}`}
        onClick={openViewer}
        role="button"
        tabIndex={0}
        aria-label={`Media failed to load: ${alt}`}
      >
        Media unavailable
      </div>
    );
  }

  if (type === "video") {
    return (
      <div
        ref={viewerRef}
        className={`relative overflow-hidden rounded-lg bg-black ${className ?? ""} cursor-pointer`}
        style={{ maxHeight }}
        onClick={openViewer}
        role="button"
        tabIndex={0}
        aria-label={`Video: ${alt}`}
      >
        {imageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white/60">
            Loading…
          </div>
        )}
        <video
          key={key}
          src={resolved}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full object-contain block"
          aria-label={alt}
          onError={handleError}
          onLoadedData={handleLoad}
        />
      </div>
    );
  }

  return (
    <div
      ref={viewerRef}
      className={`relative overflow-hidden rounded-lg bg-black/30 ${className ?? ""} cursor-pointer`}
      style={{ maxHeight }}
      onClick={openViewer}
      role="button"
      tabIndex={0}
      aria-label={`Image: ${alt}`}
    >
      {imageLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-xs text-white/60">
          Loading…
        </div>
      )}
      <Image
        key={key}
        src={resolved}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-contain"
        loading="lazy"
        onError={handleError}
        onLoad={handleLoad}
      />
    </div>
  );
}