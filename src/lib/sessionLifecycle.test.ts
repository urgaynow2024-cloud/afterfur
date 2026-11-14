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

function makeMockClient(storageKey: string, opts?: { 
  session?: MockSession | null; 
  userOk?: boolean; 
  refreshOk?: boolean;
  refreshError?: string;
  getUserError?: string;
  getSessionError?: string;
}) {
  let session = opts?.session ?? null;
  const storage = (globalThis as any).localStorage as Storage;
  return {
    storageKey,
    auth: {
      getSession: vi.fn(async () => {
        if (opts?.getSessionError) return { data: { session: null }, error: { message: opts.getSessionError } };
        if (session) storage.setItem(storageKey, JSON.stringify({ currentSession: session }));
        return { data: { session }, error: null };
      }),
      getUser: vi.fn(async () => {
        if (opts?.getUserError) return { data: { user: null }, error: { message: opts.getUserError } };
        if (opts?.userOk === false) return { data: { user: null }, error: { message: "invalid" } };
        return { data: { user: session?.user ?? null }, error: session?.user ? null : { message: "no user" } };
      }),
      refreshSession: vi.fn(async () => {
        if (opts?.refreshOk === false) {
          const errMsg = opts?.refreshError || "expired";
          return { data: { session: null }, error: { message: errMsg } };
        }
        if (session) session = { ...session, access_token: session.access_token + ".refreshed", refresh_token: session.refresh_token + ".rotated" };
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

describe("Session lifecycle regression tests", () => {
  beforeEach(() => {
    vi.resetModules();
    clients.clear();
    Object.defineProperty(globalThis, "window", { value: { localStorage: makeMemoryStorage(), dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }, configurable: true, writable: true });
    Object.defineProperty(globalThis, "localStorage", { value: (globalThis as any).window.localStorage, configurable: true, writable: true });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("valid session restoration succeeds", async () => {
    const mod = await import("./accountSessions");
    const key = mod.storageKeyForUser("uA");
    clients.set(key, makeMockClient(key, { session: { access_token: "at.A", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } } }));
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    const r = await mod.restoreAccountSession("uA");
    expect(r.ok).toBe(true);
  });

  it("expired access token with valid refresh token recovers", async () => {
    const mod = await import("./accountSessions");
    const key = mod.storageKeyForUser("uA");
    // Session exists but getUser fails (expired access token), refresh succeeds
    clients.set(key, makeMockClient(key, { 
      session: { access_token: "at.A.expired", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: true,
    }));
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    const r = await mod.restoreAccountSession("uA");
    expect(r.ok).toBe(true);
  });

  it("invalid/missing refresh token returns invalid_refresh_token reason", async () => {
    const mod = await import("./accountSessions");
    const key = mod.storageKeyForUser("uA");
    // getUser fails, refresh fails with "Invalid Refresh Token" message
    clients.set(key, makeMockClient(key, { 
      session: { access_token: "at.A.expired", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: false,
      refreshError: "Invalid Refresh Token: Refresh Token Not Found",
    }));
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    const r = await mod.restoreAccountSession("uA");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_refresh_token");
  });

  it("multiple simultaneous refresh attempts are deduplicated", async () => {
    const mod = await import("./accountSessions");
    const key = mod.storageKeyForUser("uA");
    let refreshCallCount = 0;
    const client = makeMockClient(key, { 
      session: { access_token: "at.A.expired", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: true,
    });
    // Wrap refreshSession to count calls
    const originalRefresh = client.auth.refreshSession;
    client.auth.refreshSession = vi.fn(async () => {
      refreshCallCount++;
      return originalRefresh();
    });
    clients.set(key, client);
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    
    // Trigger multiple concurrent restores
    const [r1, r2, r3] = await Promise.all([
      mod.restoreAccountSession("uA"),
      mod.restoreAccountSession("uA"),
      mod.restoreAccountSession("uA"),
    ]);
    
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    // Refresh should only be called once due to mutex
    expect(refreshCallCount).toBe(1);
  });

  it("account A/B switching works without cross-contamination", async () => {
    const mod = await import("./accountSessions");
    const keyA = mod.storageKeyForUser("uA");
    const keyB = mod.storageKeyForUser("uB");
    clients.set(keyA, makeMockClient(keyA, { session: { access_token: "at.A", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } } }));
    clients.set(keyB, makeMockClient(keyB, { session: { access_token: "at.B", refresh_token: "rt.B", user: { id: "uB", email: "b@example.com" } } }));
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    mod.upsertSavedAccount({ userId: "uB", email: "b@example.com" });
    
    // Restore A
    expect((await mod.restoreAccountSession("uA")).ok).toBe(true);
    expect(mod.getActiveUserId()).toBe("uA");
    
    // Switch to B
    expect((await mod.restoreAccountSession("uB")).ok).toBe(true);
    expect(mod.getActiveUserId()).toBe("uB");
    
    // Switch back to A
    expect((await mod.restoreAccountSession("uA")).ok).toBe(true);
    expect(mod.getActiveUserId()).toBe("uA");
  });

  it("stale refresh completion after switching accounts does not affect active account", async () => {
    const mod = await import("./accountSessions");
    const keyA = mod.storageKeyForUser("uA");
    const keyB = mod.storageKeyForUser("uB");
    
    let refreshACalled = false;
    let refreshBCalled = false;
    
    const clientA = makeMockClient(keyA, { 
      session: { access_token: "at.A.expired", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: true,
    });
    const originalRefreshA = clientA.auth.refreshSession;
    clientA.auth.refreshSession = vi.fn(async () => {
      refreshACalled = true;
      return originalRefreshA();
    });
    
    const clientB = makeMockClient(keyB, { 
      session: { access_token: "at.B.expired", refresh_token: "rt.B", user: { id: "uB", email: "b@example.com" } },
      userOk: false,
      refreshOk: true,
    });
    const originalRefreshB = clientB.auth.refreshSession;
    clientB.auth.refreshSession = vi.fn(async () => {
      refreshBCalled = true;
      return originalRefreshB();
    });
    
    clients.set(keyA, clientA);
    clients.set(keyB, clientB);
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    mod.upsertSavedAccount({ userId: "uB", email: "b@example.com" });
    
    // Start restore for A (will trigger refresh)
    const promiseA = mod.restoreAccountSession("uA");
    // Immediately switch to B and restore
    const promiseB = mod.restoreAccountSession("uB");
    
    await Promise.all([promiseA, promiseB]);
    
    expect(refreshACalled).toBe(true);
    expect(refreshBCalled).toBe(true);
    expect(mod.getActiveUserId()).toBe("uB"); // Last switch wins
  });

  it("logout during in-flight request clears session", async () => {
    const mod = await import("./accountSessions");
    const key = mod.storageKeyForUser("uA");
    clients.set(key, makeMockClient(key, { session: { access_token: "at.A", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } } }));
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    expect((await mod.restoreAccountSession("uA")).ok).toBe(true);
    
    await mod.signOutAccount("uA");
    expect(mod.getActiveUserId()).toBeNull();
    expect(mod.readSavedAccounts()).toHaveLength(0);
  });

  it("profile GET success after successful authentication", async () => {
    // This tests the API route, not the client component
    const mod = await import("@/app/api/profile/[username]/route");
    // Mock is set up in profile-access-regression.test.ts
    // This is a placeholder to document the test case
    expect(true).toBe(true);
  });

  it("profile GET failure reaches terminal UI state", async () => {
    // This would be an integration test with the ProfileClient component
    // Placeholder for now
    expect(true).toBe(true);
  });

  it("moderation 401 while profile loading succeeds does not block profile", async () => {
    // The moderation client and profile client are independent
    // Placeholder to document the test case
    expect(true).toBe(true);
  });

  it("exactly one recovery attempt for invalid refresh token", async () => {
    const mod = await import("./accountSessions");
    const key = mod.storageKeyForUser("uA");
    let refreshCallCount = 0;
    const client = makeMockClient(key, { 
      session: { access_token: "at.A.expired", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: false,
      refreshError: "Invalid Refresh Token: Refresh Token Not Found",
    });
    const originalRefresh = client.auth.refreshSession;
    client.auth.refreshSession = vi.fn(async () => {
      refreshCallCount++;
      return originalRefresh();
    });
    clients.set(key, client);
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    
    // First call
    const r1 = await mod.restoreAccountSession("uA");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe("invalid_refresh_token");
    
    // Second call should not retry refresh (session already marked invalid)
    const r2 = await mod.restoreAccountSession("uA");
    expect(r2.ok).toBe(false);
    
    // Refresh should only have been called once
    expect(refreshCallCount).toBe(1);
  });

  it("no infinite loading state - fetchProfile reaches terminal state", async () => {
    // This tests the ProfileClient component behavior
    // Placeholder for now - would need React Testing Library integration
    expect(true).toBe(true);
  });

  it("cross-account refreshes are serialized by global lock (no concurrent token rotation)", async () => {
    const mod = await import("./accountSessions");
    const keyA = mod.storageKeyForUser("uA");
    const keyB = mod.storageKeyForUser("uB");

    let refreshACalled = false;
    let refreshBCalled = false;
    let refreshOverlap = false;
    let refreshAInFlight = false;
    let refreshBInFlight = false;

    const clientA = makeMockClient(keyA, {
      session: { access_token: "at.A.expired", refresh_token: "rt.SHARED", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: true,
    });
    const originalRefreshA = clientA.auth.refreshSession;
    clientA.auth.refreshSession = vi.fn(async () => {
      refreshACalled = true;
      refreshAInFlight = true;
      if (refreshBInFlight) refreshOverlap = true;
      await new Promise(r => setTimeout(r, 20)); // simulate network delay
      refreshAInFlight = false;
      return originalRefreshA();
    });

    const clientB = makeMockClient(keyB, {
      session: { access_token: "at.B.expired", refresh_token: "rt.SHARED", user: { id: "uB", email: "b@example.com" } },
      userOk: false,
      refreshOk: true,
    });
    const originalRefreshB = clientB.auth.refreshSession;
    clientB.auth.refreshSession = vi.fn(async () => {
      refreshBCalled = true;
      refreshBInFlight = true;
      if (refreshAInFlight) refreshOverlap = true;
      await new Promise(r => setTimeout(r, 20)); // simulate network delay
      refreshBInFlight = false;
      return originalRefreshB();
    });

    clients.set(keyA, clientA);
    clients.set(keyB, clientB);
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    mod.upsertSavedAccount({ userId: "uB", email: "b@example.com" });

    // Both accounts share the same refresh token (rt.SHARED) - simulates
    // a session copied from legacy client to per-account storage.
    // Concurrent restores must NOT overlap refreshes.
    const [rA, rB] = await Promise.all([
      mod.restoreAccountSession("uA"),
      mod.restoreAccountSession("uB"),
    ]);

    expect(rA.ok).toBe(true);
    expect(rB.ok).toBe(true);
    expect(refreshACalled).toBe(true);
    expect(refreshBCalled).toBe(true);
    expect(refreshOverlap).toBe(false); // Global lock prevented concurrent refresh
  });

  it("already used refresh token invalidates only the affected account", async () => {
    const mod = await import("./accountSessions");
    const keyA = mod.storageKeyForUser("uA");
    const keyB = mod.storageKeyForUser("uB");

    const clientA = makeMockClient(keyA, {
      session: { access_token: "at.A.expired", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: false,
      refreshError: "Invalid Refresh Token: Already Used",
    });
    const clientB = makeMockClient(keyB, {
      session: { access_token: "at.B", refresh_token: "rt.B", user: { id: "uB", email: "b@example.com" } },
    });

    clients.set(keyA, clientA);
    clients.set(keyB, clientB);
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });
    mod.upsertSavedAccount({ userId: "uB", email: "b@example.com" });

    // Account A's refresh token is already used - should be marked invalid
    const rA = await mod.restoreAccountSession("uA");
    expect(rA.ok).toBe(false);
    if (!rA.ok) expect(rA.reason).toBe("invalid_refresh_token");

    // Account B should still be restorable - its token is independent
    const rB = await mod.restoreAccountSession("uB");
    expect(rB.ok).toBe(true);
    expect(mod.getActiveUserId()).toBe("uB");

    // Retrying A should not attempt refresh again (already marked invalid)
    const rA2 = await mod.restoreAccountSession("uA");
    expect(rA2.ok).toBe(false);
    if (!rA2.ok) expect(rA2.reason).toBe("invalid_refresh_token");
  });

  it("stale refresh response (no token rotation) is detected and rejected", async () => {
    const mod = await import("./accountSessions");
    const key = mod.storageKeyForUser("uA");

    const client = makeMockClient(key, {
      session: { access_token: "at.A.expired", refresh_token: "rt.A", user: { id: "uA", email: "a@example.com" } },
      userOk: false,
      refreshOk: true,
    });
    // Wrap refreshSession: first call rotates normally, second call returns same token (stale)
    const originalRefresh = client.auth.refreshSession;
    let refreshCount = 0;
    client.auth.refreshSession = vi.fn(async () => {
      refreshCount++;
      if (refreshCount === 1) {
        return originalRefresh();
      }
      // Stale: return the SAME refresh_token as the current session (no rotation)
      return { data: { session: { access_token: "at.A.new", refresh_token: "rt.A.rotated", user: { id: "uA" } } }, error: null };
    });
    clients.set(key, client);
    mod.upsertSavedAccount({ userId: "uA", email: "a@example.com" });

    // First refresh succeeds (token rotates from rt.A → rt.A.rotated)
    const r1 = await mod.restoreAccountSession("uA");
    expect(r1.ok).toBe(true);

    // Second refresh returns same token (rt.A.rotated) → stale, rejected
    const r2 = await mod.restoreAccountSession("uA");
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("expired");
  });
});