import { createClient } from "@/lib/supabase/client";

export type ReportTargetType = "post" | "reply" | "user";

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

export type ReportSubmission = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string | null;
};

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

export interface ReportClient {
  rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export async function submitReport(submission: ReportSubmission): Promise<string> {
  if (!isValidTargetType(submission.targetType)) {
    throw new Error("Invalid report target.");
  }
  if (!isValidReportReason(submission.reason)) {
    throw new Error("Invalid report reason.");
  }
  const description = submission.description ?? null;
  if (description !== null && description.length > REPORT_DESCRIPTION_MAX) {
    throw new Error("Explanation is too long (maximum 1000 characters).");
  }

  const supabase = createClient();
  if (!supabase) {
    throw new Error("Supabase not configured.");
  }

  const { data, error } = await supabase.rpc("submit_report", {
    p_target_type: submission.targetType,
    p_target_id: submission.targetId,
    p_reason: submission.reason,
    p_description: description,
  });

  if (error) {
    throw new Error(error.message ?? "Report could not be submitted. Try again.");
  }
  if (data == null) {
    throw new Error("Report was not saved. Try again.");
  }
  return String(data);
}
