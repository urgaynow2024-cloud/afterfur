import { createClient } from "@/lib/supabase/client";
import {
  REPORT_DESCRIPTION_MAX,
  isValidReportReason,
  isValidTargetType,
  type ReportReason,
  type ReportTargetType,
} from "@/lib/reportMeta";

// Re-export pure report metadata so existing `@/lib/reports` imports keep working.
export * from "@/lib/reportMeta";

export type ReportSubmission = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string | null;
};

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