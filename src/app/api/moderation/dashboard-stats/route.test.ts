import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockGte = vi.fn();
const mockLimit = vi.fn();

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: (o: any) => (o?.userId ? `user:${o.userId}` : `ip:${o?.ip || "unknown"}`),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

vi.mock("@/lib/moderation", () => ({
  requireModeratorRole: vi.fn(),
}));

import { requireModeratorRole } from "@/lib/moderation";

function makeReportsQuery(result: { data?: any; error?: any; count?: number | null }) {
  return {
    select: vi.fn().mockImplementation((_cols?: string, opts?: any) => {
      const q: any = {};
      q.gte = vi.fn().mockReturnValue(q);
      q.eq = vi.fn().mockReturnValue(q);
      q.in = vi.fn().mockReturnValue(q);
      q.order = vi.fn().mockReturnValue(q);
      q.limit = vi.fn().mockResolvedValue({ data: result.data ?? [], error: result.error ?? null, count: result.count ?? null });
      // first call in route awaits the select chain directly in one case? route does: await supabase.from("reports").select("status")
      if (opts?.head) {
        q.then = (res: any, rej: any) => Promise.resolve({ data: null, error: result.error ?? null, count: result.count ?? 0 }).then(res, rej);
      } else {
        q.then = (res: any, rej: any) => Promise.resolve({ data: result.data ?? [], error: result.error ?? null, count: result.count ?? null }).then(res, rej);
      }
      return q;
    }),
  };
}

function makeHeadCountQuery(result: { count?: number | null; error?: any }) {
  const q: any = {};
  q.select = vi.fn().mockReturnValue(q);
  q.eq = vi.fn().mockReturnValue(q);
  q.then = (res: any, rej: any) => Promise.resolve({ data: null, error: result.error ?? null, count: result.count ?? 0 }).then(res, rej);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  (requireModeratorRole as any).mockResolvedValue({ userId: "mod-1", role: "moderator" });
});

describe("dashboard-stats GET route", () => {
  it("returns 401 when unauthenticated", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 401 });
    const { GET } = await import("@/app/api/moderation/dashboard-stats/route");
    const res = await GET(new Request("http://localhost/api/moderation/dashboard-stats"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when not a moderator", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 403 });
    const { GET } = await import("@/app/api/moderation/dashboard-stats/route");
    const res = await GET(new Request("http://localhost/api/moderation/dashboard-stats"));
    expect(res.status).toBe(403);
  });

  it("loads statistics successfully", async () => {
    let reportsCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        reportsCalls++;
        if (reportsCalls === 1) return makeReportsQuery({ data: [{ status: "pending" }, { status: "actioned" }] });
        return makeReportsQuery({ data: [{ id: "r1", target_type: "post", reason: "spam", status: "pending", created_at: new Date().toISOString() }] });
      }
      if (table === "user_enforcements") return makeReportsQuery({ data: [{ id: "e1", type: "warning", reason: "test", created_at: new Date().toISOString() }] });
      if (table === "appeals") return makeHeadCountQuery({ count: 2 });
      return makeReportsQuery({ data: [] });
    });

    const { GET } = await import("@/app/api/moderation/dashboard-stats/route");
    const res = await GET(new Request("http://localhost/api/moderation/dashboard-stats"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.pendingReports).toBe(1);
    expect(body.actionedReports).toBe(1);
    expect(body.totalReports).toBe(2);
    expect(body.pendingAppeals).toBe(2);
    expect(body.error).toBeUndefined();
  });

  it("returns migration_required (503) with admin setup message when reports table is missing", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") return makeReportsQuery({ error: { code: "42P01", message: "relation \"public.reports\" does not exist" } });
      return makeReportsQuery({ data: [] });
    });

    const { GET } = await import("@/app/api/moderation/dashboard-stats/route");
    const res = await GET(new Request("http://localhost/api/moderation/dashboard-stats"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("migration_required");
    expect(body.code).toBe("migration_required");
    expect(String(body.message)).toContain("0033");
    expect(String(body.message)).not.toContain("relation \"public.reports\"");
    expect(body.pendingReports).toBeUndefined(); // no fake stats
  });

  it("returns migration_required when user_enforcements/appeals are missing (0033 unapplied)", async () => {
    let reportsCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        reportsCalls++;
        if (reportsCalls === 1) return makeReportsQuery({ data: [] });
        return makeReportsQuery({ data: [] });
      }
      if (table === "user_enforcements") return makeReportsQuery({ error: { code: "PGRST205", message: "Could not find the table 'public.user_enforcements' in the schema cache" } });
      if (table === "appeals") return makeHeadCountQuery({ count: 0 });
      return makeReportsQuery({ data: [] });
    });

    const { GET } = await import("@/app/api/moderation/dashboard-stats/route");
    const res = await GET(new Request("http://localhost/api/moderation/dashboard-stats"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("migration_required");
    expect(String(body.message)).not.toContain("schema cache");
  });

  it("returns safe 500 for non-migration database errors without leaking raw details", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") return makeReportsQuery({ error: { code: "42501", message: "permission denied for table reports SECRET_CONN_DETAIL" } });
      return makeReportsQuery({ data: [] });
    });

    const { GET } = await import("@/app/api/moderation/dashboard-stats/route");
    const res = await GET(new Request("http://localhost/api/moderation/dashboard-stats"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("dashboard_stats_unavailable");
    expect(JSON.stringify(body)).not.toContain("SECRET_CONN_DETAIL");
    expect(JSON.stringify(body)).not.toContain("permission denied for table reports");
  });
});
