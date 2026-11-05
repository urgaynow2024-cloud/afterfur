import { describe, expect, it, vi } from "vitest";

const ME = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const OTHER = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";

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
    maybeSingle: () => ({ data: singleRow ?? (filtered.length ? filtered[0] : null), error: null }),
    single: () => ({ data: singleRow ?? (filtered.length ? filtered[0] : null), error: null }),
    in: () => makeChain(filtered, singleRow),
    order: () => makeChain(filtered, singleRow),
    insert: (row: any) => {
      const inserted = { ...row, id: "req-" + Math.random().toString(36).slice(2), created_at: new Date().toISOString() };
      filtered = [...filtered, inserted];
      return makeChain(filtered, inserted);
    },
    update: (patch: any) => {
      filtered = filtered.map((r) => ({ ...r, ...patch }));
      return makeChain(filtered, singleRow);
    },
  };
  chain.then = (resolve: any) => resolve({ data: filtered, error: null });
  return chain;
}

function makeSupabase(user: { id: string } | null, db: Record<string, any> = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : new Error("no user") }),
    },
    from: (table: string) => makeChain(db[table] ?? null, db[table + "_single"] ?? null),
    rpc: async (_name: string, _args: any) => ({ data: "conv-" + Math.random().toString(36).slice(2), error: null }),
  };
}

let current: { supabase: any; db: Record<string, any> } = { supabase: null, db: {} };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => current.supabase,
}));

async function runRequestsRoute(method: "GET" | "POST", body: unknown = null, user: { id: string } | null = { id: ME }, db: Record<string, any> = {}) {
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const mod = await import("@/app/api/messages/requests/route");
  const req = new Request("http://localhost/api/messages/requests", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (method === "GET") return (mod.GET as any)(req as Request);
  return (mod.POST as any)(req as Request);
}

async function runRequestActionRoute(id: string, action: string, user: { id: string } | null = { id: OTHER }, db: Record<string, any> = {}) {
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const mod = await import("@/app/api/messages/requests/[id]/route");
  const req = new Request(`http://localhost/api/messages/requests/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return (mod.POST as any)(req as Request, { params: Promise.resolve({ id }) });
}

describe("message requests GET route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runRequestsRoute("GET", null, null);
    expect(res.status).toBe(401);
  });

  it("returns empty incoming and outgoing when no requests", async () => {
    const res = await runRequestsRoute("GET", null, { id: ME }, {});
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.incoming).toEqual([]);
    expect(json.outgoing).toEqual([]);
  });

  it("returns incoming and outgoing requests with profiles", async () => {
    const res = await runRequestsRoute("GET", null, { id: ME }, {
      message_requests: [
        { id: "r1", from_user_id: OTHER, to_user_id: ME, status: "pending", created_at: "2024-01-01T00:00:00Z" },
        { id: "r2", from_user_id: ME, to_user_id: OTHER, status: "pending", created_at: "2024-01-02T00:00:00Z" },
      ],
      profiles: [
        { id: OTHER, username: "otheruser", display_name: "Other", avatar_url: null },
      ],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.incoming.length).toBe(1);
    expect(json.incoming[0].from_user_id).toBe(OTHER);
    expect(json.outgoing.length).toBe(1);
    expect(json.outgoing[0].to_user_id).toBe(OTHER);
  });
});

describe("message requests POST route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runRequestsRoute("POST", { toUserId: OTHER }, null);
    expect(res.status).toBe(401);
  });

  it("rejects missing toUserId", async () => {
    const res = await runRequestsRoute("POST", {}, { id: ME });
    expect(res.status).toBe(400);
  });

  it("rejects self message", async () => {
    const res = await runRequestsRoute("POST", { toUserId: ME }, { id: ME });
    expect(res.status).toBe(400);
  });

  it("denies when requester has blocked recipient", async () => {
    const res = await runRequestsRoute("POST", { toUserId: OTHER }, { id: ME }, {
      blocks: [{ blocker_id: ME, blocked_id: OTHER }],
    });
    expect(res.status).toBe(403);
  });

  it("denies when recipient has blocked requester", async () => {
    const res = await runRequestsRoute("POST", { toUserId: OTHER }, { id: ME }, {
      blocks: [{ blocker_id: OTHER, blocked_id: ME }],
    });
    expect(res.status).toBe(403);
  });

  it("returns 409 when request already exists", async () => {
    const res = await runRequestsRoute("POST", { toUserId: OTHER }, { id: ME }, {
      message_requests: [{ id: "r1", from_user_id: ME, to_user_id: OTHER, status: "pending" }],
    });
    expect(res.status).toBe(409);
  });

  it("creates a pending message request", async () => {
    const res = await runRequestsRoute("POST", { toUserId: OTHER }, { id: ME }, {});
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.request.from_user_id).toBe(ME);
    expect(json.request.to_user_id).toBe(OTHER);
    expect(json.request.status).toBe("pending");
  });
});

describe("message request action route", () => {
  it("returns 404 for unknown request", async () => {
    const res = await runRequestActionRoute("nope", "accept", { id: OTHER }, { message_requests_single: null });
    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not the recipient", async () => {
    const res = await runRequestActionRoute("r1", "reject", { id: ME }, {
      message_requests_single: { id: "r1", from_user_id: ME, to_user_id: OTHER, status: "pending" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects a pending request", async () => {
    const res = await runRequestActionRoute("r1", "reject", { id: OTHER }, {
      message_requests_single: { id: "r1", from_user_id: ME, to_user_id: OTHER, status: "pending" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("accepts a pending request and creates a conversation", async () => {
    const res = await runRequestActionRoute("r1", "accept", { id: OTHER }, {
      message_requests_single: { id: "r1", from_user_id: ME, to_user_id: OTHER, status: "pending" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.conversationId).toBeTruthy();
  });

  it("returns 400 for invalid action", async () => {
    const res = await runRequestActionRoute("r1", "ignore", { id: OTHER }, {
      message_requests_single: { id: "r1", from_user_id: ME, to_user_id: OTHER, status: "pending" },
    });
    expect(res.status).toBe(400);
  });
});
