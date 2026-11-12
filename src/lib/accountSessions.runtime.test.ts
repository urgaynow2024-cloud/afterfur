import { describe, expect, it, vi, beforeEach } from "vitest";

function makeMemoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
    clear: () => m.clear(),
    _dump: () => Object.fromEntries(m.entries()),
  } as Storage & { _dump: () => Record<string, string>; clear: () => void };
}

const createClientCalls: any[] = [];
const clientByKey = new Map<string, any>();

function makeMockClient(storageKey: string) {
  const storage = (globalThis as any).localStorage as Storage;
  let session: any = null;
  const listeners: Array<(e: string, s: any) => void> = [];
  const client = {
    storageKey,
    auth: {
      storageKey,
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: session?.user ?? null }, error: session?.user ? null : { message: "no" } })),
      refreshSession: vi.fn(async () => ({ data: { session }, error: session ? null : { message: "no" } })),
      setSession: vi.fn(async (t: any) => {
        session = { access_token: t.access_token, refresh_token: t.refresh_token, user: { id: storageKey.includes("uA") ? "uA" : storageKey.includes("uB") ? "uB" : "uX" } };
        storage.setItem(storageKey, JSON.stringify({ currentSession: session }));
        return { data: { session }, error: null };
      }),
      signOut: vi.fn(async () => { session = null; storage.removeItem(storageKey); return { error: null }; }),
      startAutoRefresh: vi.fn(),
      stopAutoRefresh: vi.fn(),
      onAuthStateChange: vi.fn((cb: any) => { listeners.push(cb); return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
      _emit: (e: string) => listeners.forEach((l) => l(e, session)),
    },
  };
  return client;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((_url: string, _key: string, opts: any) => {
    const storageKey = opts?.auth?.storageKey || "default";
    createClientCalls.push({ storageKey, opts });
    if (!clientByKey.has(storageKey)) clientByKey.set(storageKey, makeMockClient(storageKey));
    return clientByKey.get(storageKey);
  }),
}));

describe("accountSessions runtime client lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    createClientCalls.length = 0;
    clientByKey.clear();
    Object.defineProperty(globalThis, "window", { value: { localStorage: makeMemoryStorage(), dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }, configurable: true, writable: true });
    Object.defineProperty(globalThis, "localStorage", { value: (globalThis as any).window.localStorage, configurable: true, writable: true });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });

  it("returns same client instance for same storage key (no duplicate GoTrue instances)", async () => {
    const mod = await import("./accountSessions");
    const a1 = mod.getClientForStorageKey(mod.storageKeyForUser("uA"));
    const a2 = mod.getClientForStorageKey(mod.storageKeyForUser("uA"));
    const a3 = mod.getClientForUser("uA");
    expect(a1).toBe(a2);
    expect(a1).toBe(a3);
    expect(createClientCalls.filter(c => c.storageKey === mod.storageKeyForUser("uA")).length).toBe(1);
  });

  it("returns different isolated clients for different accounts", async () => {
    const mod = await import("./accountSessions");
    const a = mod.getClientForStorageKey(mod.storageKeyForUser("uA"));
    const b = mod.getClientForStorageKey(mod.storageKeyForUser("uB"));
    expect(a).not.toBe(b);
    expect(createClientCalls.length).toBe(2);
  });

  it("toggling refresh does not recreate client for same storage key", async () => {
    const mod = await import("./accountSessions");
    const a1 = mod.getClientForStorageKey(mod.storageKeyForUser("uA"), { autoRefreshToken: true });
    const a2 = mod.getClientForStorageKey(mod.storageKeyForUser("uA"), { autoRefreshToken: false });
    expect(a1).toBe(a2);
    expect(createClientCalls.filter(c => c.storageKey === mod.storageKeyForUser("uA")).length).toBe(1);
    expect((a1 as any).auth.stopAutoRefresh).toHaveBeenCalled();
  });

  it("pauses inactive client refresh and keeps active refreshing", async () => {
    const mod = await import("./accountSessions");
    mod.upsertSavedAccount({ userId: "uA", email: "a@x" });
    mod.upsertSavedAccount({ userId: "uB", email: "b@x" });
    const a = mod.getClientForUser("uA")!;
    const b = mod.getClientForUser("uB")!;
    mod.setActiveUserId("uA");
    mod.pauseInactiveClientRefresh("uA");
    expect((a as any).auth.startAutoRefresh).toHaveBeenCalled();
    expect((b as any).auth.stopAutoRefresh).toHaveBeenCalled();
  });

  it("temporary auth clients use unique pending storage keys and are cleaned up", async () => {
    const mod = await import("./accountSessions");
    const t = mod.createTemporaryAuthClient() as any;
    expect(t).toBeTruthy();
    const pendingKey = createClientCalls[createClientCalls.length - 1].storageKey;
    expect(pendingKey).toMatch(/^afterfur\.auth\.pending\./);
    mod.cleanupTempStorageKey(pendingKey);
    expect((globalThis.localStorage as any).getItem(pendingKey)).toBeNull();
  });
});
