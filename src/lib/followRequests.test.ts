import { describe, expect, it, vi } from "vitest";
import { getIncomingFollowRequests, approveFollowRequest, rejectFollowRequest } from "@/lib/followRequests";

describe("followRequests", () => {
  it("returns empty when not authenticated", async () => {
    const supabase = { auth: { getUser: async () => ({ data: { user: null }, error: null }) }, from: () => ({}) } as any;
    const res = await getIncomingFollowRequests(supabase);
    expect(res.data).toEqual([]);
    expect(res.error).toBe("Not authenticated.");
  });

  it("approve returns not found when no row updated", async () => {
    const chain = { update: () => chain, eq: () => chain, select: () => ({ data: [], error: null }) };
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: "u2" } }, error: null }) }, from: () => chain, blocks: { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }) }) } } as any;
    // blocks query uses from("blocks")
    supabase.from = (table: string) => (table === "blocks" ? { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }) }) } : chain);
    const res = await approveFollowRequest(supabase, "u1");
    expect(res.ok).toBe(false);
  });

  it("reject returns not found when no row updated", async () => {
    const chain = { update: () => chain, eq: () => chain, select: () => ({ data: [], error: null }) };
    const supabase = { auth: { getUser: async () => ({ data: { user: { id: "u2" } }, error: null }) } } as any;
    supabase.from = (table: string) => (table === "blocks" ? { select: () => ({ eq: () => ({ eq: () => ({ limit: () => ({ data: [], error: null }) }) }) }) } : chain);
    const res = await rejectFollowRequest(supabase, "u1");
    expect(res.ok).toBe(false);
  });
});
