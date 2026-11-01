import { describe, expect, it, vi } from "vitest";

const OWNER = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const REQUESTER = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";
const PATH = `${OWNER}/1234567890-0.png`;
const SIGNED = "https://example.supabase.co/storage/v1/object/sign/media_private/signed.png?token=abc";

function makeChain<T>(row: T | null) {
  return {
    select: () => makeChain(row),
    eq: () => makeChain(row),
    or: () => makeChain(row),
    maybeSingle: () => ({ data: row, error: null }),
  };
}

function makeSupabase(user: { id: string } | null, db: Record<string, any> = {}, signedUrl = SIGNED) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : new Error("no user") }),
    },
    from: (table: string) => makeChain(db[table] ?? null),
    storage: {
      from: () => ({
        createSignedUrl: async () => ({ data: { signedUrl }, error: null }),
      }),
    },
  };
}

let current: { supabase: any; db: Record<string, any> } = { supabase: null, db: {} };

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => current.supabase,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => current.supabase,
}));

async function runRoute(body: unknown, user: { id: string } | null = { id: REQUESTER }, db: Record<string, any> = {}) {
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const { POST } = await import("@/app/api/media/signed-url/route");
  const req = new Request("http://localhost/api/media/signed-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as Request);
}

describe("signed-url route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runRoute({ path: PATH }, null);
    expect(res.status).toBe(401);
  });

  it("rejects missing path", async () => {
    const res = await runRoute({}, { id: REQUESTER });
    expect(res.status).toBe(400);
  });

  it("rejects invalid path segments", async () => {
    const res = await runRoute({ path: "../etc/passwd" }, { id: REQUESTER });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown media", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, { media: null });
    expect(res.status).toBe(404);
  });

  it("allows the owner to access their own media", async () => {
    const res = await runRoute({ path: PATH }, { id: OWNER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signedUrl).toBeTruthy();
  });

  it("allows public media access to anyone not blocked", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
      profiles: { id: OWNER, is_private: false },
    });
    expect(res.status).toBe(200);
  });

  it("denies access to a private profile with no follow relationship", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
      profiles: { id: OWNER, is_private: true },
      follows: null,
    });
    expect(res.status).toBe(403);
  });

  it("denies pending followers of a private profile", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
      profiles: { id: OWNER, is_private: true },
      follows: { status: "pending" },
    });
    expect(res.status).toBe(403);
  });

  it("denies rejected followers of a private profile", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
      profiles: { id: OWNER, is_private: true },
      follows: { status: "rejected" },
    });
    expect(res.status).toBe(403);
  });

  it("allows accepted followers of a private profile", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
      profiles: { id: OWNER, is_private: true },
      follows: { status: "accepted" },
    });
    expect(res.status).toBe(200);
  });

  it("denies access when the requester has blocked the owner", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
      profiles: { id: OWNER, is_private: false },
      blocks: { blocker_id: REQUESTER, blocked_id: OWNER },
    });
    expect(res.status).toBe(403);
  });

  it("denies access when the owner has blocked the requester", async () => {
    const res = await runRoute({ path: PATH }, { id: REQUESTER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
      profiles: { id: OWNER, is_private: false },
      blocks: { blocker_id: OWNER, blocked_id: REQUESTER },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a mismatched bucket", async () => {
    const res = await runRoute({ path: PATH, bucket: "media" }, { id: OWNER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
    });
    expect(res.status).toBe(403);
  });

  it("clamps expiresInSeconds to the allowed range", async () => {
    const res = await runRoute({ path: PATH, expiresInSeconds: 1 }, { id: OWNER }, {
      media: { id: "m1", storage_path: PATH, bucket_id: "media_private", owner_id: OWNER, media_type: "image" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.expiresInSeconds).toBeGreaterThanOrEqual(60);
  });
});