"use client";
import * as React from "react";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  raised?: boolean;
  padding: "none" | "sm" | "md" | "lg";
};

export function Card({
  className,
  raised = false,
  padding = "md",
  children,
  ...props
}: CardProps) {
  const paddingClasses: Record<CardProps["padding"], string> = {
    none: "",
    sm: "p-3",
    md: "p-4 sm:p-5",
    lg: "p-6",
  };
  return (
    <div
      className={`af-panel ${raised ? "af-panel-raised" : ""} ${paddingClasses[padding]} ${className ?? ""}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

Card.displayName = "Card";
