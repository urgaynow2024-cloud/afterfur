/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeMemoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    _dump: () => Object.fromEntries(m.entries()),
  } as Storage & { _dump: () => Record<string, string> };
}

type MockSession = { access_token: string; refresh_token: string; user: { id: string; email?: string; user_metadata?: Record<string, unknown> } };

function makeMockClient(storageKey: string, opts?: { session?: MockSession | null; userOk?: boolean; refreshOk?: boolean }) {
  let session = opts?.session ?? null;
  const storage = (globalThis as any).localStorage as Storage;
  return {
    storageKey,
    auth: {
      getSession: vi.fn(async () => {
        if (session) storage.setItem(storageKey, JSON.stringify({ currentSession: session }));
        return { data: { session }, error: null };
      }),
      getUser: vi.fn(async () => ({ data: { user: opts?.userOk === false ? null : session?.user ?? null }, error: opts?.userOk === false ? { message: "invalid" } : null })),
      refreshSession: vi.fn(async () => {
        if (opts?.refreshOk === false) return { data: { session: null }, error: { message: "expired" } };
        if (session) session = { ...session, access_token: session.access_token + ".refreshed" };
        return { data: { session }, error: session ? null : { message: "no session" } };
      }),
      setSession: vi.fn(async (tokens: { access_token: string; refresh_token: string }) => {
        if (!session) session = { access_token: tokens.access_token, refresh_token: tokens.refresh_token, user: { id: storageKey.split(".").pop() || "u" } };
        session.access_token = tokens.access_token;
        session.refresh_token = tokens.refresh_token;
        storage.setItem(storageKey, JSON.stringify({ currentSession: session }));
        return { data: { session }, error: null };
      }),
      signInWithPassword: vi.fn(async ({ email }: { email: string; password: string }) => {
        const id = email.includes("b@") ? "uB" : "uA";
        session = { access_token: `at.${id}`, refresh_token: `rt.${id}`, user: { id, email, user_metadata: { username: id } } };
        storage.setItem(storageKey, JSON.stringify({ currentSession: session }));
        return { data: { session, user: session.user }, error: null };
      }),
      signOut: vi.fn(async () => { session = null; storage.removeItem(storageKey); return { error: null }; }),
      stopAutoRefresh: vi.fn(async () => {}),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null })) })) })) })),
  };
}

const clients = new Map<string, ReturnType<typeof makeMockClient>>();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url: string, _key: string, opts: any) => {
    const storageKey = opts?.auth?.storageKey || `default:${clients.size}`;
    if (!clients.has(storageKey)) clients.set(storageKey, makeMockClient(storageKey));
    return clients.get(storageKey);
  }),
}));

describe("accountSessions multi-session storage", () => {
  beforeEach(() => {
    vi.resetModules();
    clients.clear();
    Object.defineProperty(globalThis, "window", { value: { localStorage: makeMemoryStorage(), dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }, configurable: true, writable: true });
    Object.defineProperty(globalThis, "localStorage", { value: (globalThis as any).window.localStorage, configurable: true, writable: true });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("stores only account metadata + namespaced session storage, never passwords", async () => {
    const mod = await import("./accountSessions");
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com", username: "alpha" });
    const dump = JSON.stringify((localStorage as any)._dump());
    expect(dump).toContain("afterfur:saved-accounts:v2");
    expect(dump).toContain("uA");
    expect(dump).not.toMatch(/password|access_token|refresh_token/i);
  });

  it("creates isolated per-account storage keys", async () => {
    const mod = await import("./accountSessions");
    expect(mod.storageKeyForUser("uA")).not.toBe(mod.storageKeyForUser("uB"));
    expect(mod.storageKeyForUser("uA")).toContain("uA");
  });

  it("supports A->B->A session restore without password while sessions are present", async () => {
    const mod = await import("./accountSessions");
    clients.set(mod.storageKeyForUser("uA"), makeMockClient(mod.storageKeyForUser("uA"), { session: { access_token: "at.A", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } } }));
    clients.set(mod.storageKeyForUser("uB"), makeMockClient(mod.storageKeyForUser("uB"), { session: { access_token: "at.B", refresh_token: "rt.B", user: { id: "uB", email: "b@example.com" } } }));
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    mod.upsertSavedAccount({ userId: "uB", email: "b@example.com" });
    expect((await mod.restoreAccountSession("uA")).ok).toBe(true);
    expect(mod.getActiveUserId()).toBe("uA");
    expect((await mod.restoreAccountSession("uB")).ok).toBe(true);
    expect(mod.getActiveUserId()).toBe("uB");
    expect((await mod.restoreAccountSession("uA")).ok).toBe(true);
    expect(mod.getActiveUserId()).toBe("uA");
  });

  it("handles expired/revoked sessions and asks for reauth", async () => {
    const mod = await import("./accountSessions");
    clients.set(mod.storageKeyForUser("uX"), makeMockClient(mod.storageKeyForUser("uX"), { session: { access_token: "at.X", refresh_token: "rt.X", user: { id: "uX" } }, userOk: false, refreshOk: false }));
    mod.upsertSavedAccount({ userId: "uX", email: "x@example.com" });
    const r = await mod.restoreAccountSession("uX");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  it("logging out one account does not remove other saved sessions", async () => {
    const mod = await import("./accountSessions");
    clients.set(mod.storageKeyForUser("uA"), makeMockClient(mod.storageKeyForUser("uA"), { session: { access_token: "at.A", refresh_token: "rt.A", user: { id: "uA" } } }));
    clients.set(mod.storageKeyForUser("uB"), makeMockClient(mod.storageKeyForUser("uB"), { session: { access_token: "at.B", refresh_token: "rt.B", user: { id: "uB" } } }));
    mod.upsertSavedAccount({ userId: "uA" }); mod.upsertSavedAccount({ userId: "uB" });
    mod.setActiveUserId("uA");
    await mod.signOutAccount("uA");
    expect(mod.readSavedAccounts().map(a => a.userId)).toEqual(["uB"]);
    expect((await mod.restoreAccountSession("uB")).ok).toBe(true);
  });
});
