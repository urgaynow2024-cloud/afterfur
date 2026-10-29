import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  submitReport,
  isValidReportReason,
  isValidTargetType,
  REPORT_REASONS,
  REPORT_DESCRIPTION_MAX,
} from "@/lib/reports";

vi.mock("@/lib/supabase/client");
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const mockCreateClient = vi.mocked(createClient);
const mockRpc = vi.fn();

beforeEach(() => {
  mockRpc.mockReset();
  mockCreateClient.mockReturnValue({ rpc: mockRpc } as unknown as SupabaseClient<Database>);
});

const validPostSubmission = {
  targetType: "post" as const,
  targetId: "00000000-0000-0000-0000-000000000001",
  reason: "harassment" as const,
};

describe("report reason and target validation", () => {
  it("accepts all nine report reasons", () => {
    expect(REPORT_REASONS).toHaveLength(9);
    for (const { value } of REPORT_REASONS) {
      expect(isValidReportReason(value)).toBe(true);
    }
    expect(isValidReportReason("not-a-reason")).toBe(false);
    expect(isValidReportReason("")).toBe(false);
  });

  it("accepts post, reply and user targets only", () => {
    expect(isValidTargetType("post")).toBe(true);
    expect(isValidTargetType("reply")).toBe(true);
    expect(isValidTargetType("user")).toBe(true);
    expect(isValidTargetType("comment")).toBe(false);
    expect(isValidTargetType("")).toBe(false);
  });

  it("enforces the 1000 character explanation limit", () => {
    expect(REPORT_DESCRIPTION_MAX).toBe(1000);
    expect("a".repeat(1001).length).toBeGreaterThan(REPORT_DESCRIPTION_MAX);
    expect("a".repeat(1000).length).toBeLessThanOrEqual(REPORT_DESCRIPTION_MAX);
  });
});

describe("submitReport", () => {
  it("submits a valid post report and returns the saved report id", async () => {
    mockRpc.mockResolvedValue({ data: "report-1", error: null });

    const id = await submitReport(validPostSubmission);

    expect(id).toBe("report-1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("submit_report", {
      p_target_type: "post",
      p_target_id: "00000000-0000-0000-0000-000000000001",
      p_reason: "harassment",
      p_description: null,
    });
  });

  it("submits reply and account reports with an optional explanation", async () => {
    mockRpc.mockResolvedValue({ data: "report-2", error: null });

    await submitReport({
      targetType: "reply",
      targetId: "00000000-0000-0000-0000-000000000002",
      reason: "other",
      description: "This reply targets a minor.",
    });
    await submitReport({
      targetType: "user",
      targetId: "00000000-0000-0000-0000-000000000003",
      reason: "privacy_doxxing",
    });

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenNthCalledWith(1, "submit_report", {
      p_target_type: "reply",
      p_target_id: "00000000-0000-0000-0000-000000000002",
      p_reason: "other",
      p_description: "This reply targets a minor.",
    });
    expect(mockRpc).toHaveBeenNthCalledWith(2, "submit_report", {
      p_target_type: "user",
      p_target_id: "00000000-0000-0000-0000-000000000003",
      p_reason: "privacy_doxxing",
      p_description: null,
    });
  });

  it("rejects an invalid target type", async () => {
    await expect(
      submitReport({ ...validPostSubmission, targetType: "comment" as never }),
    ).rejects.toThrow("Invalid report target.");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid report reason", async () => {
    await expect(
      submitReport({ ...validPostSubmission, reason: "not-a-reason" as never }),
    ).rejects.toThrow("Invalid report reason.");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects an explanation over 1000 characters", async () => {
    await expect(
      submitReport({ ...validPostSubmission, description: "a".repeat(1001) }),
    ).rejects.toThrow("Explanation is too long (maximum 1000 characters).");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("requires a configured Supabase client", async () => {
    mockCreateClient.mockReturnValue(null);
    await expect(submitReport(validPostSubmission)).rejects.toThrow(
      "Supabase not configured.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("surfaces server errors such as authentication required", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Authentication required. Sign in to submit a report." },
    });

    await expect(submitReport(validPostSubmission)).rejects.toThrow(
      "Authentication required.",
    );
  });

  it("surfaces nonexistent target errors", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "The post, reply or account you are reporting does not exist." },
    });

    await expect(submitReport(validPostSubmission)).rejects.toThrow(
      "does not exist",
    );
  });

  it("reports duplicate submissions", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "You have already submitted a report for this." },
    });

    await expect(submitReport(validPostSubmission)).rejects.toThrow(
      "already submitted",
    );
  });

  it("reports failure when the server returns no data", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(submitReport(validPostSubmission)).rejects.toThrow(
      "Report was not saved.",
    );
  });
});
