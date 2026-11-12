import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetVerifiedUser = vi.fn();
const mockRpc = vi.fn();

let mockClient: any = null;

vi.mock("@/lib/serverAuth", () => ({
  getVerifiedUser: (...args: any[]) => mockGetVerifiedUser(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => mockClient,
}));

const mockRateLimit = vi.fn(async (_id: string, _ep: string, _l: number, _w: number) => ({ allowed: true as const }));
vi.mock("@/lib/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rateLimit")>();
  return {
    ...actual,
    rateLimit: (...args: any[]) => (mockRateLimit as any)(...args),
  };
});

const TEST_PATH = "user-1/1234567890-0.png";
const SIGNED = "https://example.supabase.co/storage/v1/object/sign/media_private/signed.png?token=abc";

function makeChainForTable(table: string, db: Record<string, any>) {
  // Support table-specific overrides: db._blocksRows for blocks array, db._postRows for posts array
  const resolve = () => {
    if (table === "blocks" && Array.isArray(db._blocksRows)) return { data: db._blocksRows, error: db._blocksError ?? null };
    if (table === "posts" && Array.isArray(db._postRows)) return { data: db._postRows, error: db._postsError ?? null };
    return { data: db[table] ?? null, error: db[`_${table}Error`] ?? null };
  };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    filter: () => chain,
    or: () => chain,
    in: () => chain,
    limit: () => chain,
    maybeSingle: () => resolve(),
    single: () => resolve(),
    then: (resolveP: any, rejectP: any) => Promise.resolve(resolve()).then(resolveP, rejectP),
  };
  return chain;
}

function makeStorage(bucket: string) {
  return {
    from: (b: string) => {
      if (b !== bucket) throw new Error(`Unexpected bucket: ${b}`);
      return {
        createSignedUrl: async () => ({ data: { signedUrl: SIGNED }, error: null }),
      };
    },
  };
}

async function runRoute(body: unknown, user: { id: string } | null = { id: "user-1" }, db: Record<string, any> = {}) {
  mockGetVerifiedUser.mockResolvedValue(user);
  mockClient = {
    rpc: async (fn: string, _params: any) => {
      if (fn === "is_user_enforced") return mockRpc(_params);
      return { data: null, error: null };
    },
    from: (table: string) => makeChainForTable(table, db),
    storage: makeStorage("media_private"),
  };
  const { POST } = await import("@/app/api/media/signed-url/route");
  const req = new Request("http://localhost/api/media/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as Request);
}

describe("POST /api/media/signed-url — authorization (Phase 5.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetVerifiedUser.mockReset();
    mockRpc.mockReset();
    mockClient = null;
    mockRateLimit.mockResolvedValue({ allowed: true as const });
    mockGetVerifiedUser.mockResolvedValue({ id: "user-1", email: "user-1@example.com", app_metadata: {}, user_metadata: {} });
    mockRpc.mockResolvedValue({ data: false, error: null }); // is_user_enforced = not banned
  });

  it("rejects unauthenticated requests", async () => {
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, null);
    expect(res!.status).toBe(401);
  });

  it("allows signed URL for SFW post media (authenticated)", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: "SFW" }],
      _blocksRows: [],
    };
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, db);
    expect(res!.status).toBe(200);
    expect((await res!.json()).signedUrl).toBe(SIGNED);
  });

  it("allows authenticated user to view permitted NSFW media (no ad_creator required for viewing)", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: "NSFW" }],
      _blocksRows: [],
    };
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, db);
    expect(res!.status).toBe(200);
  });

  it("denies unclassified (NULL) media classification safely", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: null }],
      _blocksRows: [],
    };
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, db);
    expect(res!.status).toBe(403);
  });

  it("denies when no associated post classification is found (safe default for private signed URL)", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [],
      _blocksRows: [],
    };
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, db);
    expect(res!.status).toBe(403);
  });

  it("denies banned user even for SFW media", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: "SFW" }],
      _blocksRows: [],
    };
    mockRpc.mockResolvedValue({ data: true, error: null });
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "banned-user" }, db);
    expect(res!.status).toBe(403);
  });

  it("rejects path traversal attempts", async () => {
    const res = await runRoute({ path: "user-1/../../etc/passwd", bucket: "media_private" });
    expect(res!.status).toBe(400);
  });

  it("rejects empty path segments / dot segments", async () => {
    expect((await runRoute({ path: "user-1//file.png", bucket: "media_private" }))!.status).toBe(400);
    expect((await runRoute({ path: "user-1/../file.png", bucket: "media_private" }))!.status).toBe(400);
    expect((await runRoute({ path: "user-1/./file.png", bucket: "media_private" }))!.status).toBe(400);
  });

  it("rejects bucket mismatch", async () => {
    const db = { media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" } };
    const res = await runRoute({ path: TEST_PATH, bucket: "media" }, { id: "user-1" }, db);
    expect(res!.status).toBe(403);
  });

  it("rejects non-existent media (no arbitrary path signing)", async () => {
    const res = await runRoute({ path: "user-1/nonexistent.png", bucket: "media_private" }, { id: "user-1" }, {});
    expect(res!.status).toBe(404);
  });

  it("enforces private profile: non-follower denied, accepted follower allowed, owner allowed", async () => {
    const base = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: true },
      _postRows: [{ id: "post-1", classification: "SFW" }],
      _blocksRows: [],
    };
    expect((await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, { ...base, follows: null }))!.status).toBe(403);
    expect((await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, { ...base, follows: { status: "accepted" } }))!.status).toBe(200);
    expect((await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-1" }, { ...base, follows: null }))!.status).toBe(200);
  });

  it("rejects when requester is blocked by owner (direction 1)", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: "SFW" }],
      _blocksRows: [{ blocker_id: "user-1", blocked_id: "user-2" }],
    };
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, db);
    expect(res!.status).toBe(403);
  });

  it("rejects when requester has blocked owner (direction 2)", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: "SFW" }],
      _blocksRows: [{ blocker_id: "user-2", blocked_id: "user-1" }],
    };
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-2" }, db);
    expect(res!.status).toBe(403);
  });

  it("does not block unrelated users when scoped block query returns no pair match", async () => {
    // The route queries only the (requester,owner) pair; returning empty means no block between them.
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: "SFW" }],
      _blocksRows: [], // unrelated blocks exist elsewhere in reality, but scoped query returns none
    };
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-3" }, db);
    expect(res!.status).toBe(200);
  });

  it("clamps expiresInSeconds to 60-3600 range", async () => {
    const db = {
      media: { id: "media-1", storage_path: TEST_PATH, bucket_id: "media_private", owner_id: "user-1", media_type: "image" },
      profiles: { id: "user-1", is_private: false },
      _postRows: [{ id: "post-1", classification: "SFW" }],
      _blocksRows: [],
    };
    const low = await runRoute({ path: TEST_PATH, bucket: "media_private", expiresInSeconds: 10 }, { id: "user-1" }, db);
    expect((await low!.json()).expiresInSeconds).toBe(60);
    const high = await runRoute({ path: TEST_PATH, bucket: "media_private", expiresInSeconds: 10000 }, { id: "user-1" }, db);
    expect((await high!.json()).expiresInSeconds).toBe(3600);
  });

  it("enforces rate limiting", async () => {
    mockRateLimit.mockResolvedValueOnce({ allowed: false, response: new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }) } as any);
    const res = await runRoute({ path: TEST_PATH, bucket: "media_private" }, { id: "user-1" }, {});
    expect(res!.status).toBe(429);
  });
});
