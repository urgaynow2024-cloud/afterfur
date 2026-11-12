import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/moderation", () => ({
  requireModeratorRole: vi.fn(async (_role: string, req?: Request) => {
    const auth = req?.headers?.get("authorization");
    if (!auth) throw Object.assign(new Error("Authentication required."), { status: 401 });
    return { userId: "u-admin", role: "administrator", isAdministrator: true };
  }),
}));

let allow = true;
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => allow ? { allowed: true } : { allowed: false, response: new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "content-type": "application/json" } }) }),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: ({ userId, ip }: any) => userId ? `user:${userId}` : `ip:${ip}`,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "p1", username: "blueybarks", display_name: "Bluey", is_private: false } })) })) })) })),
  })),
}));

vi.mock("@/lib/serverAuth", () => ({
  verifyRequestAuth: vi.fn(async (req?: Request) => req?.headers?.get("authorization") ? { ok: true, mode: "bearer", user: { id: "u-admin", email: "a@example.com", app_metadata: {}, user_metadata: {} } } : { ok: false, mode: "anonymous", reason: "no_bearer" }),
  getVerifiedUser: vi.fn(async (req?: Request) => req?.headers?.get("authorization") ? { id: "u-admin", email: "a@example.com" } : null),
}));

vi.mock("@/lib/profiles.server", () => ({
  getProfileForViewer: vi.fn(async () => ({ profile: { id: "p1", username: "blueybarks", display_name: "Bluey" } })),
}));

describe("profile/moderation read endpoint rate limiting behavior", () => {
  beforeEach(() => { allow = true; });

  it("profile endpoint returns 401 when bearer is invalid/unverifiable (not anonymous fallback)", async () => {
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    (verifyRequestAuth as any).mockResolvedValueOnce({ ok: false, mode: "bearer", reason: "invalid_bearer", errorName: "AuthSessionMissingError" });
    const mod = await import("@/app/api/profile/[username]/route");
    allow = true;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer x" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res?.status ?? (res as any)?.status).toBe(401);
  });

  it("profile endpoint returns 429 response when rate limiter denies", async () => {
    const mod = await import("@/app/api/profile/[username]/route");
    allow = false;
    const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer x" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
    expect(res?.status ?? (res as any)?.status).toBe(429);
  });

  it("moderation/me returns 429 response when rate limiter denies", async () => {
    const mod = await import("@/app/api/moderation/me/route");
    allow = false;
    const res = await mod.GET(new NextRequest("http://localhost/api/moderation/me", { headers: { authorization: "Bearer x" } }));
    expect(res.status).toBe(429);
  });

  it("repeated allowed profile reads succeed (no request spam from handler logic)", async () => {
    const mod = await import("@/app/api/profile/[username]/route");
    for (let i = 0; i < 12; i++) {
      const res = await mod.GET(new NextRequest("http://localhost/api/profile/blueybarks", { headers: { authorization: "Bearer x" } }), { params: Promise.resolve({ username: "blueybarks" }) } as any);
      expect(res?.status ?? 200).toBe(200);
    }
  });
});
