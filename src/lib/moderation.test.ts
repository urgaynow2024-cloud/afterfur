import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getModeratorContext,
  requireModeratorRole,
  hasRoleAtLeast,
  roleLevel,
  isTrustedStaffAdmin,
} from "@/lib/moderation";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockReset();
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockMaybeSingle.mockReset();

  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
});

describe("roleLevel", () => {
  it("returns correct hierarchy levels", () => {
    expect(roleLevel("moderator")).toBe(10);
    expect(roleLevel("senior_moderator")).toBe(20);
    expect(roleLevel("administrator")).toBe(30);
    expect(roleLevel(null)).toBe(0);
  });
});

describe("hasRoleAtLeast", () => {
  it("returns true when role meets or exceeds minimum", () => {
    expect(hasRoleAtLeast("administrator", "moderator")).toBe(true);
    expect(hasRoleAtLeast("administrator", "senior_moderator")).toBe(true);
    expect(hasRoleAtLeast("senior_moderator", "moderator")).toBe(true);
    expect(hasRoleAtLeast("moderator", "moderator")).toBe(true);
  });

  it("returns false when role is below minimum", () => {
    expect(hasRoleAtLeast("moderator", "senior_moderator")).toBe(false);
    expect(hasRoleAtLeast("moderator", "administrator")).toBe(false);
    expect(hasRoleAtLeast("senior_moderator", "administrator")).toBe(false);
    expect(hasRoleAtLeast(null, "moderator")).toBe(false);
  });
});

describe("isTrustedStaffAdmin", () => {
  it("accepts trusted app_metadata boolean/string true only", () => {
    expect(isTrustedStaffAdmin({ afterfur_staff_admin: true })).toBe(true);
    expect(isTrustedStaffAdmin({ afterfur_staff_admin: "true" })).toBe(true);
    expect(isTrustedStaffAdmin({ afterfur_staff_admin: false })).toBe(false);
    expect(isTrustedStaffAdmin({ afterfur_staff_admin: "false" })).toBe(false);
    expect(isTrustedStaffAdmin({})).toBe(false);
    expect(isTrustedStaffAdmin(null)).toBe(false);
  });
});

describe("getModeratorContext", () => {
  it("returns empty context when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const ctx = await getModeratorContext();
    expect(ctx.userId).toBeNull();
    expect(ctx.role).toBeNull();
    expect(ctx.isAdministrator).toBe(false);
    expect(ctx.canModerate).toBe(false);
    expect(ctx.canManageUsers).toBe(false);
    expect(ctx.canManageStaff).toBe(false);
  });

  it("returns administrator context when trusted app_metadata claim is set (verified owner/staff admin)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "admin-1", app_metadata: { afterfur_staff_admin: true }, user_metadata: {} } },
      error: null,
    });
    const ctx = await getModeratorContext();
    expect(ctx.userId).toBe("admin-1");
    expect(ctx.role).toBe("administrator");
    expect(ctx.isAdministrator).toBe(true);
    expect(ctx.canModerate).toBe(true);
    expect(ctx.canManageUsers).toBe(true);
    expect(ctx.canManageStaff).toBe(true);
    expect(mockFrom).not.toHaveBeenCalled(); // app_metadata admin short-circuits
  });

  it("returns administrator context when app_metadata claim is legacy string 'true'", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "admin-2", app_metadata: { afterfur_staff_admin: "true" }, user_metadata: {} } },
      error: null,
    });
    const ctx = await getModeratorContext();
    expect(ctx.role).toBe("administrator");
    expect(ctx.isAdministrator).toBe(true);
  });

  it("NEVER trusts user_metadata for administrator privileges", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-x", app_metadata: {}, user_metadata: { afterfur_staff_admin: true, role: "administrator" } } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const ctx = await getModeratorContext();
    expect(ctx.role).toBeNull();
    expect(ctx.isAdministrator).toBe(false);
    expect(ctx.canModerate).toBe(false);
    expect(ctx.canManageStaff).toBe(false);
  });

  it("returns moderator role from moderator_roles table", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "mod-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: { role: "moderator" }, error: null });
    const ctx = await getModeratorContext();
    expect(ctx.role).toBe("moderator");
    expect(ctx.canModerate).toBe(true);
    expect(ctx.canManageUsers).toBe(false);
    expect(ctx.canManageStaff).toBe(false);
  });

  it("returns senior moderator role with only authorized permissions", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "smod-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: { role: "senior_moderator" }, error: null });
    const ctx = await getModeratorContext();
    expect(ctx.role).toBe("senior_moderator");
    expect(ctx.canModerate).toBe(true);
    expect(ctx.canManageUsers).toBe(true);
    expect(ctx.canManageStaff).toBe(false);
  });

  it("returns empty role when no role and no admin claim (ordinary user)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const ctx = await getModeratorContext();
    expect(ctx.userId).toBe("user-1");
    expect(ctx.role).toBeNull();
    expect(ctx.canModerate).toBe(false);
  });

  it("denies when app_metadata claim is missing/invalid", async () => {
    for (const claim of [false, "false", 1, "1", null, undefined, ""]) {
      mockGetUser.mockResolvedValue({
        data: { user: { id: "user-1", app_metadata: { afterfur_staff_admin: claim }, user_metadata: {} } },
        error: null,
      });
      mockMaybeSingle.mockResolvedValue({ data: null, error: null });
      const ctx = await getModeratorContext();
      expect(ctx.isAdministrator).toBe(false);
      expect(ctx.role).toBeNull();
    }
  });
});

describe("requireModeratorRole", () => {
  it("throws 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(requireModeratorRole("moderator")).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 when role is insufficient (moderator cannot access administrator-only staff management)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "mod-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: { role: "moderator" }, error: null });
    await expect(requireModeratorRole("administrator")).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when senior moderator lacks administrator permission", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "smod-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: { role: "senior_moderator" }, error: null });
    await expect(requireModeratorRole("administrator")).rejects.toMatchObject({ status: 403 });
  });

  it("returns context when senior moderator has authorized permission (user management)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "smod-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: { role: "senior_moderator" }, error: null });
    const ctx = await requireModeratorRole("senior_moderator");
    expect(ctx.role).toBe("senior_moderator");
    expect(ctx.canManageUsers).toBe(true);
  });

  it("verified owner/admin gets administrator access to any moderator route level", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "owner-1", app_metadata: { afterfur_staff_admin: true }, user_metadata: {} } },
      error: null,
    });
    await expect(requireModeratorRole("moderator")).resolves.toMatchObject({ role: "administrator", canManageStaff: true });
    await expect(requireModeratorRole("senior_moderator")).resolves.toMatchObject({ role: "administrator" });
    await expect(requireModeratorRole("administrator")).resolves.toMatchObject({ role: "administrator", isAdministrator: true });
  });

  it("ordinary users receive 403", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", app_metadata: {}, user_metadata: {} } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(requireModeratorRole("moderator")).rejects.toMatchObject({ status: 403 });
  });
});
