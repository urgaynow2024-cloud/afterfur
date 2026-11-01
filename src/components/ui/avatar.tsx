"use client";
import * as React from "react";

type AvatarProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: number | string;
  className?: string;
};

export function Avatar({
  src,
  alt,
  fallback,
  size,
  className,
  ...props
}: AvatarProps) {
  const style: React.CSSProperties = {};
  if (size) {
    const s = typeof size === "number" ? `${size}px` : size;
    style.width = s;
    style.height = s;
  }
  const hasImage = Boolean(src);
  const label = fallback || alt || "?";
  const initial = label.slice(0, 1).toUpperCase();
  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  };
  return (
    <span
      className={`af-avatar ${className ?? ""}`.trim()}
      style={{ ...style, overflow: "hidden", display: "inline-flex" }}
      aria-hidden={!hasImage}
      {...(hasImage ? {} : { "aria-label": fallback })}
    >
      {hasImage ? (
        <img src={src} alt={alt ?? ""} style={imgStyle} {...props} />
      ) : (
        <span className="af-avatar-fallback">{initial}</span>
      )}
    </span>
  );
}

Avatar.displayName = "Avatar";
