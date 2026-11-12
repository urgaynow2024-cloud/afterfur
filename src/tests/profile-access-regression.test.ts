import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type RouteModule = { GET: (req: NextRequest, ctx: { params: Promise<{ username: string }> }) => Promise<Response> };

let allow = true;
let rateLimitCalls: Array<{ identifier: string; endpoint: string }> = [];
let verifiedUserId: string | null = "u-viewer";
let authResultOverride: any = null;

vi.mock("@/lib/moderation", () => ({
  requireModeratorRole: vi.fn(async (_role: string, req?: Request) => {
    const auth = req?.headers?.get("authorization");
    if (!auth) throw Object.assign(new Error("Authentication required."), { status: 401 });
    return { userId: "u-admin", role: "administrator", isAdministrator: true };
  }),
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async (identifier: string, endpoint: string, limit?: number, windowSeconds?: number, correlationId?: string) => {
    rateLimitCalls.push({ identifier, endpoint });
    return allow ? { allowed: true } : { allowed: false, response: new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json" } }) };
  }),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: ({ userId, ip }: any) => userId ? `user:${userId}` : `ip:${ip}`,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "p1", username: "blueybarks", display_name: "Bluey", is_private: false } })) })) })) })),
  })),
}));

vi.mock("@/lib/serverAuth", () => ({
  verifyRequestAuth: vi.fn(async (req?: Request) => {
    if (authResultOverride) return authResultOverride;
    const auth = req?.headers?.get("authorization");
    if (auth) return { ok: true, mode: "bearer", user: { id: verifiedUserId, email: `${verifiedUserId}@example.com`, app_metadata: {}, user_metadata: {} } };
    return { ok: false, mode: "anonymous", reason: "no_bearer" };
  }),
  getVerifiedUser: vi.fn(async (req?: Request) => {
    const auth = req?.headers?.get("authorization");
    if (auth) return { id: verifiedUserId, email: `${verifiedUserId}@example.com` };
    return null;
  }),
}));

let profileError: string | null = null;
let profileOwnerId: string | null = "p1";
let profileIsPrivate = false;

vi.mock("@/lib/profiles.server", () => ({
  getProfileForViewer: vi.fn(async () => {
    if (profileError) return { profile: null, error: profileError };
    return { profile: { id: profileOwnerId, username: "blueybarks", display_name: "Bluey", is_private: profileIsPrivate } };
  }),
}));

describe("Profile access regression: 429 root cause and fix verification", () => {
  beforeEach(() => {
    allow = true;
    rateLimitCalls = [];
    verifiedUserId = "u-viewer";
    authResultOverride = null;
    profileError = null;
    profileOwnerId = "p1";
    profileIsPrivate = false;
  });

  it("invalid/unverifiable bearer is rejected and not treated as anonymous (no IP fallback)", async () => {
    authResultOverride = { ok: false, mode: "bearer", reason: "invalid_bearer", errorName: "AuthSessionMissingError", errorStatus: 400 };
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer bad-token" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res.status).toBe(401);
    expect(rateLimitCalls).toHaveLength(0);
  });

  it("anonymous profile requests use IP-based rate limit key", async () => {
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks"), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res.status).toBe(200);
    expect(rateLimitCalls).toHaveLength(1);
    expect(rateLimitCalls[0].identifier).toBe("ip:127.0.0.1");
    expect(rateLimitCalls[0].endpoint).toBe("/api/profile/[username]");
  });

  it("authenticated profile requests use user-based rate limit key", async () => {
    verifiedUserId = "u-viewer";
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer valid-token" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res.status).toBe(200);
    expect(rateLimitCalls).toHaveLength(1);
    expect(rateLimitCalls[0].identifier).toBe("user:u-viewer");
    expect(rateLimitCalls[0].endpoint).toBe("/api/profile/[username]");
  });

  it("anonymous requests from same IP share rate limit bucket", async () => {
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    allow = false;
    const res1 = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks"), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res1.status).toBe(429);
    const res2 = await mod.GET(new NextRequest("http://localhost/api/profile/otheruser"), { params: Promise.resolve({ username: "otheruser" }) } as any);
    expect(res2.status).toBe(429);
    expect(rateLimitCalls).toHaveLength(2);
    expect(rateLimitCalls[0].identifier).toBe("ip:127.0.0.1");
    expect(rateLimitCalls[1].identifier).toBe("ip:127.0.0.1");
  });

  it("authenticated requests from different users have separate rate limit buckets", async () => {
    verifiedUserId = "u-viewer";
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    allow = false;
    const res1 = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer token-user1" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res1.status).toBe(429);
    verifiedUserId = "u-viewer2";
    const mod2 = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res2 = await mod2.GET(new NextRequest("http://localhost/api/profile/otheruser", { headers: { authorization: "Bearer token-user2" } }), { params: Promise.resolve({ username: "otheruser" }) } as any);
    expect(res2.status).toBe(429);
    expect(rateLimitCalls).toHaveLength(2);
    expect(rateLimitCalls[0].identifier).toBe("user:u-viewer");
    expect(rateLimitCalls[1].identifier).toBe("user:u-viewer2");
  });

  it("legitimate authenticated navigation does not trigger 429 under normal limits", async () => {
    verifiedUserId = "u-viewer";
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    for (let i = 0; i < 10; i++) {
      const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer valid-token" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
      expect(res.status).toBe(200);
    }
    expect(rateLimitCalls).toHaveLength(10);
    expect(rateLimitCalls.every(c => c.identifier === "user:u-viewer")).toBe(true);
  });

  it("private profile returns 403 for anonymous viewer", async () => {
    profileIsPrivate = true;
    profileError = "forbidden";
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/privateuser"), { params: Promise.resolve({ username: "privateuser" }) } as any);
    expect(res.status).toBe(403);
  });

  it("public profile returns 200 for anonymous viewer", async () => {
    profileIsPrivate = false;
    profileError = null;
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks"), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile?.username).toBe("blueybarks");
  });

  it("public profile returns 200 for authenticated viewer", async () => {
    profileIsPrivate = false;
    profileError = null;
    verifiedUserId = "u-viewer";
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer valid-token" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res.status).toBe(200);
  });

  it("private profile returns 403 for unauthorised authenticated viewer", async () => {
    profileIsPrivate = true;
    profileError = "forbidden";
    verifiedUserId = "u-other";
    profileOwnerId = "u-owner";
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/privateuser", { headers: { authorization: "Bearer valid-token" } }), { params: Promise.resolve({ username: "privateuser" }) } as any);
    expect(res.status).toBe(403);
  });

it("private profile returns 200 for owner", async () => {
    profileIsPrivate = true;
    verifiedUserId = "u-owner";
    profileOwnerId = "u-owner";
    profileError = null;
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/privateuser", { headers: { authorization: "Bearer owner-token" } }), { params: Promise.resolve({ username: "privateuser" }) } as any);
    expect(res.status).toBe(200);
  });

  it("race condition: request without bearer token falls back to IP rate limiting (documenting pre-fix behavior)", async () => {
    // This test documents the behavior when a request arrives without a Bearer token.
    // The CLIENT FIX ensures the token is sent, so this should not happen in normal operation.
    // But if it does (e.g., session not yet restored), it uses IP-based rate limiting.
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks"), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res.status).toBe(200);
    expect(rateLimitCalls).toHaveLength(1);
    expect(rateLimitCalls[0].identifier).toBe("ip:127.0.0.1");
    expect(rateLimitCalls[0].endpoint).toBe("/api/profile/[username]");
  });

  it("rapid authenticated navigation stays well within rate limits (regression for request storm)", async () => {
    verifiedUserId = "u-viewer";
    const mod = (await import("@/app/api/profile/[username]/route")) as RouteModule;
    // Simulate rapid navigation: 50 requests in quick succession
    // Well within the 180/min limit for authenticated users
    for (let i = 0; i < 50; i++) {
      const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer valid-token" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
      expect(res.status).toBe(200);
    }
    expect(rateLimitCalls).toHaveLength(50);
    expect(rateLimitCalls.every(c => c.identifier === "user:u-viewer")).toBe(true);
  });
});
