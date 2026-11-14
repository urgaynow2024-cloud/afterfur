import { reasonLabel } from "@/lib/reportMeta";

/**
 * Shared moderation-notification payload helpers.
 *
 * The database trigger (migration 0059) writes the same payload shape. These
 * helpers are used by the notifications UI for display/link fallbacks and by
 * tests to assert that only safe metadata is exposed.
 */

export const MODERATION_REPORT_TYPE = "moderation_report";
export const MODERATION_ASSIGNMENT_TYPE = "moderation_assignment";

export type ModerationNotificationPayload = {
  title: string;
  report_id: string;
  reason: string;
  reason_label: string;
  target_type: string;
  summary: string;
  href: string;
};

export function moderationReportHref(reportId: string): string {
  return `/moderator/reports?report=${encodeURIComponent(reportId)}`;
}

function targetLabel(targetType: string): string {
  if (targetType === "user") return "account";
  return targetType || "item";
}

function article(label: string): string {
  return label === "account" ? "An" : "A";
}

export function buildModerationReportPayload(input: { reportId: string; reason: string; targetType: string }): ModerationNotificationPayload {
  const label = targetLabel(input.targetType);
  const reason = reasonLabel(input.reason).toLowerCase();
  return {
    title: "New report received",
    report_id: input.reportId,
    reason: input.reason,
    reason_label: reason,
    target_type: input.targetType,
    summary: `${article(label)} ${label} was reported for ${reason}.`,
    href: moderationReportHref(input.reportId),
  };
}

export function buildModerationAssignmentPayload(input: { reportId: string; reason: string; targetType: string }): ModerationNotificationPayload {
  const label = targetLabel(input.targetType);
  const reason = reasonLabel(input.reason).toLowerCase();
  return {
    title: "Report assigned to you",
    report_id: input.reportId,
    reason: input.reason,
    reason_label: reason,
    target_type: input.targetType,
    summary: `${article(label)} ${label} report was assigned to you.`,
    href: moderationReportHref(input.reportId),
  };
}

export function isModerationNotificationType(type: string | null | undefined): boolean {
  return type === MODERATION_REPORT_TYPE || type === MODERATION_ASSIGNMENT_TYPE;
}

export function describeModerationNotification(n: { type: string; payload?: Record<string, unknown> | null }): string | null {
  if (!isModerationNotificationType(n.type)) return null;
  const payload = n.payload ?? {};
  const fallbackTitle = n.type === MODERATION_REPORT_TYPE ? "New report received" : "Report assigned to you";
  const title = typeof payload.title === "string" && payload.title ? payload.title : fallbackTitle;
  const summary = typeof payload.summary === "string" ? payload.summary : "";
  return summary ? `${title}: ${summary}` : title;
}