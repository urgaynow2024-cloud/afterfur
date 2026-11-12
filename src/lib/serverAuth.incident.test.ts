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

describe("serverAuth.verifyRequestAuth regressions", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetUser.mockReset();
    mockCreateServerClient.mockReset();
    mockCreateServerClient.mockReturnValue({ auth: { getUser: mockGetUser } });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projref.supabase.co";
  });

  it("rejects explicit bearer when Supabase reports expired/invalid JWT (does not become anonymous)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthApiError", status: 401, code: "bad_jwt", message: "JWT expired" } });
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    const jwt = makeJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) - 10, iss: "https://projref.supabase.co/auth/v1", aud: "authenticated" });
    const res = await verifyRequestAuth(new Request("http://x", { headers: { authorization: `Bearer ${jwt}` } }));
    expect(mockGetUser).toHaveBeenCalledWith(jwt);
    expect(res).toMatchObject({ ok: false, mode: "bearer", reason: "invalid_bearer" });
  });

  it("rejects explicit bearer for wrong-project/session_not_found as diagnosed AuthSessionMissingError case", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400, code: "session_not_found", message: "Auth session missing!" } });
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    const jwt = makeJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600, iss: "https://otherref.supabase.co/auth/v1", aud: "authenticated" });
    const res = await verifyRequestAuth(new Request("http://x", { headers: { authorization: `Bearer ${jwt}` } }));
    expect(res).toMatchObject({ ok: false, mode: "bearer", reason: "invalid_bearer", errorName: "AuthSessionMissingError" });
  });

  it("never returns identity for a bearer request when verification fails (no A/B identity substitution)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400, code: "session_not_found" } });
    const { verifyRequestAuth } = await import("@/lib/serverAuth");
    const jwtA = makeJwt({ sub: "user-A", exp: Math.floor(Date.now() / 1000) + 3600, iss: "https://projref.supabase.co/auth/v1", aud: "authenticated" });
    const res = await verifyRequestAuth(new Request("http://x", { headers: { authorization: `Bearer ${jwtA}` } }));
    expect(res.ok).toBe(false);
    // must not trust decoded sub without verified user
    if (res.ok) throw new Error("should not verify");
  });
});
