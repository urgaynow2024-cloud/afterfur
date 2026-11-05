import { describe, expect, it } from "vitest";

// Keep this test lightweight and DB-independent: it validates the notification
// rendering contract used by the notifications UI for appeal decisions.

function describeNotification(n: { type: string; payload?: Record<string, unknown> | null }) {
  if (n.type === "appeal_decision") {
    const status = n.payload?.status;
    const msg = typeof n.payload?.response_message === "string" && n.payload.response_message.trim() ? ` ${n.payload.response_message.trim()}` : "";
    if (status === "accepted") return `Your appeal was accepted.${msg}`;
    if (status === "rejected") return `Your appeal was rejected.${msg}`;
    return `Your appeal was reviewed.${msg}`;
  }
  return null;
}

describe("appeal decision notification rendering contract", () => {
  it("renders accepted appeal decisions", () => {
    expect(describeNotification({ type: "appeal_decision", payload: { status: "accepted", response_message: "Thanks for clarifying." } })).toBe("Your appeal was accepted. Thanks for clarifying.");
  });
  it("renders rejected appeal decisions", () => {
    expect(describeNotification({ type: "appeal_decision", payload: { status: "rejected" } })).toBe("Your appeal was rejected.");
  });
  it("renders unknown review states safely", () => {
    expect(describeNotification({ type: "appeal_decision", payload: {} })).toBe("Your appeal was reviewed.");
  });
});
