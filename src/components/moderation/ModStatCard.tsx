"use client";

import type { ReactNode } from "react";

interface Props {
  label: string;
  value: number | string;
  subtitle: string;
  trend?: { direction: "up" | "down" | "flat"; value: string } | null;
  icon?: ReactNode;
  accent?: "brand" | "danger" | "success" | "warning" | "muted";
  href?: string;
  onClick?: () => void;
}

export default function ModStatCard({
  label,
  value,
  subtitle,
  trend = null,
  icon,
  accent = "brand",
  href,
  onClick,
}: Props) {
  const accentMap: Record<string, string> = {
    brand: "text-af-brand-soft",
    danger: "text-af-danger-soft",
    success: "text-af-success",
    warning: "text-af-warning-soft",
    muted: "text-af-muted",
  };

  const trendColor: Record<string, string> = {
    up: "text-af-success",
    down: "text-af-danger-soft",
    flat: "text-af-muted",
  };

  const content = (
    <div className="af-stat-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-af-muted">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${accentMap[accent]}`}>{value}</p>
          <p className="mt-0.5 text-xs text-af-muted">{subtitle}</p>
          {trend && (
            <p className={`mt-1 text-xs font-medium ${trendColor[trend.direction]}`}>
              {trend.direction === "up" ? "▲" : trend.direction === "down" ? "▼" : "•"} {trend.value}
            </p>
          )}
        </div>
        {icon && <div className="shrink-0 text-af-text-2">{icon}</div>}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block transition-opacity hover:opacity-90">
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left transition-opacity hover:opacity-90">
        {content}
      </button>
    );
  }
  return content;
}