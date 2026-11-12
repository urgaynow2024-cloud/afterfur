import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockCreateServerClient = vi.fn(() => ({ auth: { getUser: mockGetUser } }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockCreateServerClient(),
}));

function makeJwt(payload: Record<string, unknown>) {
  const enc = (obj: any) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.sig`;
}

describe("serverAuth.verifyRequestAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockCreateServerClient.mockReset();
    mockCreateServerClient.mockReturnValue({ auth: { getUser: mockGetUser } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projref.supabase.co";
  });

  it("treats missing bearer as anonymous (no bearer supplied)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    const res = await verifyRequestAuth(new Request("http://x"));
    expect(res).toEqual({ ok: false, mode: "anonymous", reason: "no_bearer" });
  });

  it("verifies valid explicit JWT successfully", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.c", app_metadata: { afterfur_staff_admin: true }, user_metadata: {} } }, error: null });
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    const jwt = makeJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600, iss: "https://projref.supabase.co/auth/v1", aud: "authenticated" });
    const res = await verifyRequestAuth(new Request("http://x", { headers: { authorization: `Bearer ${jwt}` } }));
    expect(mockGetUser).toHaveBeenCalledWith(jwt);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user.id).toBe("u1");
  });

  it("rejects invalid bearer (AuthSessionMissingError/session_not_found) and does not become anonymous", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400, message: "Auth session missing!", code: "session_not_found" } });
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    const jwt = makeJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600, iss: "https://projref.supabase.co/auth/v1", aud: "authenticated" });
    const res = await verifyRequestAuth(new Request("http://x", { headers: { authorization: `Bearer ${jwt}` } }));
    expect(mockGetUser).toHaveBeenCalledWith(jwt);
    expect(res.ok).toBe(false);
    if (!res.ok && res.mode === "bearer") {
      expect(res.reason).toBe("invalid_bearer");
      expect(res.errorName).toBe("AuthSessionMissingError");
    } else {
      throw new Error("expected bearer invalid_bearer result");
    }
  });

  it("classifies retryable/network verification errors as verification_unavailable", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 0, message: "fetch failed" } });
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    const jwt = makeJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600, iss: "https://projref.supabase.co/auth/v1", aud: "authenticated" });
    const res = await verifyRequestAuth(new Request("http://x", { headers: { authorization: `Bearer ${jwt}` } }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.mode).toBe("bearer");
      expect(res.reason).toBe("verification_unavailable");
    }
  });
});
