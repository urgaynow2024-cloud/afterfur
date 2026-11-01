"use client";
import * as React from "react";

type SeparatorProps = React.HTMLAttributes<HTMLHRElement> & {
  className?: string;
};

export function Separator({ className, ...props }: SeparatorProps) {
  return <hr className={`af-separator ${className ?? ""}`.trim()} {...props} />;
}

Separator.displayName = "Separator";
