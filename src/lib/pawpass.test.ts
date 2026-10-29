import { describe, expect, it } from "vitest";
import { parsePawPassEntitlement } from "@/lib/pawpass";

describe("verified PawPass entitlement parsing", () => {
  it("accepts only a recognized server entitlement and preserves expiry", () => {
    expect(parsePawPassEntitlement({ is_active: true, status: "cancel_at_period_end", current_period_end: "2026-12-01T00:00:00Z" })).toEqual({ active: true, status: "cancel_at_period_end", currentPeriodEnd: "2026-12-01T00:00:00Z" });
  });
  it("does not fabricate membership when the RPC has no row or an unknown status", () => {
    expect(parsePawPassEntitlement(undefined)).toBeNull();
    expect(parsePawPassEntitlement({ is_active: true, status: "prime", current_period_end: null })).toBeNull();
  });
  it("keeps expired membership inactive", () => {
    expect(parsePawPassEntitlement({ is_active: false, status: "expired", current_period_end: "2025-01-01T00:00:00Z" })?.active).toBe(false);
  });
});
