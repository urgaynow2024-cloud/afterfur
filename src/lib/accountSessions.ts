import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export type SavedAccountMeta = {
  userId: string;
  storageKey: string;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  lastUsedAt: string;
  sessionStatus?: "active" | "expired" | "unknown" | "invalid_refresh_token";
};

const META_KEY = "afterfur:saved-accounts:v2";
const ACTIVE_KEY = "afterfur:active-account:v1";
const LEGACY_META_KEY = "afterfur:saved-accounts:v1";
const MAX_ACCOUNTS = 8;

type ClientCache = Map<string, SupabaseClient<Database>>;
const clientCache: ClientCache = new Map();
// Track intended auto-refresh state so we can avoid creating duplicate GoTrue clients
// for the same storage key (Supabase warns/errors with multiple instances per key).
const refreshWanted = new Set<string>();
// Per-account refresh mutex to prevent concurrent refresh attempts
const refreshMutex = new Map<string, Promise<unknown>>();

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function supabaseUrl() { return process.env.NEXT_PUBLIC_SUPABASE_URL; }
function supabaseAnonKey() { return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; }

export function storageKeyForUser(userId: string) {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `afterfur.auth.session.${safe}`;
}

export function readSavedAccounts(): SavedAccountMeta[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return migrateLegacy();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is SavedAccountMeta => Boolean(x) && typeof x === "object" && typeof (x as SavedAccountMeta).userId === "string" && typeof (x as SavedAccountMeta).storageKey === "string")
      .sort((a, b) => (b.lastUsedAt || "").localeCompare(a.lastUsedAt || ""));
  } catch {
    return [];
  }
}

function migrateLegacy(): SavedAccountMeta[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const migrated = (parsed as Array<Record<string, unknown>>)
      .filter((x) => x && typeof x.userId === "string")
      .map((x) => ({
        userId: String(x.userId),
        storageKey: storageKeyForUser(String(x.userId)),
        email: typeof x.email === "string" ? x.email : null,
        username: typeof x.username === "string" ? x.username : null,
        displayName: typeof x.displayName === "string" ? x.displayName : null,
        avatarUrl: typeof x.avatarUrl === "string" ? x.avatarUrl : null,
        lastUsedAt: typeof x.lastUsedAt === "string" ? x.lastUsedAt : new Date().toISOString(),
        sessionStatus: "unknown" as const,
      }));
    writeSavedAccounts(migrated);
    return migrated;
  } catch { return []; }
}

export function writeSavedAccounts(accounts: SavedAccountMeta[]) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(accounts.slice(0, MAX_ACCOUNTS)));
  } catch {}
}

export function getActiveUserId(): string | null {
  if (!canUseStorage()) return null;
  try { return window.localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}

export function setActiveUserId(userId: string | null) {
  if (!canUseStorage()) return;
  try {
    if (userId) window.localStorage.setItem(ACTIVE_KEY, userId);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

export function upsertSavedAccount(account: Omit<SavedAccountMeta, "lastUsedAt" | "storageKey"> & { lastUsedAt?: string; storageKey?: string }) {
  const now = account.lastUsedAt ?? new Date().toISOString();
  const current = readSavedAccounts();
  const storageKey = account.storageKey ?? storageKeyForUser(account.userId);
  const existing = current.find((a) => a.userId === account.userId);
  const next: SavedAccountMeta[] = [{
    ...existing,
    ...account,
    storageKey,
    lastUsedAt: now,
  } as SavedAccountMeta, ...current.filter((a) => a.userId !== account.userId)];
  writeSavedAccounts(next);
  return next;
}

export function markAccountSessionStatus(userId: string, sessionStatus: SavedAccountMeta["sessionStatus"]) {
  const accounts = readSavedAccounts();
  const found = accounts.find((a) => a.userId === userId);
  if (!found) return accounts;
  found.sessionStatus = sessionStatus;
  writeSavedAccounts(accounts);
  return accounts;
}

export function removeSavedAccount(userId: string) {
  const accounts = readSavedAccounts();
  const target = accounts.find((a) => a.userId === userId);
  if (target && canUseStorage()) {
    try { window.localStorage.removeItem(target.storageKey); } catch {}
  }
  const next = accounts.filter((a) => a.userId !== userId);
  writeSavedAccounts(next);
  const key = target?.storageKey ?? storageKeyForUser(userId);
  const cached = clientCache.get(key);
  if (cached) { try { void (cached as any).auth?.stopAutoRefresh?.(); } catch {} clientCache.delete(key); refreshWanted.delete(key); }
  const wasActive = getActiveUserId() === userId;
  if (wasActive) setActiveUserId(next[0]?.userId ?? null);
  if (wasActive) activeBoundClient = null;
  return next;
}

export function touchSavedAccount(userId: string) {
  const current = readSavedAccounts();
  const found = current.find((a) => a.userId === userId);
  if (!found) return current;
  return upsertSavedAccount({ ...found, lastUsedAt: new Date().toISOString(), sessionStatus: "active" });
}

export function getSavedAccount(userId: string) {
  return readSavedAccounts().find((a) => a.userId === userId) ?? null;
}

/**
 * Read a persisted Supabase session without triggering a network refresh.
 *
 * Supabase stores the session object directly under its storage key. This is
 * used only to decide whether a client already has a session; it never logs or
 * exposes token values.
 */
export function peekSessionForUser(userId: string): Session | null {
  if (!canUseStorage()) return null;
  const storageKey = getSavedAccount(userId)?.storageKey ?? storageKeyForUser(userId);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session | { currentSession?: Session | null } | null;
    if (!parsed || typeof parsed !== "object") return null;
    const maybe = "currentSession" in parsed ? parsed.currentSession : parsed;
    return maybe && typeof maybe === "object" && "access_token" in maybe && "refresh_token" in maybe ? (maybe as Session) : null;
  } catch {
    return null;
  }
}

/**
 * Ensure the active account's isolated Supabase client has the session.
 *
 * Sessions created by the legacy/default client (older installs, OAuth/email
 * callbacks, sign-up) must be copied into the per-account storage key, otherwise
 * a reload binds the per-account client, finds no session, and shows the app as
 * signed out even though the legacy client still holds a valid session.
 */
export async function ensureActiveSession(userId: string, session: Session): Promise<boolean> {
  const target = getClientForUser(userId, { autoRefreshToken: true });
  if (!target) return false;
  const existing = peekSessionForUser(userId);
  if (existing?.access_token && existing.refresh_token === session.refresh_token) return true;
  try {
    const { error } = await target.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    if (error) return false;
    setActiveUserId(userId);
    return true;
  } catch {
    return false;
  }
}

// The AuthProvider is the single source of truth for which Supabase client is
// bound to the current session. Components use this so they cannot accidentally
// query through a different client that has no session.
let activeBoundClient: SupabaseClient<Database> | null = null;
export function setActiveBoundClient(client: SupabaseClient<Database> | null) {
  activeBoundClient = client;
}
export function clearActiveBoundClient() {
  activeBoundClient = null;
}

function setAutoRefresh(client: SupabaseClient<Database>, storageKey: string, enable: boolean) {
  try {
    const auth: any = (client as any).auth;
    if (enable) {
      refreshWanted.add(storageKey);
      auth?.startAutoRefresh?.();
    } else {
      refreshWanted.delete(storageKey);
      auth?.stopAutoRefresh?.();
    }
  } catch {}
}

export function getClientForStorageKey(storageKey: string, opts?: { autoRefreshToken?: boolean }): SupabaseClient<Database> | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  // IMPORTANT: maintain exactly one GoTrue client per storageKey in this browser context.
  // Creating a second client for the same storageKey triggers "Multiple GoTrueClient instances".
  let client = clientCache.get(storageKey);
  if (!client) {
    const wantsRefresh = opts?.autoRefreshToken ?? true;
    if (wantsRefresh) refreshWanted.add(storageKey); else refreshWanted.delete(storageKey);
    client = createSupabaseClient<Database>(url, key, {
      auth: {
        storageKey,
        persistSession: true,
        autoRefreshToken: wantsRefresh,
        detectSessionInUrl: false,
      },
    });
    clientCache.set(storageKey, client);
  } else if (typeof opts?.autoRefreshToken === "boolean") {
    // Adjust refresh behavior on the existing singleton client instead of creating another.
    setAutoRefresh(client, storageKey, opts.autoRefreshToken);
  }
  return client;
}

export function getActiveClient(): SupabaseClient<Database> | null {
  if (activeBoundClient) return activeBoundClient;
  const activeId = getActiveUserId();
  if (!activeId) return getLegacyDefaultClient();
  const account = getSavedAccount(activeId);
  const storageKey = account?.storageKey ?? storageKeyForUser(activeId);
  // Only the active account should auto-refresh to avoid background refresh churn and
  // unnecessary multi-client activity. Inactive saved clients keep persisted sessions.
  return getClientForStorageKey(storageKey, { autoRefreshToken: true });
}

export function pauseInactiveClientRefresh(activeUserId?: string | null) {
  const activeKey = activeUserId ? (getSavedAccount(activeUserId)?.storageKey ?? storageKeyForUser(activeUserId)) : null;
  clientCache.forEach((client, key) => {
    if (key.startsWith("afterfur.auth.pending.")) return;
    if (activeKey && key === activeKey) setAutoRefresh(client, key, true);
    else setAutoRefresh(client, key, false);
  });
}

export function getClientForUser(userId: string, opts?: { autoRefreshToken?: boolean }): SupabaseClient<Database> | null {
  const account = getSavedAccount(userId);
  return getClientForStorageKey(account?.storageKey ?? storageKeyForUser(userId), opts);
}

let legacyClient: SupabaseClient<Database> | null = null;
function getLegacyDefaultClient(): SupabaseClient<Database> | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  if (!legacyClient) {
    legacyClient = createSupabaseClient<Database>(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return legacyClient;
}

export function getLegacyClient(): SupabaseClient<Database> | null { return getLegacyDefaultClient(); }

export function createTemporaryAuthClient(): SupabaseClient<Database> | null {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;
  // Unique storage key per temp client avoids GoTrue "multiple instances" warning and
  // prevents contaminating saved account sessions. Cleaned up in captureSessionToAccount/cleanup.
  const tempKey = `afterfur.auth.pending.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return createSupabaseClient<Database>(url, key, {
    auth: { storageKey: tempKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function cleanupTempStorageKey(storageKey: string) {
  if (!canUseStorage()) return;
  try { window.localStorage.removeItem(storageKey); } catch {}
  // Temp clients are never cached in clientCache by design (unique key, short-lived), but be defensive.
  const cached = clientCache.get(storageKey);
  if (cached) { try { void (cached as any).auth?.stopAutoRefresh?.(); } catch {} clientCache.delete(storageKey); refreshWanted.delete(storageKey); }
}

export async function captureSessionToAccount(client: SupabaseClient<Database>, meta?: Partial<SavedAccountMeta>): Promise<{ userId: string; session: Session } | { error: string }> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.user?.id) return { error: error?.message || "No authenticated session found." };
  const session = data.session;
  const userId = session.user.id;
  setActiveUserId(userId);
  const targetClient = getClientForUser(userId, { autoRefreshToken: true });
  if (!targetClient) return { error: "Supabase is not configured." };
  const { error: setErr } = await targetClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setErr) return { error: setErr.message };
  upsertSavedAccount({
    userId,
    email: session.user.email ?? meta?.email ?? null,
    username: (session.user.user_metadata?.username as string | undefined) ?? meta?.username ?? null,
    displayName: meta?.displayName ?? null,
    avatarUrl: meta?.avatarUrl ?? null,
    sessionStatus: "active",
  });
  try {
    const pendingKey = (client as any).auth?.storageKey ?? (client as any).storageKey;
    if (typeof pendingKey === "string" && pendingKey.startsWith("afterfur.auth.pending.")) {
      try { await (client as any).auth?.signOut?.({ scope: "local" }); } catch {}
      try { await (client as any).auth?.stopAutoRefresh?.(); } catch {}
      cleanupTempStorageKey(pendingKey);
    }
  } catch {}
  return { userId, session };
}

export async function restoreAccountSession(userId: string): Promise<{ ok: true } | { ok: false; reason: "missing" | "expired" | "invalid_refresh_token" | "error"; message?: string }> {
  const account = getSavedAccount(userId);
  if (!account) return { ok: false, reason: "missing", message: "Saved account not found on this device." };
  
  // If session is already known to have an invalid refresh token, don't retry
  if (account.sessionStatus === "invalid_refresh_token") {
    return { ok: false, reason: "invalid_refresh_token", message: "Session invalidated. Please sign in again." };
  }
  
  // Use mutex to prevent concurrent refresh attempts for the same account
  return withRefreshMutex(userId, async () => {
    const client = getClientForUser(userId, { autoRefreshToken: true });
    if (!client) return { ok: false, reason: "error", message: "Supabase is not configured." };
    
    const { data, error } = await client.auth.getSession();
    if (error) {
      // Check if the error is specifically about invalid/missing refresh token
      const isInvalidRefresh = error.message?.includes("Invalid Refresh Token") || 
                               error.message?.includes("Refresh Token Not Found") ||
                               error.code === "refresh_token_not_found";
      markAccountSessionStatus(userId, isInvalidRefresh ? "invalid_refresh_token" : "expired");
      return { ok: false, reason: isInvalidRefresh ? "invalid_refresh_token" : "expired", message: isInvalidRefresh ? "Session invalidated. Please sign in again." : "Session expired. Please sign in again." };
    }
    if (!data.session) {
      markAccountSessionStatus(userId, "expired");
      return { ok: false, reason: "expired", message: "Session expired. Please sign in again." };
    }
    
    const { data: userData, error: userErr } = await client.auth.getUser();
    if (userErr || !userData.user) {
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) {
        // Check if the error is specifically about invalid/missing refresh token
        const isInvalidRefresh = refreshed.error?.message?.includes("Invalid Refresh Token") || 
                                 refreshed.error?.message?.includes("Refresh Token Not Found") ||
                                 refreshed.error?.code === "refresh_token_not_found";
        markAccountSessionStatus(userId, isInvalidRefresh ? "invalid_refresh_token" : "expired");
        if (isInvalidRefresh) {
          // Clear the invalid session storage to prevent retry loops
          await clearInvalidSessionStorage(userId);
        }
        return { ok: false, reason: isInvalidRefresh ? "invalid_refresh_token" : "expired", message: isInvalidRefresh ? "Session invalidated. Please sign in again." : "Session expired or was revoked. Please sign in again." };
      }
    }
    setActiveUserId(userId);
    touchSavedAccount(userId);
    return { ok: true };
  });
}

export async function signOutAccount(userId: string): Promise<{ error: string | null }> {
  const storageKey = getSavedAccount(userId)?.storageKey ?? storageKeyForUser(userId);
  const client = getClientForUser(userId, { autoRefreshToken: false });
  let error: string | null = null;
  if (client) {
    try { await (client as any).auth?.stopAutoRefresh?.(); } catch {}
    const res = await client.auth.signOut({ scope: "local" });
    if (res.error) error = res.error.message;
  }
  const remaining = readSavedAccounts().filter((a) => a.userId !== userId);
  if (canUseStorage()) {
    try { window.localStorage.removeItem(storageKey); } catch {}
  }
  const wasActive = getActiveUserId() === userId;
  writeSavedAccounts(remaining);
  if (wasActive) {
    setActiveUserId(remaining[0]?.userId ?? null);
    // The bound client has just been signed out; do not let components keep
    // using it until AuthProvider binds the next active account.
    activeBoundClient = null;
  }
  if (clientCache.has(storageKey)) { clientCache.delete(storageKey); refreshWanted.delete(storageKey); }
  // Clear any pending refresh mutex for this account
  refreshMutex.delete(userId);
  return { error };
}

export async function signOutAllAccounts(): Promise<void> {
  const accounts = readSavedAccounts();
  for (const a of accounts) {
    const client = getClientForUser(a.userId, { autoRefreshToken: false });
    if (client) { try { await (client as any).auth?.stopAutoRefresh?.(); await client.auth.signOut({ scope: "local" }); } catch {} }
    if (canUseStorage()) try { window.localStorage.removeItem(a.storageKey); } catch {}
    // Clear refresh mutex for each account
    refreshMutex.delete(a.userId);
  }
  writeSavedAccounts([]);
  setActiveUserId(null);
  activeBoundClient = null;
  clientCache.clear();
  refreshWanted.clear();
}

export const ACCOUNT_SWITCH_EVENT = "afterfur:account-switched";
export function emitAccountSwitched(userId: string | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ACCOUNT_SWITCH_EVENT, { detail: { userId } }));
}

export function clearTransientAccountState() {
  // Best-effort: clear only app-transient caches, not saved auth sessions.
  if (!canUseStorage()) return;
  try {
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith("afterfur:draft:")) window.localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * Acquire a per-account refresh mutex. Returns the result of the inner function.
 * If a refresh is already in progress, waits for it and returns ITS result (does not re-run).
 */
async function withRefreshMutex<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = refreshMutex.get(userId);
  if (existing) {
    // Wait for existing refresh to complete and return its result
    return existing as Promise<T>;
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      refreshMutex.delete(userId);
    }
  })();

  refreshMutex.set(userId, promise);
  return promise;
}

/**
 * Clear the Supabase session storage for a specific account's storage key.
 * This removes stale/invalid refresh tokens from the client's local storage.
 */
export async function clearInvalidSessionStorage(userId: string): Promise<void> {
  if (!canUseStorage()) return;
  const account = getSavedAccount(userId);
  const storageKey = account?.storageKey ?? storageKeyForUser(userId);
  try {
    window.localStorage.removeItem(storageKey);
  } catch {}
  // Also clear any legacy/default storage keys that might have been used
  try {
    const legacyKey = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`;
    window.localStorage.removeItem(legacyKey);
  } catch {}
}
