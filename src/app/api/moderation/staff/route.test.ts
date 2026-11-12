import { describe, expect, it, vi, beforeEach } from "vitest";
import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";

const mockGetUser = vi.fn();
const mockGetVerifiedUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockInsert = vi.fn();
const mockInsertSelect = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();
const mockDelete = vi.fn();
const mockDeleteEq = vi.fn();
const mockRpc = vi.fn();
const mockRateLimit = vi.fn();

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

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mockRateLimit,
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: (o: any) => (o?.userId ? `user:${o.userId}` : `ip:${o?.ip || "unknown"}`),
}));

const ADMIN_CTX = {
  userId: "admin-1",
  role: "administrator",
  isAdministrator: true,
  canModerate: true,
  canManageUsers: true,
  canManageStaff: true,
  appMetadata: {},
};

function mockRpcResult(data: any, error: any = null) {
  mockRpc.mockResolvedValue({ data, error });
}

function setupProfilesAndRoles(targetExists = true, existingRole: any = null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: targetExists ? { id: "user-2", username: "target", display_name: "Target" } : null,
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "moderator_roles") {
      const selectChain: any = {
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: existingRole, error: null }),
        }),
      };
      if (existingRole) {
        return {
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: "role-1", user_id: "user-2", role: existingRole.role },
                  error: null,
                }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "role-1", user_id: "user-2", role: "moderator", assigned_by: "admin-1" },
              error: null,
            }),
          }),
        }),
      };
    }
    return { select: mockSelect, update: mockUpdate, insert: mockInsert, delete: mockDelete };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockReset();
  mockGetVerifiedUser.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockMaybeSingle.mockReset();
  mockInsert.mockReset();
  mockInsertSelect.mockReset();
  mockSingle.mockReset();
  mockUpdate.mockReset();
  mockUpdateEq.mockReset();
  mockDelete.mockReset();
  mockDeleteEq.mockReset();
  mockRpc.mockReset();
  mockRateLimit.mockReset();

  (requireModeratorRole as any).mockResolvedValue(ADMIN_CTX);
  (recordModerationAction as any).mockResolvedValue({ id: "audit-1", error: null });
  mockGetVerifiedUser.mockResolvedValue(null);

  mockRpcResult(true, null);
  mockRateLimit.mockResolvedValue({ allowed: true });
  setupProfilesAndRoles();
});

describe("staff route — badge sync authorization and actor verification", () => {
  it("rejects non-administrator from appointing staff (ordinary users cannot trigger badge RPC)", async () => {
    (requireModeratorRole as any).mockRejectedValueOnce({ status: 403 });
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "Trusted" }),
      }),
    );
    expect(res!.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("administrator appointing moderator calls RPC with verified admin actorId (not request-supplied)", async () => {
    setupProfilesAndRoles(true, null);
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "Trusted" }),
      }),
    );
    expect(res!.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("sync_staff_role_badge", {
      p_actor_id: "admin-1",
      p_target_id: "user-2",
      p_badge_id: "staff_moderator",
      p_action: "grant",
    });
    // Actor id is the verified administrator, never a body-supplied value.
    expect(mockRpc.mock.calls[0][1].p_actor_id).toBe("admin-1");
    expect(mockRpc.mock.calls[0][1].p_actor_id).not.toBe("user-2");
  });

  it("administrator removing staff calls RPC revoke with verified admin actorId", async () => {
    setupProfilesAndRoles(true, { id: "role-1", user_id: "user-2", role: "moderator" });
    const { PATCH } = await import("@/app/api/moderation/staff/route");
    const res = await PATCH(
      new Request("http://localhost/api/moderation/staff", {
        method: "PATCH",
        body: JSON.stringify({ targetUserId: "user-2", action: "remove", reason: "Cleanup" }),
      }),
    );
    expect(res!.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("sync_staff_role_badge", {
      p_actor_id: "admin-1",
      p_target_id: "user-2",
      p_badge_id: "staff_moderator",
      p_action: "revoke",
    });
  });

  it("platform owner (administrator claim) can appoint staff", async () => {
    const ownerCtx = { ...ADMIN_CTX, userId: "owner-1", appMetadata: { afterfur_staff_admin: true } };
    (requireModeratorRole as any).mockResolvedValueOnce(ownerCtx);
    setupProfilesAndRoles(true, null);
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "Owner appointment" }),
      }),
    );
    expect(res!.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledWith("sync_staff_role_badge", {
      p_actor_id: "owner-1",
      p_target_id: "user-2",
      p_badge_id: "staff_moderator",
      p_action: "grant",
    });
  });

  it("rejects self-assignment for administrators", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce(ADMIN_CTX);
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "admin-1", role: "moderator", reason: "Self" }),
      }),
    );
    expect(res!.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects missing targetUserId", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce(ADMIN_CTX);
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ role: "moderator", reason: "x" }),
      }),
    );
    expect(res!.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects invalid role", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce(ADMIN_CTX);
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "owner", reason: "x" }),
      }),
    );
    expect(res!.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects missing reason", async () => {
    (requireModeratorRole as any).mockResolvedValueOnce(ADMIN_CTX);
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "moderator" }),
      }),
    );
    expect(res!.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("duplicate grant is idempotent: RPC returns false and route still succeeds", async () => {
    setupProfilesAndRoles(true, null);
    mockRpcResult(false, null); // RPC no-op: badge already active
    const { POST } = await import("@/app/api/moderation/staff/route");
    const res = await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "Dup" }),
      }),
    );
    expect(res!.status).toBe(201);
    expect(mockRpc).toHaveBeenCalled();
  });

  it("duplicate revocation is idempotent: RPC returns false and route still succeeds", async () => {
    setupProfilesAndRoles(true, { id: "role-1", user_id: "user-2", role: "moderator" });
    mockRpcResult(false, null); // RPC no-op: no active assignment to revoke
    const { PATCH } = await import("@/app/api/moderation/staff/route");
    const res = await PATCH(
      new Request("http://localhost/api/moderation/staff", {
        method: "PATCH",
        body: JSON.stringify({ targetUserId: "user-2", action: "remove", reason: "Dup" }),
      }),
    );
    expect(res!.status).toBe(200);
    expect(mockRpc).toHaveBeenCalled();
  });

  it("does not touch unrelated badges: RPC invoked only for the role-mapped badge", async () => {
    setupProfilesAndRoles(true, null);
    const { POST } = await import("@/app/api/moderation/staff/route");
    await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "Single badge" }),
      }),
    );
    const calls = mockRpc.mock.calls.filter((c) => c[0] === "sync_staff_role_badge");
    expect(calls.length).toBe(1);
    expect(calls[0][1].p_badge_id).toBe("staff_moderator");
    // Only staff_moderator is synced; no other badge id is passed.
    expect(calls.some((c) => c[1].p_badge_id === "staff_founder")).toBe(false);
    expect(calls.some((c) => c[1].p_badge_id === "staff_developer")).toBe(false);
    expect(calls.some((c) => c[1].p_badge_id === "staff_tester")).toBe(false);
  });

  it("audit log is recorded for badge sync", async () => {
    setupProfilesAndRoles(true, null);
    const { POST } = await import("@/app/api/moderation/staff/route");
    await POST(
      new Request("http://localhost/api/moderation/staff", {
        method: "POST",
        body: JSON.stringify({ targetUserId: "user-2", role: "moderator", reason: "Audited" }),
      }),
    );
    expect(recordModerationAction).toHaveBeenCalled();
    const auditCall = (recordModerationAction as any).mock.calls[0][0];
    expect(auditCall.actorId).toBe("admin-1");
    expect(auditCall.targetType).toBe("staff_role");
    expect(auditCall.targetId).toBe("user-2");
  });
});
