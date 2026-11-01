"use client";
import * as React from "react";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "block" | "circle" | "text";
  width?: "narrow" | "medium" | "wide";
  className?: string;
};

export function Skeleton({
  className,
  variant = "block",
  width,
  ...props
}: SkeletonProps) {
  const classes = ["af-skeleton"];
  if (variant === "circle") classes[0] = "af-skeleton-circle";
  if (variant === "text") classes[0] = "af-skeleton-text";
  if (width && variant === "text") classes.push(`af-skeleton-text-${width}`);
  if (className) classes.push(className);
  return <div className={classes.join(" ")} {...props} />;
}

Skeleton.displayName = "Skeleton";
