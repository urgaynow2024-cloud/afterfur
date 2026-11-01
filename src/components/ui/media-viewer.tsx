"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type MediaViewerProps = {
  open: boolean;
  onClose: () => void;
  items: { url: string; type: "image" | "video"; alt: string }[];
  initialIndex: number;
};

export default function MediaViewer({
  open,
  onClose,
  items,
  initialIndex = 0,
}: MediaViewerProps) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialIndex, Math.max(0, items.length - 1))));
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const next = Math.max(0, Math.min(initialIndex, Math.max(0, items.length - 1)));
      setIndex(next);
      setLoading(true);
      setErrored(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, initialIndex, items.length]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setErrored(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [index]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => (items.length ? (i > 0 ? i - 1 : items.length - 1) : 0));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((i) => (items.length ? (i < items.length - 1 ? i + 1 : 0) : 0));
      }
    },
    [open, onClose, items.length],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open || items.length === 0) return null;

  const current = items[index];
  const isVideo = current.type === "video";

  function goPrev() {
    setIndex((i) => (i > 0 ? i - 1 : items.length - 1));
  }
  function goNext() {
    setIndex((i) => (i < items.length - 1 ? i + 1 : 0));
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-3 sm:p-6 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
      onClick={(event) => {
        if (event.target === containerRef.current) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close media viewer"
        className="absolute top-3 right-3 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
      >
        <span className="text-2xl font-bold leading-none">×</span>
        <span className="sr-only">Close</span>
      </button>

      <div className="relative flex w-full max-w-[96vw] items-center justify-center">
        {items.length > 1 && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous media"
            className="absolute left-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90 sm:left-4"
          >
            <span className="text-2xl font-bold leading-none">‹</span>
            <span className="sr-only">Previous</span>
          </button>
        )}
        <div className="relative flex max-h-[88vh] w-full max-w-[92vw] items-center justify-center overflow-hidden rounded-xl bg-black sm:max-w-[85vw]">
          {loading && !errored && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-sm text-white/80">
              Loading…
            </div>
          )}
          {errored ? (
            <div className="flex min-h-[40vh] w-full items-center justify-center px-6 text-center text-sm text-white/80">
              Media failed to load.
            </div>
          ) : isVideo ? (
            <video
              key={current.url}
              src={current.url}
              controls
              playsInline
              preload="metadata"
              className="max-h-[88vh] max-w-full object-contain"
              aria-label={current.alt}
              autoPlay
              onLoadedData={() => setLoading(false)}
              onError={() => { setLoading(false); setErrored(true); }}
            />
          ) : (
            <img
              key={current.url}
              src={current.url}
              alt={current.alt}
              className="max-h-[88vh] max-w-full object-contain"
              loading="lazy"
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setErrored(true); }}
            />
          )}
        </div>
        {items.length > 1 && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next media"
            className="absolute right-2 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90 sm:right-4"
          >
            <span className="text-2xl font-bold leading-none">›</span>
            <span className="sr-only">Next</span>
          </button>
        )}
      </div>

      {items.length > 1 && (
        <p className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white/90">
          {index + 1} / {items.length}
        </p>
      )}
    </div>
  );
}
