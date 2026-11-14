"use client";

import type { ReactNode } from "react";

export interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: Array<{
    key: string;
    label: string;
    value: string | null;
    onChange: (value: string | null) => void;
    options: FilterOption[];
  }>;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}

export default function ModToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  children,
  className,
}: Props) {
  return (
    <div className={`af-filter-bar ${className ?? ""}`.trim()}>
      {onSearchChange && (
        <div className="af-filter-group flex-1 min-w-[180px]">
          <span className="af-filter-label">Search</span>
          <input
            type="text"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="af-field w-full px-3 text-sm"
          />
        </div>
      )}
      {filters.map((f) => (
        <div key={f.key} className="af-filter-group">
          <span className="af-filter-label">{f.label}</span>
          <select
            value={f.value ?? ""}
            onChange={(e) => f.onChange(e.target.value || null)}
            className="af-field px-3 text-sm"
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {children}
    </div>
  );
}