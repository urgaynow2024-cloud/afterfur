/**
 * Pure report metadata shared by server routes and client components.
 * Intentionally free of any browser/Supabase client imports so it is safe to
 * import from route handlers.
 */

export type ReportTargetType = "post" | "reply" | "user";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export type ReportReason =
  | "harassment"
  | "hate_speech"
  | "threats_violence"
  | "sexual_content"
  | "illegal_exploitation"
  | "spam_scam_impersonation"
  | "copyright"
  | "privacy_doxxing"
  | "other";

export const REPORT_TARGET_TYPES: { value: ReportTargetType; label: string }[] = [
  { value: "post", label: "Post" },
  { value: "reply", label: "Reply" },
  { value: "user", label: "Account" },
];

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate_speech", label: "Hate or discriminatory abuse" },
  { value: "threats_violence", label: "Threats or violence" },
  { value: "sexual_content", label: "Sexual or adult content" },
  { value: "illegal_exploitation", label: "Suspected illegal content or exploitation" },
  { value: "spam_scam_impersonation", label: "Spam, scams or impersonation" },
  { value: "copyright", label: "Copyright concerns" },
  { value: "privacy_doxxing", label: "Privacy violations or doxxing" },
  { value: "other", label: "Other" },
];

export const REPORT_DESCRIPTION_MAX = 1000;

/**
 * Report priority is derived from the report reason (the reports table has no
 * priority column). Shared by the moderation API and the reports UI.
 */
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

export const PRIORITY_REASONS: Record<ReportPriority, string[]> = {
  high: ["threats_violence", "harassment", "hate_speech", "sexual_content", "illegal_exploitation", "privacy_doxxing"],
  medium: ["spam_scam_impersonation", "copyright"],
  low: ["other"],
};

const PRIORITY_RANK: Record<ReportPriority, number> = { high: 3, medium: 2, low: 1 };

export type ReportPriorityInfo = { level: ReportPriority; label: string; rank: number };

export function reportPriority(reason: string): ReportPriorityInfo {
  const level = REASON_PRIORITY[reason] ?? "low";
  return {
    level,
    label: level.charAt(0).toUpperCase() + level.slice(1),
    rank: PRIORITY_RANK[level],
  };
}

export const REPORT_STATUSES: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "reviewed", label: "Under review" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
];

export function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export function targetTypeLabel(type: string): string {
  return REPORT_TARGET_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function isValidTargetType(value: string): value is ReportTargetType {
  return value === "post" || value === "reply" || value === "user";
}

export function isValidReportReason(value: string): value is ReportReason {
  return REPORT_REASONS.some((reason) => reason.value === value);
}

export function reportReasonLabel(reason: ReportReason): string {
  const found = REPORT_REASONS.find((r) => r.value === reason);
  return found ? found.label : reason;
}