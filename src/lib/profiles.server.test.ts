import { describe, expect, it, vi, beforeEach } from "vitest";

const canViewProfileMock = vi.fn();

vi.mock("@/lib/profilePrivacy", () => ({
  canViewProfile: (...args: any[]) => canViewProfileMock(...args),
}));

const profileMaybeSingle = vi.fn();
const blocksMaybeSingle = vi.fn();
const followsMaybeSingle = vi.fn();

const profileIlike = vi.fn(() => ({ maybeSingle: profileMaybeSingle }));
const profileEq = vi.fn(() => ({ maybeSingle: profileMaybeSingle }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: profileEq,
            ilike: profileIlike,
          }),
        };
      }
      if (table === "blocks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: blocksMaybeSingle,
              }),
            }),
          }),
        };
      }
      if (table === "follows") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: followsMaybeSingle,
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    },
  }),
}));

describe("getProfileForViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profileMaybeSingle.mockReset();
    profileIlike.mockClear();
    profileEq.mockClear();
    blocksMaybeSingle.mockReset();
    followsMaybeSingle.mockReset();
  });

  it("looks up profiles case-insensitively", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "BlueyBarks", display_name: "Bluey", bio: null, avatar_url: null, is_private: false };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "blueybarks", viewerId: null });

    expect(result.error).toBeNull();
    expect(profileIlike).toHaveBeenCalledWith("username", "blueybarks");
  });

  it("returns forbidden when unauthorized viewer cannot access a private profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "alice", display_name: null, bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "alice", viewerId: "viewer-1" });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
    expect(canViewProfileMock).toHaveBeenCalled();
  });

  it("allows owner to access their own profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "alice", display_name: "Alice", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "alice", viewerId: "owner-1" });

    expect(result.profile?.id).toBe("owner-1");
    expect(result.error).toBeNull();
  });

  it("allows approved follower to access private profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "alice", display_name: "Alice", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: { status: "accepted" }, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "alice", viewerId: "follower-1" });

    expect(result.profile?.id).toBe("owner-1");
    expect(result.error).toBeNull();
  });

  it("unauthenticated requests cannot access private profiles", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "alice", display_name: "Alice", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "alice", viewerId: null });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
    expect(canViewProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ isPrivate: true, viewerId: null, followStatus: "none", blocked: false })
    );
  });

  it("pending follow requests never grant access", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "alice", display_name: "Alice", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: { status: "pending" }, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "alice", viewerId: "follower-1" });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
  });

  it("rejected follow requests never grant access", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "alice", display_name: "Alice", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: { status: "rejected" }, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "alice", viewerId: "follower-1" });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
  });

  it("blocked users cannot access protected profiles", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "alice", display_name: "Alice", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: { blocker_id: "viewer-1" }, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "alice", viewerId: "viewer-1" });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ blocked: true }));
  });

  it("returns the full stored profile row for authorized viewers without leaking auth-only fields", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = {
      id: "owner-1",
      username: "alice",
      display_name: "Alice",
      bio: "hi",
      avatar_url: "https://cdn/avatar.png",
      banner_url: "https://cdn/banner.png",
      website: "https://example.com",
      location: "Den",
      profile_customisation: { accent: "#fff" },
      created_at: "2026-01-01T00:00:00Z",
      is_private: false,
    };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "alice", viewerId: null });

    expect(result.error).toBeNull();
    expect(result.profile).toMatchObject(profile);
    expect((result.profile as any)?.email).toBeUndefined();
    expect((result.profile as any)?.phone).toBeUndefined();
  });

  it("allows logged-out visitor to view a public profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "bob", display_name: "Bob", bio: null, avatar_url: null, is_private: false };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "bob", viewerId: null });

    expect(result.profile?.id).toBe("owner-1");
    expect(result.error).toBeNull();
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false, viewerId: null }));
  });

  it("allows another authenticated user to view a public profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "bob", display_name: "Bob", bio: null, avatar_url: null, is_private: false };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "bob", viewerId: "viewer-1" });

    expect(result.profile?.id).toBe("owner-1");
    expect(result.error).toBeNull();
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false, viewerId: "viewer-1", blocked: false }));
  });

  it("denies unauthenticated access to a private profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "carol", display_name: "Carol", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "carol", viewerId: null });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: true, viewerId: null }));
  });

  it("allows owner to view their own private profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "carol", display_name: "Carol", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "carol", viewerId: "owner-1" });

    expect(result.profile?.id).toBe("owner-1");
    expect(result.error).toBeNull();
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ viewerId: "owner-1", ownerId: "owner-1" }));
  });

  it("allows approved follower to view a private profile", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "carol", display_name: "Carol", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: { status: "accepted" }, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "carol", viewerId: "follower-1" });

    expect(result.profile?.id).toBe("owner-1");
    expect(result.error).toBeNull();
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ followStatus: "accepted" }));
  });

  it("treats NULL is_private as public", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "dave", display_name: "Dave", bio: null, avatar_url: null, is_private: null };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    canViewProfileMock.mockReturnValueOnce(true);

    const result = await getProfileForViewer({ username: "dave", viewerId: null });

    expect(result.profile?.id).toBe("owner-1");
    expect(result.error).toBeNull();
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false }));
  });

  it("denies access to a private profile when follow status is none", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "carol", display_name: "Carol", bio: null, avatar_url: null, is_private: true };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "carol", viewerId: "stranger-1" });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
  });

  it("denies access when the profile is private and the viewer is blocked", async () => {
    const { getProfileForViewer } = await import("@/lib/profiles.server");
    const profile = { id: "owner-1", username: "carol", display_name: "Carol", bio: null, avatar_url: null, is_private: false };
    profileMaybeSingle.mockResolvedValueOnce({ data: profile, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: { blocker_id: "viewer-1" }, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewProfileMock.mockReturnValueOnce(false);

    const result = await getProfileForViewer({ username: "carol", viewerId: "viewer-1" });

    expect(result.profile).toBeNull();
    expect(result.error).toBe("forbidden");
    expect(canViewProfileMock).toHaveBeenCalledWith(expect.objectContaining({ blocked: true }));
  });
});

