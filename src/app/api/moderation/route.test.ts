import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: (o: any) => (o?.userId ? `user:${o.userId}` : `ip:${o?.ip || "unknown"}`),
}));

const mockGetUser = vi.fn();
const mockGetVerifiedUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockInsertSelect = vi.fn();
const mockUpsertSelect = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock("@/lib/serverAuth", () => ({
  getVerifiedUser: mockGetVerifiedUser,
}));

vi.mock("@/lib/moderation", () => ({
  requireModeratorRole: vi.fn(),
  recordModerationAction: vi.fn(),
}));

import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";
import type { ModeratorContext } from "@/lib/moderation";

const mockCtx: ModeratorContext = {
  userId: "mod-1",
  role: "moderator",
  isAdministrator: false,
  canModerate: true,
  canManageUsers: false,
  canManageStaff: false,
  appMetadata: {},
};

const mockClient = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
  rpc: mockRpc,
} as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockReset();
  mockGetVerifiedUser.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockMaybeSingle.mockReset();
  mockOrder.mockReset();
  mockRange.mockReset();
  mockUpdate.mockReset();
  mockInsert.mockReset();
  mockUpsert.mockReset();
  mockDelete.mockReset();
  mockInsertSelect.mockReset();
  mockUpsertSelect.mockReset();
  mockRpc.mockReset();

  (requireModeratorRole as any).mockResolvedValue(mockCtx);
  (recordModerationAction as any).mockResolvedValue({ id: "audit-1", error: null });
  mockGetVerifiedUser.mockResolvedValue(null);

  mockFrom.mockReturnValue({
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    upsert: mockUpsert,
    delete: mockDelete,
  });
  mockSelect.mockReturnValue({
    eq: mockEq,
    order: mockOrder,
    range: mockRange,
    ilike: mockSelect,
    is: mockSelect,
    gte: mockSelect,
  });
  mockEq.mockReturnValue({
    maybeSingle: mockMaybeSingle,
    eq: mockEq,
    order: mockOrder,
    range: mockRange,
  });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockUpdate.mockReturnValue({
    eq: mockEq,
  });
  mockInsert.mockReturnValue({
    select: mockInsertSelect,
  });
  // Appeals POST does: .insert(...).select(...).single()
  mockInsertSelect.mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: "appeal-1", user_id: "user-1", status: "pending", created_at: "2024-01-01T00:00:00Z" }, error: null }),
  });
  mockUpsert.mockReturnValue({
    select: mockUpsertSelect,
  });
  mockDelete.mockReturnValue({
    eq: mockEq,
  });
});

describe("reports GET route", () => {
  it("returns 401 when not authenticated", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 401 });

    const { GET } = await import("@/app/api/moderation/reports/route");
    const res = await GET(new Request("http://localhost/api/moderation/reports"));
    expect(res!.status).toBe(401);
  });

  it("returns 403 when not a moderator", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 403 });

    const { GET } = await import("@/app/api/moderation/reports/route");
    const res = await GET(new Request("http://localhost/api/moderation/reports"));
    expect(res!.status).toBe(403);
  });

  it("returns paginated reports for moderator", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "r-1",
        reporter_id: "user-1",
        target_type: "post",
        target_id: "post-1",
        reason: "harassment",
        description: null,
        status: "pending",
        reviewed_by: null,
        reviewed_at: null,
        created_at: "2024-01-01T00:00:00Z",
        profiles: { username: "reporter1", display_name: "Reporter One" },
      },
      error: null,
    });
    mockOrder.mockReturnValue({ range: mockRange });
    mockRange.mockResolvedValue({
      data: [
        {
          id: "r-1",
          reporter_id: "user-1",
          target_type: "post",
          target_id: "post-1",
          reason: "harassment",
          description: null,
          status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          created_at: "2024-01-01T00:00:00Z",
          profiles: { username: "reporter1", display_name: "Reporter One" },
        },
      ],
      error: null,
      count: 1,
    });

    const { GET } = await import("@/app/api/moderation/reports/route");
    const res = await GET(new Request("http://localhost/api/moderation/reports?page=1&pageSize=20"));
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.reports.length).toBe(1);
    expect(body.reports[0].reason).toBe("harassment");
  });
});

describe("reports PATCH route", () => {
  it("returns 401 when not authenticated", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 401 });

    const { PATCH } = await import("@/app/api/moderation/reports/route");
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "dismissed" }),
    }));
    expect(res!.status).toBe(401);
  });

it("resolves a report successfully and stores the reason as an internal note", async () => {
    const chainMaybe = { maybeSingle: vi.fn().mockResolvedValueOnce({ data: { id: "r-1", status: "pending", description: null }, error: null }) };
    const updateSpy = vi.fn();
    const updateChain: any = {};
    updateChain.eq = () => updateChain;
    updateChain.select = () => Promise.resolve({ data: [{ id: "r-1" }], error: null });
    const insertSpy = vi.fn().mockResolvedValueOnce({ error: null });

    let fromCall = 0;
    mockFrom.mockImplementation((_table: string) => {
      fromCall++;
      if (fromCall === 1) {
        return { select: vi.fn().mockReturnValue({ eq: () => chainMaybe }) };
      }
      if (fromCall === 2) {
        // Conditional status update with optimistic concurrency check.
        return { update: (payload: Record<string, unknown>) => { updateSpy(payload); return updateChain; } };
      }
      // Internal note insert.
      return { insert: insertSpy };
    });

    const { PATCH } = await import("@/app/api/moderation/reports/route");
    const res = await PATCH(new Request("http://localhost/api/moderation/reports", {
      method: "PATCH",
      body: JSON.stringify({ reportId: "11111111-1111-1111-1111-111111111111", status: "dismissed", moderatorNotes: "No violation found" }),
    }));
    expect(res!.status).toBe(200);
    expect(recordModerationAction).toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ report_id: "11111111-1111-1111-1111-111111111111", body: "No violation found" }));
    // The reporter-visible description must not be modified by a moderator note.
    expect(updateSpy.mock.calls[0]?.[0]).not.toHaveProperty("description");
  });
});

describe("users GET route", () => {
  it("returns 403 when moderator tries to access user management", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 403 });

    const { GET } = await import("@/app/api/moderation/users/route");
    const res = await GET(new Request("http://localhost/api/moderation/users"));
    expect(res!.status).toBe(403);
  });

  it("returns users for senior moderator", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce({
      ...mockCtx,
      role: "senior_moderator",
      canManageUsers: true,
    });

    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall++;
      if (fromCall === 1) {
        // profiles: select().order().range() (+ optional .or for search)
        const q: any = {};
        q.order = vi.fn().mockReturnValue(q);
        q.or = vi.fn().mockReturnValue(q);
        q.range = vi.fn().mockResolvedValue({
          data: [{ id: "u-1", username: "user1", display_name: "User One", avatar_url: null, is_private: false, created_at: "2024-01-01T00:00:00Z" }],
          error: null,
          count: 1,
        });
        return { select: vi.fn().mockReturnValue(q) };
      }
      // user_enforcements: select().in().is().order()
      const createThenable = (): any => {
        const t: any = {
          then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
        };
        t.order = vi.fn().mockReturnValue(t);
        t.is = vi.fn().mockReturnValue(t);
        return t;
      };
      const enforcementThenable = createThenable();
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue(enforcementThenable),
        }),
      };
    });

    const { GET } = await import("@/app/api/moderation/users/route");
    const res = await GET(new Request("http://localhost/api/moderation/users"));
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.users.length).toBe(1);
    expect(body.users[0].username).toBe("user1");
  });
});

describe("staff management routes", () => {
  it("returns 403 when non-admin tries to access staff management", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 403 });
    const { GET } = await import("@/app/api/moderation/staff/route");
    const res = await GET(new Request("http://localhost/api/moderation/staff"));
    expect(res!.status).toBe(403);
  });

  it("administrator successfully appoints a moderator (audited)", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce({ ...mockCtx, userId: "admin-1", role: "administrator", isAdministrator: true, canManageStaff: true });
    let rolesCall=0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "user-2", username: "newmod", display_name: "New Mod" }, error: null }) }) }) };
      if (table === "moderator_roles") {
        rolesCall++;
        if (rolesCall === 1) return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }) };
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "role-1", user_id: "user-2", role: "moderator", assigned_by: "admin-1", assigned_at: new Date().toISOString(), reason: "Trusted" }, error: null }) }) }) };
      }
      return { select: mockSelect };
    });
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(new Request("http://localhost/api/moderation/staff", { method: "POST", body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "Trusted" }) }));
    expect(res!.status).toBe(201);
    expect(recordModerationAction).toHaveBeenCalled();
  });

  it("administrator promotes a moderator to senior moderator (audited)", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce({ ...mockCtx, userId: "admin-1", role: "administrator", isAdministrator: true, canManageStaff: true });
    mockFrom.mockImplementation((table: string) => {
      if (table === "moderator_roles") {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "role-1", user_id: "user-2", role: "moderator", reason: "old" }, error: null }) }) }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "role-1", user_id: "user-2", role: "senior_moderator" }, error: null }) }) }) }),
        };
      }
      return { select: mockSelect };
    });
    const { PATCH } = await import("@/app/api/moderation/staff/route");
    const res = await PATCH(new Request("http://localhost/api/moderation/staff", { method: "PATCH", body: JSON.stringify({ targetUserId: "user-2", role: "senior_moderator", reason: "Promotion" }) }));
    expect(res!.status).toBe(200);
    expect(recordModerationAction).toHaveBeenCalled();
  });

  it("rejects duplicate staff assignments", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce({ ...mockCtx, userId: "admin-1", role: "administrator", isAdministrator: true, canManageStaff: true });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "user-2", username: "u" }, error: null }) }) }) };
      if (table === "moderator_roles") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "role-1", role: "moderator" }, error: null }) }) }) };
      return { select: mockSelect };
    });
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(new Request("http://localhost/api/moderation/staff", { method: "POST", body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "dup" }) }));
    expect(res!.status).toBe(409);
  });

  it("removes a staff member (audited)", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce({ ...mockCtx, userId: "admin-1", role: "administrator", isAdministrator: true, canManageStaff: true });
    mockFrom.mockImplementation((table: string) => {
      if (table === "moderator_roles") return {
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "role-1", user_id: "user-2", role: "moderator" }, error: null }) }) }),
        delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
      return { select: mockSelect };
    });
    const { PATCH } = await import("@/app/api/moderation/staff/route");
    const res = await PATCH(new Request("http://localhost/api/moderation/staff", { method: "PATCH", body: JSON.stringify({ targetUserId: "user-2", action: "remove", reason: "Cleanup" }) }));
    expect(res!.status).toBe(200);
    expect(recordModerationAction).toHaveBeenCalled();
  });

  it("prevents unauthorized administrator assignment by denying non-admin", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 403 });
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(new Request("http://localhost/api/moderation/staff", { method: "POST", body: JSON.stringify({ targetUserId: "user-2", role: "administrator", reason: "nope" }) }));
    expect(res!.status).toBe(403);
  });

  it("staff search does not return email or sensitive fields", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce({ ...mockCtx, userId: "admin-1", role: "administrator", isAdministrator: true, canManageStaff: true });
    const selectSpy = vi.fn();
    const q: any = {};
    q.select = selectSpy.mockReturnValue(q);
    q.or = vi.fn().mockReturnValue(q);
    q.order = vi.fn().mockReturnValue(q);
    q.limit = vi.fn().mockResolvedValue({ data: [{ id: "u1", username: "a", display_name: "A", avatar_url: null }], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return q;
      if (table === "moderator_roles") return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
      return q;
    });
    const { GET } = await import("@/app/api/moderation/staff/search/route");
    const res = await GET(new Request("http://localhost/api/moderation/staff/search?q=ab"));
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(JSON.stringify(body)).not.toContain("email");
    const sel = String(selectSpy.mock.calls[0]?.[0] || "");
    expect(sel).not.toContain("email");
  });
});


describe("appeals POST route", () => {
  it("creates an appeal for authenticated user", async () => {
    mockGetVerifiedUser.mockResolvedValue({ id: "user-1", app_metadata: {}, user_metadata: {} });

    let fromCall = 0;
    mockFrom.mockImplementation(() => {
      fromCall++;
      if (fromCall === 1) {
        // Duplicate check: select().eq().eq().eq().eq().maybeSingle() -> null (no pending)
        const q: any = {};
        q.eq = vi.fn().mockReturnValue(q);
        q.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        return { select: vi.fn().mockReturnValue(q) };
      }
      // Insert: insert().select().single()
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: "appeal-1", user_id: "user-1", status: "pending", created_at: "2024-01-01T00:00:00Z" }, error: null }),
          }),
        }),
      };
    });

    const { POST } = await import("@/app/api/moderation/appeals/route");
    const res = await POST(new Request("http://localhost/api/moderation/appeals", {
      method: "POST",
      body: JSON.stringify({ enforcementType: "ban", enforcementId: "enf-1", reason: "Unfair ban" }),
    }));
    expect(res!.status).toBe(201);
  });

  it("returns 400 when reason is missing", async () => {
    mockGetVerifiedUser.mockResolvedValue({ id: "user-1", app_metadata: {}, user_metadata: {} });

    const { POST } = await import("@/app/api/moderation/appeals/route");
    const res = await POST(new Request("http://localhost/api/moderation/appeals", {
      method: "POST",
      body: JSON.stringify({ enforcementType: "ban", enforcementId: "enf-1" }),
    }));
    expect(res!.status).toBe(400);
  });
});
