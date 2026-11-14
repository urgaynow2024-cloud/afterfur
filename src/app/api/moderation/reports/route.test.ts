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
import type { ModeratorContext } from "@/lib/moderation";

const ctx: ModeratorContext = {
  userId: "mod-1",
  role: "moderator",
  isAdministrator: false,
  canModerate: true,
  canManageUsers: false,
  canManageStaff: false,
  appMetadata: {},
};

/** A chainable, awaitable query builder for list-style queries. */
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

function updateChain(result: { data?: unknown; error?: unknown }) {
  const chain: any = {};
  chain.eq = () => chain;
  chain.select = () => Promise.resolve(result);
  return chain;
}

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
  reporter: { username: "reporter1", display_name: "Reporter One", avatar_url: null },
  assignee: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  (requireModeratorRole as any).mockResolvedValue(ctx);
  (recordModerationAction as any).mockResolvedValue({ id: "audit-1", error: null });
});

async function loadRoute() {
  return import("@/app/api/moderation/reports/route");
}

describe("reports GET route", () => {
  it("returns 401 when not authenticated", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 401 });
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/moderation/reports"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user is not a moderator", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 403 });
    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/moderation/reports"));
    expect(res.status).toBe(403);
  });

  it("maps reports with derived priority and pagination metadata", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") return listChain({ data: [reportRow], error: null, count: 1 });
      return listChain({ data: [], error: null });
    });

    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/moderation/reports?page=2&pageSize=5&status=pending&priority=high"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.page).toBe(2);
    expect(body.reports[0].priority.level).toBe("high");
    expect(body.reports[0].reporter_username).toBe("reporter1");
    expect(body.reports[0].description).toBe("Reporter explanation");
  });

  it("searches reporter usernames and reported authors via profiles", async () => {
    const orSpy = vi.fn();
    const reportsChain = listChain({ data: [reportRow], error: null, count: 1 });
    const originalOr = reportsChain.or;
    reportsChain.or = (filter: string) => {
      orSpy(filter);
      return originalOr(filter);
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") return reportsChain;
      if (table === "profiles") return listChain({ data: [{ id: "user-1" }], error: null });
      return listChain({ data: [{ id: "post-1" }], error: null });
    });

    const { GET } = await loadRoute();
    const res = await GET(new Request("http://localhost/api/moderation/reports?search=reporter1"));
    expect(res.status).toBe(200);
    expect(orSpy).toHaveBeenCalled();
    const filter = String(orSpy.mock.calls[0]?.[0] ?? "");
    expect(filter).toContain("reporter_id.in.");
    expect(filter).toContain("target_id.in.");
  });
});

describe("reports POST (assignment) route", () => {
  it("returns 401 when unauthenticated", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 401 });
    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/moderation/reports", { method: "POST", body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111" }) }));
    expect(res.status).toBe(401);
  });

  it("assigns a report to another authorised moderator and records an audit entry", async () => {
    const updateResult = { error: null };
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "r-1", status: "pending", assigned_to: null }, error: null }),
          update: () => updateChain(updateResult),
        };
      }
      if (table === "moderator_roles") {
        return { select: () => selectMaybeSingle({ data: { user_id: "33333333-3333-3333-3333-333333333333", role: "moderator" }, error: null }) };
      }
      return listChain({ data: [], error: null });
    });

    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/moderation/reports", {
      method: "POST",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", assignedTo: "33333333-3333-3333-3333-333333333333" }),
    }));
    expect(res.status).toBe(200);
    expect(recordModerationAction).toHaveBeenCalledWith(expect.objectContaining({ action: "assign_report" }));
  });

  it("rejects assignment to a user who is not a moderator", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "r-1", status: "pending", assigned_to: null }, error: null }),
          update: () => updateChain({ error: null }),
        };
      }
      if (table === "moderator_roles") {
        return { select: () => selectMaybeSingle({ data: null, error: null }) };
      }
      return listChain({ data: [], error: null });
    });

    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/moderation/reports", {
      method: "POST",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", assignedTo: "00000000-0000-0000-0000-000000000000" }),
    }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("assignee_not_moderator");
  });

  it("rejects assignment of an already actioned report", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "r-1", status: "actioned", assigned_to: null }, error: null }),
          update: () => updateChain({ error: null }),
        };
      }
      return listChain({ data: [], error: null });
    });

    const { POST } = await loadRoute();
    const res = await POST(new Request("http://localhost/api/moderation/reports", {
      method: "POST",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111" }),
    }));
    expect(res.status).toBe(409);
  });
});

describe("reports PATCH (status + notes) route", () => {
  it("requires a reason when dismissing", async () => {
    const { PATCH } = await loadRoute();
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "dismissed" }),
    }));
    expect(res.status).toBe(400);
  });

  it("allows marking a report under review without a reason", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "r-1", status: "pending", description: null }, error: null }),
          update: () => updateChain({ data: [{ id: "r-1" }], error: null }),
        };
      }
      return listChain({ data: [], error: null });
    });

    const { PATCH } = await loadRoute();
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "reviewed" }),
    }));
    expect(res.status).toBe(200);
    expect(recordModerationAction).toHaveBeenCalled();
  });

  it("stores a dismissal reason as an internal note without touching the reporter description", async () => {
    const updateArg = { current: null as Record<string, unknown> | null };
    const insertSpy = vi.fn().mockResolvedValue({ error: null });

    // Capture the update payload via a spy on the update call.
    const updateSpy = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "r-1", status: "pending", description: "Reporter explanation" }, error: null }),
          update: (payload: Record<string, unknown>) => {
            updateSpy(payload);
            updateArg.current = payload;
            return updateChain({ data: [{ id: "r-1" }], error: null });
          },
        };
      }
      if (table === "report_notes") return { insert: insertSpy };
      return listChain({ data: [], error: null });
    });

    const { PATCH } = await loadRoute();
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "dismissed", moderatorNotes: "No violation" }),
    }));
    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalled();
    expect(updateArg.current).not.toHaveProperty("description");
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ report_id: "11111111-1111-1111-1111-111111111111", body: "No violation" }));
  });

  it("returns 409 when another moderator changed the status concurrently", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "r-1", status: "pending", description: null }, error: null }),
          update: () => updateChain({ data: [], error: null }),
        };
      }
      return listChain({ data: [], error: null });
    });

    const { PATCH } = await loadRoute();
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "actioned", moderatorNotes: "Actioned" }),
    }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("report_already_processed");
  });

  it("rejects a duplicate resolution of an already actioned report", async () => {
    const updateSpy = vi.fn();
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "11111111-1111-1111-1111-111111111111", status: "actioned", description: null }, error: null }),
          update: (payload: unknown) => {
            updateSpy(payload);
            return updateChain({ data: [], error: null });
          },
        };
      }
      return listChain({ data: [], error: null });
    });

    const { PATCH } = await loadRoute();
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "actioned", moderatorNotes: "Again" }),
    }));
    expect(res.status).toBe(409);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("rejects transitions on an already terminal report", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "reports") {
        return {
          select: () => selectMaybeSingle({ data: { id: "r-1", status: "dismissed", description: null }, error: null }),
          update: () => updateChain({ data: [], error: null }),
        };
      }
      return listChain({ data: [], error: null });
    });

    const { PATCH } = await loadRoute();
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "actioned", moderatorNotes: "Change" }),
    }));
    expect(res.status).toBe(409);
  });
});