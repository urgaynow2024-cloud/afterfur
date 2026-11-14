/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: (o: any) => (o?.userId ? `user:${o.userId}` : `ip:${o?.ip || "unknown"}`),
}));

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/moderation", () => ({
  requireModeratorRole: vi.fn(),
  recordModerationAction: vi.fn(),
}));

import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";

const ctx = { userId: "mod-1", role: "moderator", isAdministrator: false, canModerate: true, canManageUsers: false, canManageStaff: false, appMetadata: {} };

function listChain(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const chain: any = {};
  for (const method of ["select", "eq", "in", "gte", "lte", "or", "order", "range", "limit"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function selectMaybeSingle(result: { data?: unknown; error?: unknown }) {
  const chain: any = {};
  chain.eq = () => chain;
  chain.maybeSingle = () => Promise.resolve(result);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireModeratorRole as any).mockResolvedValue(ctx);
  (recordModerationAction as any).mockResolvedValue({ id: "audit-1", error: null });
});

const params = { params: Promise.resolve({ id: "11111111-1111-1111-1111-111111111111" }) };

const reportRow = {
  id: "r-1",
  reporter_id: "user-1",
  target_type: "post",
  target_id: "post-1",
  reason: "harassment",
  description: "Reporter explanation",
  status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  assigned_to: null,
  assigned_at: null,
  created_at: "2024-01-01T00:00:00Z",
  reporter: { id: "user-1", username: "reporter1", display_name: "Reporter One", avatar_url: null, bio: null, created_at: null, is_private: false },
  assignee: null,
  reviewer: null,
};

describe("report detail GET route", () => {
  it("returns 401 when unauthenticated", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 401 });
    const { GET } = await import("@/app/api/moderation/reports/[id]/route");
    const res = await GET(new Request("http://localhost/api/moderation/reports/r-1"), params);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the report does not exist", async () => {
    mockFrom.mockImplementation(() => ({ select: () => selectMaybeSingle({ data: null, error: null }) }));
    const { GET } = await import("@/app/api/moderation/reports/[id]/route");
    const res = await GET(new Request("http://localhost/api/moderation/reports/r-1"), params);
    expect(res.status).toBe(404);
  });

  it("returns the report, target content, internal notes and moderation history", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") return { select: () => selectMaybeSingle({ data: reportRow, error: null }) };
      if (table === "posts") {
        return {
          select: () =>
            selectMaybeSingle({
              data: {
                id: "post-1",
                author_id: "user-2",
                content: "Reported post body",
                classification: null,
                created_at: "2024-01-01T00:00:00Z",
                media_urls: [],
                moderation_status: "visible",
              },
              error: null,
            }),
        };
      }
      if (table === "profiles") {
        return {
          select: () =>
            selectMaybeSingle({
              data: { id: "user-2", username: "reporteduser", display_name: "Reported User", avatar_url: null, bio: null, created_at: null, is_private: false },
              error: null,
            }),
        };
      }
      if (table === "report_notes") {
        return listChain({
          data: [
            { id: "n-1", report_id: "r-1", author_id: "mod-1", body: "Internal note", created_at: "2024-01-02T00:00:00Z", author: { username: "mod1", display_name: "Mod One" } },
          ],
          error: null,
        });
      }
      if (table === "moderation_audit_log") {
        return listChain({
          data: [
            {
              id: "a-1",
              actor_id: "mod-1",
              target_type: "report",
              target_id: "r-1",
              action: "assign_report",
              details: {},
              before_state: null,
              after_state: null,
              created_at: "2024-01-02T00:00:00Z",
              actor: { username: "mod1", display_name: "Mod One" },
            },
          ],
          error: null,
        });
      }
      return listChain({ data: [], error: null });
    });

    const { GET } = await import("@/app/api/moderation/reports/[id]/route");
    const res = await GET(new Request("http://localhost/api/moderation/reports/r-1"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report.id).toBe("r-1");
    expect(body.reporter.username).toBe("reporter1");
    expect(body.reportedUser.username).toBe("reporteduser");
    expect(body.targetContent.content).toBe("Reported post body");
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].body).toBe("Internal note");
    expect(body.actions).toHaveLength(1);
    expect(body.report.priority.level).toBe("high");
  });
});

describe("report internal notes POST route", () => {
  it("returns 401 when unauthenticated", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 401 });
    const { POST } = await import("@/app/api/moderation/reports/[id]/route");
    const res = await POST(new Request("http://localhost/api/moderation/reports/r-1", { method: "POST", body: JSON.stringify({ note: "hello" }) }), params);
    expect(res.status).toBe(401);
  });

  it("rejects an empty note", async () => {
    const { POST } = await import("@/app/api/moderation/reports/[id]/route");
    const res = await POST(new Request("http://localhost/api/moderation/reports/r-1", { method: "POST", body: JSON.stringify({ note: "   " }) }), params);
    expect(res.status).toBe(400);
  });

  it("adds a note and records an audit entry", async () => {
    const insertSpy = vi.fn().mockResolvedValue({
      data: { id: "n-2", report_id: "r-1", author_id: "mod-1", body: "New note", created_at: "2024-01-03T00:00:00Z" },
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") return { select: () => selectMaybeSingle({ data: { id: "r-1", status: "pending" }, error: null }) };
      if (table === "report_notes") {
        const chain: any = {};
        chain.insert = (payload: unknown) => {
          insertSpy(payload);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "n-2", report_id: "r-1", author_id: "mod-1", body: "New note", created_at: "2024-01-03T00:00:00Z" }, error: null }) }) };
        };
        return chain;
      }
      return listChain({ data: [], error: null });
    });

    const { POST } = await import("@/app/api/moderation/reports/[id]/route");
    const res = await POST(new Request("http://localhost/api/moderation/reports/r-1", { method: "POST", body: JSON.stringify({ note: "New note" }) }), params);
    expect(res.status).toBe(200);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ report_id: "11111111-1111-1111-1111-111111111111", body: "New note" }));
    expect(recordModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "add_report_note" }));
  });
});