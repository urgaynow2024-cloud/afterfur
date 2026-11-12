"use client";

import { useState } from "react";
import { classifyMediaUrl, isVideoUrl } from "@/lib/media";

type RevealableMediaProps = {
  url: string;
  isNsfw: boolean;
  alt?: string;
  className?: string;
  videoClassName?: string;
  onReveal?: (url: string) => void;
};

/**
 * Renders a single media item with optional NSFW blur protection.
 *
 * NSFW media is blurred by default. A "Reveal" control lets the viewer
 * unblur an individual item; a "Reblur" control restores the blur. SFW
 * media is rendered without any blur or reveal controls.
 *
 * The component does not fetch or expose media URLs - it only controls
 * CSS blur on the rendered element. Actual URL protection is enforced
 * server-side (signed URLs, storage RLS).
 */
export function RevealableMedia({
  url,
  isNsfw,
  alt,
  className,
  videoClassName,
  onReveal,
}: RevealableMediaProps) {
  const [revealed, setRevealed] = useState(false);
  const shouldBlur = isNsfw && !revealed;

  const toggleReveal = () => {
    setRevealed(true);
    onReveal?.(url);
  };

  const toggleReblur = () => {
    setRevealed(false);
  };

  const mediaClasses = [
    "overflow-hidden rounded-2xl",
    shouldBlur ? "blur-[12px] grayscale" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  const overlayClasses = [
    "absolute inset-0 flex items-center justify-center bg-black/40",
    shouldBlur ? "" : "hidden",
  ].filter(Boolean).join(" ");

  const buttonClasses =
    "rounded-full border border-white/30 bg-black/60 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20";

  const isVideo = isVideoUrl(url);

  return (
    <div className="relative" style={{ display: "inline-block" }}>
      {isVideo ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className={mediaClasses + " " + (videoClassName ?? "w-full max-h-[min(70vh,640px)] object-contain")}
        />
      ) : (
        <img
          src={url}
          alt={alt ?? "Media attachment"}
          loading="lazy"
          decoding="async"
          className={mediaClasses + " w-full h-auto object-contain"}
        />
      )}

      {shouldBlur && (
        <div className={overlayClasses}>
          <button type="button" onClick={toggleReveal} aria-label="Reveal media" className={buttonClasses}>
            Reveal
          </button>
        </div>
      )}

      {revealed && (
        <div className={overlayClasses}>
          <button type="button" onClick={toggleReblur} aria-label="Reblur media" className={buttonClasses}>
            Reblur
          </button>
        </div>
      )}
    </div>
  );
}
