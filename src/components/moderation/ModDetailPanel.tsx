"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";

export interface DetailField {
  label: string;
  value: ReactNode;
  span?: "full" | "half";
  className?: string;
}

interface Props {
  title?: string;
  subtitle?: string;
  fields: DetailField[];
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  headerActions?: ReactNode;
}

export default function ModDetailPanel({
  title,
  subtitle,
  fields,
  actions,
  footer,
  className,
  headerActions,
}: Props) {
  const gridCols = useMemo(() => {
    const hasHalf = fields.some((f) => f.span === "half");
    return hasHalf ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1";
  }, [fields]);

  return (
    <div className={`af-detail-panel ${className ?? ""}`.trim()}>
      {(title || subtitle || actions || headerActions) && (
        <div className="flex items-start justify-between gap-3 border-b border-af-border px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-af-text truncate">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-af-muted truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerActions}
          </div>
        </div>
      )}
      <div className={`grid ${gridCols} gap-px bg-af-border`}>
        {fields.map((f, i) => (
          <div
            key={i}
            className={`bg-af-surface px-4 py-2.5 ${f.span === "half" ? "" : "sm:col-span-2"}`}
          >
            <span className="af-detail-label">{f.label}</span>
            <span className={`af-detail-value ${f.className ?? ""}`.trim()}>{f.value ?? "—"}</span>
          </div>
        ))}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 border-t border-af-border px-4 py-2.5">
          {actions}
        </div>
      )}
      {footer && (
        <div className="border-t border-af-border px-4 py-2.5">{footer}</div>
      )}
    </div>
  );
}

export function DetailSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`af-detail-section ${className ?? ""}`.trim()}>
      {title && (
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-af-muted">{title}</h4>
      )}
      {children}
    </div>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-px bg-af-border sm:grid-cols-2">{children}</div>;
}

export function DetailCell({ label, value, span }: { label: string; value: ReactNode; span?: "full" | "half" }) {
  return (
    <div className={`bg-af-surface px-4 py-2.5 ${span === "half" ? "" : "sm:col-span-2"}`}>
      <span className="af-detail-label">{label}</span>
      <span className="af-detail-value">{value ?? "—"}</span>
    </div>
  );
}