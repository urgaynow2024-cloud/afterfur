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
    maybeSingle: () => ({ data: filtered.length ? filtered[0] : null, error: null }),
    single: () => ({ data: filtered.length ? filtered[0] : null, error: null }),
    in: () => makeChain(filtered, singleRow),
    order: () => makeChain(filtered, singleRow),
    insert: (row: any) => {
      const inserted = { ...row, id: "ra-" + Math.random().toString(36).slice(2) };
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

function makeSupabase(user: { id: string } | null, db: Record<string, any> = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: user ? null : new Error("no user") }),
    },
    from: (table: string) => makeChain(db[table] ?? null, db[table + "_single"] ?? null),
    rpc: async (_name: string, _args: any) => ({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: "uploaded" }, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "https://example.com/signed" }, error: null }),
      }),
    },
  };
}

let current: { supabase: any; db: Record<string, any> } = { supabase: null, db: {} };

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => current.supabase,
}));

async function runReadReceiptsRoute(body: unknown, user: { id: string } | null = { id: ME }, db: Record<string, any> = {}) {
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const { POST } = await import("@/app/api/messages/read-receipts/route");
  const req = new Request("http://localhost/api/messages/read-receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as Request);
}

async function runAttachmentsRoute(body: unknown, user: { id: string } | null = { id: ME }, db: Record<string, any> = {}) {
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const { POST } = await import("@/app/api/messages/attachments/route");
  const req = new Request("http://localhost/api/messages/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as Request);
}

async function runSignedUrlRoute(query: string, user: { id: string } | null = { id: ME }, db: Record<string, any> = {}) {
  current.supabase = makeSupabase(user, db);
  current.db = db;
  const { GET } = await import("@/app/api/messages/attachments/signed-url/route");
  const req = new Request(`http://localhost/api/messages/attachments/signed-url?${query}`);
  return GET(req as Request);
}

describe("read-receipts route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runReadReceiptsRoute({ conversationId: "c1", messageIds: ["m1"] }, null);
    expect(res.status).toBe(401);
  });

  it("rejects missing conversationId", async () => {
    const res = await runReadReceiptsRoute({ messageIds: ["m1"] }, { id: ME });
    expect(res.status).toBe(400);
  });

  it("rejects empty messageIds", async () => {
    const res = await runReadReceiptsRoute({ conversationId: "c1", messageIds: [] }, { id: ME });
    expect(res.status).toBe(400);
  });

  it("denies non-member", async () => {
    const res = await runReadReceiptsRoute({ conversationId: "c1", messageIds: ["m1"] }, { id: ME }, {
      conversation_participants_single: null,
    });
    expect(res.status).toBe(403);
  });

  it("marks messages as read for a member", async () => {
    const res = await runReadReceiptsRoute({ conversationId: "c1", messageIds: ["m1", "m2"] }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

describe("attachments route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runAttachmentsRoute({ messageId: "m1", conversationId: "c1", storagePath: "u1/file.png" }, null);
    expect(res.status).toBe(401);
  });

  it("rejects missing fields", async () => {
    const res = await runAttachmentsRoute({}, { id: ME });
    expect(res.status).toBe(400);
  });

  it("denies non-member", async () => {
    const res = await runAttachmentsRoute({ messageId: "m1", conversationId: "c1", storagePath: "u1/file.png" }, { id: ME }, {
      conversation_participants_single: null,
    });
    expect(res.status).toBe(403);
  });

  it("denies unknown message", async () => {
    const res = await runAttachmentsRoute({ messageId: "m1", conversationId: "c1", storagePath: "u1/file.png" }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
      messages_single: null,
    });
    expect(res.status).toBe(404);
  });

  it("denies message in different conversation", async () => {
    const res = await runAttachmentsRoute({ messageId: "m1", conversationId: "c1", storagePath: "u1/file.png" }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
      messages_single: { id: "m1", conversation_id: "c2", sender_id: ME },
    });
    expect(res.status).toBe(404);
  });

  it("rejects invalid storage path", async () => {
    const res = await runAttachmentsRoute({ messageId: "m1", conversationId: "c1", storagePath: "../etc/passwd" }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
      messages_single: { id: "m1", conversation_id: "c1", sender_id: ME },
    });
    expect(res.status).toBe(400);
  });

  it("rejects oversized file", async () => {
    const res = await runAttachmentsRoute({
      messageId: "m1", conversationId: "c1", storagePath: "u1/file.png", mediaType: "image/png", fileSize: 100 * 1024 * 1024,
    }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
      messages_single: { id: "m1", conversation_id: "c1", sender_id: ME },
    });
    expect(res.status).toBe(400);
  });

  it("registers an attachment successfully", async () => {
    const res = await runAttachmentsRoute({
      messageId: "m1", conversationId: "c1", storagePath: "u1/file.png", mediaType: "image/png", fileSize: 1024,
    }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
      messages_single: { id: "m1", conversation_id: "c1", sender_id: ME },
      message_attachments: [],
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.attachment.message_id).toBe("m1");
    expect(json.attachment.storage_path).toBe("u1/file.png");
  });

  it("rejects duplicate attachment", async () => {
    const res = await runAttachmentsRoute({
      messageId: "m1", conversationId: "c1", storagePath: "u1/file.png", mediaType: "image/png", fileSize: 1024,
    }, { id: ME }, {
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
      messages_single: { id: "m1", conversation_id: "c1", sender_id: ME },
      message_attachments: [{ id: "a1", storage_path: "u1/file.png", bucket_id: "message_attachments" }],
    });
    expect(res.status).toBe(409);
  });
});

describe("attachments signed-url route", () => {
  it("rejects unauthenticated access", async () => {
    const res = await runSignedUrlRoute("path=u1/file.png", null);
    expect(res.status).toBe(401);
  });

  it("rejects missing path", async () => {
    const res = await runSignedUrlRoute("", { id: ME });
    expect(res.status).toBe(400);
  });

  it("denies unknown attachment", async () => {
    const res = await runSignedUrlRoute("path=u1/file.png", { id: ME }, {
      message_attachments_single: null,
    });
    expect(res.status).toBe(404);
  });

  it("denies non-member", async () => {
    const res = await runSignedUrlRoute("path=u1/file.png", { id: ME }, {
      message_attachments_single: { conversation_id: "c1", uploader_id: OTHER, storage_path: "u1/file.png", bucket_id: "message_attachments" },
      conversation_participants_single: null,
    });
    expect(res.status).toBe(403);
  });

  it("returns signed URL for a member", async () => {
    const res = await runSignedUrlRoute("path=u1/file.png", { id: ME }, {
      message_attachments_single: { conversation_id: "c1", uploader_id: OTHER, storage_path: "u1/file.png", bucket_id: "message_attachments", media_type: "image/png" },
      conversation_participants_single: { user_id: ME, conversation_id: "c1" },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.signedUrl).toBeTruthy();
    expect(json.path).toBe("u1/file.png");
  });
});
