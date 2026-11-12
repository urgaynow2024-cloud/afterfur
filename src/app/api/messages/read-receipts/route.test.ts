import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: true })),
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: (o: any) => (o?.userId ? `user:${o.userId}` : `ip:${o?.ip || "unknown"}`),
}));

const ME = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const CONVERSATION_ID = "conv-1";

let authUser: any = { id: ME, email: "me@example.com", app_metadata: {}, user_metadata: {} };
vi.mock("@/lib/serverAuth", () => ({
  verifyRequestAuth: vi.fn(async () => authUser ? { ok: true, mode: "bearer", user: authUser } : { ok: false, mode: "anonymous", reason: "no_bearer" }),
  getVerifiedUser: vi.fn(async () => authUser),
}));

function makeChain(rows: any[] | null, singleRow: any | null = null) {
  let filtered: any[] = rows ?? (singleRow ? [singleRow] : []);
  const chain: any = {
    select: () => makeChain(rows, singleRow),
    eq: (key: string, value: any) => {
      filtered = filtered.filter((r: any) => r[key] === value);
      return makeChain(filtered, singleRow);
    },
    or: () => makeChain(filtered, singleRow),
    limit: () => makeChain(filtered, singleRow),
    maybeSingle: () => ({ data: filtered.length ? filtered[0] : singleRow, error: null }),
    single: () => ({ data: filtered.length ? filtered[0] : singleRow, error: null }),
    in: () => makeChain(filtered, singleRow),
    order: () => makeChain(filtered, singleRow),
    insert: (row: any) => {
      const inserted = { ...row, id: "rr-" + Math.random().toString(36).slice(2), read_at: new Date().toISOString() };
      filtered = [...filtered, inserted];
      return makeChain(filtered, inserted);
    },
    update: (patch: any) => {
      filtered = filtered.map((r) => ({ ...r, ...patch }));
      return makeChain(filtered, singleRow);
    },
    delete: () => makeChain([], null),
  };
  chain.then = (resolve: any) => resolve({ data: filtered, error: null });
  return chain;
}

function makeSupabase(_user: { id: string } | null, db: Record<string, any> = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: authUser }, error: authUser ? null : new Error("no user") }),
    },
    from: (table: string) => makeChain(db[table] ?? null, db[table + "_single"] ?? null),
    rpc: async (_name: string, _args: any) => ({ data: null, error: null }),
  };
}

let current: { supabase: any; db: Record<string, any> } = { supabase: null, db: {} };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => current.supabase,
}));

async function runReadReceiptsRoute(body: unknown, user: { id: string } | null = { id: ME }, db: Record<string, any> = {}) {
  authUser = user ? { ...user, app_metadata: {}, user_metadata: {} } : null;
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const { POST } = await import("@/app/api/messages/read-receipts/route");
  const req = new Request("http://localhost/api/messages/read-receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(user ? { authorization: "Bearer test" } : {}) },
    body: JSON.stringify(body),
  });
  return POST(req as Request);
}

describe("read-receipts route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runReadReceiptsRoute({ conversationId: CONVERSATION_ID, messageIds: ["m1"] }, null);
    expect(res!.status).toBe(401);
  });

  it("rejects missing conversationId", async () => {
    const res = await runReadReceiptsRoute({ messageIds: ["m1"] }, { id: ME });
    expect(res!.status).toBe(400);
  });

  it("rejects empty messageIds", async () => {
    const res = await runReadReceiptsRoute({ conversationId: CONVERSATION_ID, messageIds: [] }, { id: ME });
    expect(res!.status).toBe(400);
  });

  it("denies non-member", async () => {
    const res = await runReadReceiptsRoute({ conversationId: CONVERSATION_ID, messageIds: ["m1"] }, { id: ME }, {
      conversation_participants_single: null,
    });
    expect(res!.status).toBe(403);
  });

  it("marks messages as read for a member", async () => {
    const res = await runReadReceiptsRoute({ conversationId: CONVERSATION_ID, messageIds: ["m1", "m2"] }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: CONVERSATION_ID },
    });
    expect(res!.status).toBe(200);
    const json = await res!.json();
    expect(json.ok).toBe(true);
  });
});
