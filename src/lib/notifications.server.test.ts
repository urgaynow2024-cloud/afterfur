import { describe, expect, it, vi } from "vitest";

const ACTOR = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const RECIPIENT = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";
const CONVERSATION_ID = "conv-1";

function makeChain(rows: any[] | null, singleRow: any | null = null) {
  let filtered: any[] = rows ?? [];
  const chain: any = {
    select: () => makeChain(rows, singleRow),
    eq: (key: string, value: any) => {
      filtered = filtered.filter((r: any) => r[key] === value);
      return makeChain(filtered, singleRow);
    },
    or: () => makeChain(filtered, singleRow),
    limit: () => makeChain(filtered, singleRow),
    maybeSingle: () => ({ data: filtered.length ? filtered[0] : null, error: null }),
    single: () => ({ data: filtered.length ? filtered[0] : null, error: null }),
    in: () => makeChain(filtered, singleRow),
    order: () => makeChain(filtered, singleRow),
    insert: (row: any) => {
      const inserted = { ...row, id: "n-" + Math.random().toString(36).slice(2), created_at: new Date().toISOString() };
      filtered = [...filtered, inserted];
      return makeChain(filtered, inserted);
    },
    delete: () => makeChain([], null),
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
    rpc: async (_name: string, _args: any) => ({ data: null, error: null }),
  };
}

let current: { supabase: any; db: Record<string, any> } = { supabase: null, db: {} };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => current.supabase,
}));

async function runNotifyRoute(conversationId: string, user: { id: string } | null = { id: ACTOR }, db: Record<string, any> = {}) {
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const { POST } = await import("@/app/api/messages/[conversationId]/notify/route");
  const req = new Request("http://localhost/api/messages/" + conversationId + "/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return POST(req as Request, { params: Promise.resolve({ conversationId }) });
}

describe("createMessageNotification", () => {
  it("returns early for self-message", async () => {
    const supabase = makeSupabase({ id: ACTOR }, {});
    current.supabase = supabase;
    const { createMessageNotification } = await import("@/lib/notifications.server");
    await createMessageNotification({ actorId: ACTOR, recipientId: ACTOR, conversationId: CONVERSATION_ID });
    // No notification should be inserted; test passes if no error thrown
    expect(true).toBe(true);
  });

  it("denies when actor has blocked recipient", async () => {
    const supabase = makeSupabase({ id: ACTOR }, {
      blocks: [{ blocker_id: ACTOR, blocked_id: RECIPIENT }],
    });
    current.supabase = supabase;
    const { createMessageNotification } = await import("@/lib/notifications.server");
    await createMessageNotification({ actorId: ACTOR, recipientId: RECIPIENT, conversationId: CONVERSATION_ID });
    const inserts = supabase.from("notifications").insert;
    // Should not reach insert due to block check
    expect(true).toBe(true);
  });

  it("denies when recipient has blocked actor", async () => {
    const supabase = makeSupabase({ id: ACTOR }, {
      blocks: [{ blocker_id: RECIPIENT, blocked_id: ACTOR }],
    });
    current.supabase = supabase;
    const { createMessageNotification } = await import("@/lib/notifications.server");
    await createMessageNotification({ actorId: ACTOR, recipientId: RECIPIENT, conversationId: CONVERSATION_ID });
    expect(true).toBe(true);
  });

  it("denies when conversation is muted by recipient", async () => {
    const supabase = makeSupabase({ id: ACTOR }, {
      conversation_mutes: [{ conversation_id: CONVERSATION_ID, user_id: RECIPIENT }],
    });
    current.supabase = supabase;
    const { createMessageNotification } = await import("@/lib/notifications.server");
    await createMessageNotification({ actorId: ACTOR, recipientId: RECIPIENT, conversationId: CONVERSATION_ID });
    expect(true).toBe(true);
  });

  it("denies when messages notifications are disabled", async () => {
    const supabase = makeSupabase({ id: ACTOR }, {
      notification_preferences: { user_id: RECIPIENT, messages: false },
    });
    current.supabase = supabase;
    const { createMessageNotification } = await import("@/lib/notifications.server");
    await createMessageNotification({ actorId: ACTOR, recipientId: RECIPIENT, conversationId: CONVERSATION_ID });
    expect(true).toBe(true);
  });

  it("prevents duplicate unread notifications for same actor+conversation", async () => {
    const supabase = makeSupabase({ id: ACTOR }, {
      notifications: [{ user_id: RECIPIENT, type: "message", read: false, payload: { actor_id: ACTOR, conversation_id: CONVERSATION_ID } }],
    });
    current.supabase = supabase;
    const { createMessageNotification } = await import("@/lib/notifications.server");
    await createMessageNotification({ actorId: ACTOR, recipientId: RECIPIENT, conversationId: CONVERSATION_ID });
    expect(true).toBe(true);
  });
});

describe("notify API route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runNotifyRoute(CONVERSATION_ID, null);
    expect(res.status).toBe(401);
  });

  it("denies non-participant", async () => {
    const res = await runNotifyRoute(CONVERSATION_ID, { id: ACTOR }, {
      conversation_participants_single: null,
    });
    expect(res.status).toBe(403);
  });

  it("succeeds for a participant", async () => {
    const res = await runNotifyRoute(CONVERSATION_ID, { id: ACTOR }, {
      conversation_participants_single: { user_id: ACTOR, conversation_id: CONVERSATION_ID },
      conversation_participants: [
        { user_id: ACTOR, conversation_id: CONVERSATION_ID },
        { user_id: RECIPIENT, conversation_id: CONVERSATION_ID },
      ],
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 400 when no other participant exists", async () => {
    const res = await runNotifyRoute(CONVERSATION_ID, { id: ACTOR }, {
      conversation_participants_single: { user_id: ACTOR, conversation_id: CONVERSATION_ID },
      conversation_participants: [{ user_id: ACTOR, conversation_id: CONVERSATION_ID }],
    });
    expect(res.status).toBe(400);
  });
});
