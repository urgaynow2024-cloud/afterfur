"use strict";

import type { ReactNode } from "react";

export type ReportPriority = "high" | "medium" | "low";

export const REASON_PRIORITY: Record<string, ReportPriority> = {
  threats_violence: "high",
  harassment: "high",
  hate_speech: "high",
  sexual_content: "high",
  illegal_exploitation: "high",
  privacy_doxxing: "high",
  spam_scam_impersonation: "medium",
  copyright: "medium",
  other: "low",
};

export function reportPriority(reason: string): ReportPriority {
  return REASON_PRIORITY[reason] ?? "low";
}

export function priorityLabel(level: ReportPriority): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function priorityColor(level: ReportPriority): string {
  switch (level) {
    case "high":
      return "text-af-danger-soft border-af-danger/20 bg-af-danger/5";
    case "medium":
      return "text-af-warning-soft border-af-warning/20 bg-af-warning/5";
    case "low":
      return "text-af-muted border-af-border/40 bg-af-surface-2";
  }
}

const STATUS_COLOR: Record<string, string> = {
  pending: "text-af-warning-soft border-af-warning/20 bg-af-warning/5",
  reviewed: "text-af-brand-soft border-af-brand/20 bg-af-brand/5",
  dismissed: "text-af-muted border-af-border/40 bg-af-surface-2",
  actioned: "text-af-brand border-af-brand/20 bg-af-brand/5",
  accepted: "text-af-brand-soft border-af-brand/20 bg-af-brand/5",
  rejected: "text-af-danger-soft border-af-danger/20 bg-af-danger/5",
};

export function statusColor(status: string | null | undefined): string {
  return STATUS_COLOR[String(status ?? "").toLowerCase()] ?? "text-af-text-2 border-af-border/40 bg-af-surface-2";
}

export function statusLabel(status: string | null | undefined): string {
  const s = String(status ?? "").toLowerCase();
  const labels: Record<string, string> = {
    pending: "Pending",
    reviewed: "Under review",
    dismissed: "Dismissed",
    actioned: "Actioned",
    accepted: "Approved",
    rejected: "Rejected",
    active: "Active",
    revoked: "Revoked",
  };
  return labels[s] ?? status ?? "—";
}

export type ModBadgeProps = { children: ReactNode; className?: string };
export function ModBadge({ children, className }: ModBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${className ?? ""}`}>
      {children}
    </span>
  );
}

export function PriorityBadge({ level }: { level: ReportPriority }) {
  return (
    <ModBadge className={priorityColor(level)}>{priorityLabel(level)} priority</ModBadge>
  );
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return <ModBadge className={statusColor(status)}>{statusLabel(status)}</ModBadge>;
}

export type EnforcementType = "warning" | "suspension" | "ban" | "restriction";

export function enforcementColor(type: EnforcementType | string): string {
  switch (type) {
    case "ban":
      return "text-af-danger-soft border-af-danger/20 bg-af-danger/5";
    case "suspension":
      return "text-af-warning-soft border-af-warning/20 bg-af-warning/5";
    case "restriction":
      return "text-af-muted border-af-border/40 bg-af-surface-2";
    case "warning":
    default:
      return "text-af-brand-soft border-af-brand/20 bg-af-brand/5";
  }
}

export function EnforcementBadge({ type }: { type: string }) {
  return <ModBadge className={enforcementColor(type)}>{type}</ModBadge>;
}
