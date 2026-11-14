import { describe, expect, it } from "vitest";
import {
  MODERATION_ASSIGNMENT_TYPE,
  MODERATION_REPORT_TYPE,
  buildModerationAssignmentPayload,
  buildModerationReportPayload,
  describeModerationNotification,
  isModerationNotificationType,
  moderationReportHref,
} from "@/lib/moderationNotifications";

const REPORT_ID = "11111111-1111-1111-1111-111111111111";

describe("moderation notification payloads", () => {
  it("builds the exact new-report title and a safe summary", () => {
    const payload = buildModerationReportPayload({ reportId: REPORT_ID, reason: "harassment", targetType: "post" });
    expect(payload.title).toBe("New report received");
    expect(payload.report_id).toBe(REPORT_ID);
    expect(payload.reason).toBe("harassment");
    expect(payload.reason_label).toContain("harassment");
    expect(payload.summary).toContain("post");
    expect(payload.summary).toContain("harassment");
    expect(payload.href).toBe(moderationReportHref(REPORT_ID));
    expect(payload.href).toContain("/moderator/reports?report=");
  });

  it("uses the account article for account reports", () => {
    const payload = buildModerationReportPayload({ reportId: REPORT_ID, reason: "other", targetType: "user" });
    expect(payload.target_type).toBe("user");
    expect(payload.summary.startsWith("An account")).toBe(true);
  });

  it("never includes reporter identity, description, notes or content", () => {
    const payload = buildModerationReportPayload({ reportId: REPORT_ID, reason: "spam_scam_impersonation", targetType: "reply" });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("description");
    expect(serialized).not.toContain("reporter");
    expect(serialized).not.toContain("note");
    expect(serialized).not.toContain("content");
    expect(Object.keys(payload).sort()).toEqual(["href", "reason", "reason_label", "report_id", "summary", "target_type", "title"]);
  });

  it("builds assignment alerts for the assigned moderator only", () => {
    const payload = buildModerationAssignmentPayload({ reportId: REPORT_ID, reason: "copyright", targetType: "post" });
    expect(payload.title).toBe("Report assigned to you");
    expect(payload.report_id).toBe(REPORT_ID);
    expect(payload.summary).toContain("assigned to you");
    expect(payload.href).toBe(moderationReportHref(REPORT_ID));
  });

  it("identifies moderation notification types", () => {
    expect(isModerationNotificationType(MODERATION_REPORT_TYPE)).toBe(true);
    expect(isModerationNotificationType(MODERATION_ASSIGNMENT_TYPE)).toBe(true);
    expect(isModerationNotificationType("like")).toBe(false);
    expect(isModerationNotificationType(null)).toBe(false);
  });

  it("describes moderation notifications and ignores other types", () => {
    const reportPayload = buildModerationReportPayload({ reportId: REPORT_ID, reason: "hate_speech", targetType: "post" });
    expect(describeModerationNotification({ type: MODERATION_REPORT_TYPE, payload: reportPayload })).toContain("New report received");
    expect(describeModerationNotification({ type: MODERATION_REPORT_TYPE, payload: reportPayload })).toContain(reportPayload.summary);

    const assignmentPayload = buildModerationAssignmentPayload({ reportId: REPORT_ID, reason: "other", targetType: "user" });
    expect(describeModerationNotification({ type: MODERATION_ASSIGNMENT_TYPE, payload: assignmentPayload })).toContain("Report assigned to you");

    expect(describeModerationNotification({ type: "like", payload: {} })).toBeNull();
  });
});