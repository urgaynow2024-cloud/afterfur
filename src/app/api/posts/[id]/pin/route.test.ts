import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetVerifiedUser = vi.fn();
const mockRateLimit = vi.fn(async () => ({ allowed: true as const }));

vi.mock("@/lib/serverAuth", () => ({
  getVerifiedUser: (...args: any[]) => mockGetVerifiedUser(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockClient,
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: (...args: any[]) => (mockRateLimit as any)(...args),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: (o: any) => (o?.userId ? `user:${o.userId}` : `ip:${o?.ip || "unknown"}`),
}));

let mockClient: any = null;

// Minimal Supabase chain tailored to the pin route:
//   from("posts").select("id,author_id").eq("id", id).maybeSingle()   -> requireOwner
//   from("posts").update({...}).eq(...).eq(...)                       -> unpin existing
//   from("posts").update({...}).eq("id", id).eq("author_id", v).select(...).single() -> pin target
function makeChain(capturedUpdates: any[], resolver: (kind: string, payload: any, eqs: [string, any][]) => any) {
  let kind = "";
  let payload: any = null;
  const eqs: [string, any][] = [];
  const chain: any = {
    capturedUpdates,
    select: (...args: any[]) => { kind = "select"; payload = args[0]; return chain; },
    update: (p: any) => { kind = "update"; payload = p; capturedUpdates.push(p); return chain; },
    eq: (col: any, val: any) => { eqs.push([col, val]); return chain; },
    or: () => chain,
    filter: () => chain,
    in: () => chain,
    limit: () => chain,
    maybeSingle: () => resolver(kind, payload, eqs),
    single: () => resolver(kind, payload, eqs),
    then: (resolveP: any) => Promise.resolve(resolver(kind, payload, eqs)).then(resolveP),
  };
  return chain;
}

async function runPin(
  method: "POST" | "DELETE",
  postId: string,
  resolver: (kind: string, payload: any, eqs: [string, any][]) => any = () => ({ data: { id: postId, author_id: "owner-1" }, error: null }),
) {
  const capturedUpdates: any[] = [];
  mockClient = { from: () => makeChain(capturedUpdates, resolver) };
  const { POST, DELETE } = await import("@/app/api/posts/[id]/pin/route");
  const req = new Request(`http://localhost/api/posts/${encodeURIComponent(postId)}/pin`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify({}) : undefined,
  });
  const fn = method === "POST" ? POST : DELETE;
  return { res: await fn(req as Request, { params: Promise.resolve({ id: postId }) }), capturedUpdates };
}

const ownerUser = { id: "owner-1", email: "owner-1@example.com", app_metadata: {}, user_metadata: {} };

describe("POST /api/posts/[id]/pin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVerifiedUser.mockReset();
    mockRateLimit.mockReset();
    mockClient = null;
    mockRateLimit.mockResolvedValue({ allowed: true as const });
  });

  it("rejects unauthenticated requests", async () => {
    mockGetVerifiedUser.mockResolvedValue(null);
    const { res } = await runPin("POST", "post-1");
    expect(res!.status).toBe(401);
  });

  it("rejects pinning another user's post", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    const resolver = () => ({ data: { id: "post-1", author_id: "other-owner" }, error: null });
    const { res } = await runPin("POST", "post-1", resolver);
    expect(res!.status).toBe(403);
  });

  it("returns 404 for a missing post", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    const resolver = () => ({ data: null, error: null });
    const { res } = await runPin("POST", "post-1", resolver);
    expect(res!.status).toBe(404);
  });

  it("pins the owner's post and returns is_pinned true", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    const resolver = () => ({ data: { id: "post-1", author_id: "owner-1", is_pinned: true, pinned_at: "2026-01-01T00:00:00.000Z" }, error: null });
    const { res, capturedUpdates } = await runPin("POST", "post-1", resolver);
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.post.is_pinned).toBe(true);
    const pinUpdate = capturedUpdates.find((u: any) => u && u.is_pinned === true);
    expect(pinUpdate).toBeTruthy();
    expect(typeof pinUpdate.pinned_at).toBe("string");
  });

  it("unpins the owner's pinned post", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    const resolver = () => ({ data: { id: "post-1", author_id: "owner-1" }, error: null });
    const { res, capturedUpdates } = await runPin("DELETE", "post-1", resolver);
    expect(res!.status).toBe(200);
    const body = await res!.json();
    expect(body.ok).toBe(true);
    const unpinUpdate = capturedUpdates.find((u: any) => u && u.is_pinned === false);
    expect(unpinUpdate).toBeTruthy();
    expect(unpinUpdate.pinned_at).toBe(null);
  });

  it("allows only one pinned post per author: pinning a second clears the first", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    const resolver = () => ({ data: { id: "post-2", author_id: "owner-1", is_pinned: true, pinned_at: "t2" }, error: null });
    const { res, capturedUpdates } = await runPin("POST", "post-2", resolver);
    expect(res!.status).toBe(200);
    const clears = capturedUpdates.filter((u: any) => u && u.is_pinned === false && u.pinned_at === null);
    expect(clears.length).toBeGreaterThanOrEqual(1);
  });

  it("applies rate limiting to pin requests", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    (mockRateLimit as any).mockResolvedValueOnce({ allowed: false, response: { status: 429, json: async () => ({ error: "rate_limited" }) } });
    const { res } = await runPin("POST", "post-1");
    expect(res!.status).toBe(429);
  });
});

describe("DELETE /api/posts/[id]/pin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVerifiedUser.mockReset();
    mockRateLimit.mockReset();
    mockClient = null;
    mockRateLimit.mockResolvedValue({ allowed: true as const });
  });

  it("rejects unauthenticated unpin", async () => {
    mockGetVerifiedUser.mockResolvedValue(null);
    const { res } = await runPin("DELETE", "post-1");
    expect(res!.status).toBe(401);
  });

  it("rejects unpinning another user's post", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    const resolver = () => ({ data: { id: "post-1", author_id: "other-owner" }, error: null });
    const { res } = await runPin("DELETE", "post-1", resolver);
    expect(res!.status).toBe(403);
  });

  it("returns 404 when unpinning a missing post", async () => {
    mockGetVerifiedUser.mockResolvedValue(ownerUser);
    const resolver = () => ({ data: null, error: null });
    const { res } = await runPin("DELETE", "post-1", resolver);
    expect(res!.status).toBe(404);
  });
});
