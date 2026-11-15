"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACCOUNT_SWITCH_EVENT,
  clearActiveBoundClient,
  clearTransientAccountState,
  emitAccountSwitched,
  ensureActiveSession,
  getActiveClient,
  getActiveUserId,
  getClientForUser,
  getLegacyClient,
  getSavedAccount,
  pauseInactiveClientRefresh,
  peekSessionForUser,
  restoreAccountSession,
  setActiveBoundClient,
  setActiveUserId,
  signOutAccount,
  storageKeyForUser,
  upsertSavedAccount,
} from "@/lib/accountSessions";
import { authDiag, attachAuthDiagHelpers, startAuthDiagFetchInterceptor } from "@/lib/authDiag";

type SignOutOpts = { redirectTo?: string; allAccounts?: boolean; userId?: string };
type Ctx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  activeUserId: string | null;
  signOut: (opts?: SignOutOpts) => Promise<{ error: string | null }>;
  switchAccount: (userId: string) => Promise<{ error: string | null }>;
  refreshSavedAccount: (userId?: string) => Promise<void>;
};
const AuthContext = createContext<Ctx>({
  user: null,
  session: null,
  loading: true,
  activeUserId: null,
  signOut: async () => ({ error: null }),
  switchAccount: async () => ({ error: null }),
  refreshSavedAccount: async () => {},
});

async function fetchProfileMeta(client: ReturnType<typeof createClient>, userId: string) {
  if (!client) return null;
  const { data } = await client.from("profiles").select("username,display_name,avatar_url").eq("id", userId).maybeSingle();
  return data as { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(typeof window !== "undefined" ? getActiveClient() : true));
  const [activeUserId, setActive] = useState<string | null>(() => (typeof window !== "undefined" ? getActiveUserId() : null));
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  // Track the currently bound client to avoid redundant subscriptions
  const boundClientRef = useRef<ReturnType<typeof createClient> | null>(null);
  // Track the userId we're currently bound to
  const boundUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    attachAuthDiagHelpers();
    startAuthDiagFetchInterceptor();
  }, []);

  const applySession = useCallback(async (next: Session | null, sourceClient?: ReturnType<typeof createClient>, opts?: { event?: string }) => {
    const nextUser = next?.user ?? null;
    authDiag("applySession", "applySession", {
      event: opts?.event ?? null,
      hasSession: Boolean(next),
      hasUserId: Boolean(nextUser?.id),
      userId: nextUser?.id ?? null,
      activeUserId: getActiveUserId(),
      willIgnoreNull: !nextUser && !!opts?.event && opts.event !== "SIGNED_OUT" && opts.event !== "USER_DELETED",
      willClear: !nextUser && (!opts?.event || opts.event === "SIGNED_OUT" || opts.event === "USER_DELETED"),
    });
    // Ignore null-session updates for non-sign-out events to avoid transient auth
    // callbacks (e.g. during token refresh/navigation races) from clearing an
    // otherwise valid local session.
    if (!nextUser && opts?.event && opts.event !== "SIGNED_OUT" && opts.event !== "USER_DELETED") {
      authDiag("applySession", "applySession_ignored_transient_null", { event: opts.event, activeUserId: getActiveUserId() });
      return;
    }
    // A SIGNED_OUT/USER_DELETED event can arrive from a stale client, another
    // tab, or a refresh race. Only clear the local user after confirming that
    // the bound client genuinely has no live session for the active account.
    // Persisted storage snapshots are not used here: a legitimate remote/server
    // sign-out or revoked refresh token must be able to clear local auth state
    // even if a stale snapshot remains until refresh/revalidation clears it.
    // Explicit local sign-out removes persisted session state first, so it still
    // clears correctly.
    if (!nextUser && next === null && (opts?.event === "SIGNED_OUT" || opts?.event === "USER_DELETED")) {
      const activeId = getActiveUserId();
      const activeKey = activeId ? storageKeyForUser(activeId) : null;
      const persisted = activeKey && activeId ? peekSessionForUser(activeId) : null;
      authDiag("applySession", "SIGNED_OUT/USER_DELETED received", {
        event: opts?.event ?? null,
        activeUserId: activeId,
        storageKey: activeKey,
        persistedSession: persisted ? { hasAccessToken: Boolean(persisted.access_token), hasRefreshToken: Boolean(persisted.refresh_token), sessionUserId: persisted.user?.id ?? null } : null,
        sourceClientStorageKey: (sourceClient as any)?.storageKey ?? null,
      });
      // If a persisted session exists in localStorage for the active account, do not
      // clear on this SIGNED_OUT/USER_DELETED event. Supabase can clear its in-memory
      // session state (causing getSession() to return null) while the per-account
      // storage key still holds a valid session — e.g. a stale SIGNED_OUT from a
      // previous client instance or a refresh race. Restoring from localStorage would
      // risk re-instating revoked tokens, so we simply preserve the current React
      // state instead. Genuine sign-out/revocation clears localStorage too, so
      // peekSessionForUser() returns null there and the clear proceeds normally.
      const hasPersisted = Boolean(persisted?.access_token && persisted.refresh_token && persisted.user?.id === activeId);
      let hasSession = false;
      try {
        const checkClient = sourceClient ?? getActiveClient();
        if (checkClient) {
          const { data } = await checkClient.auth.getSession();
          hasSession = Boolean(data.session?.user?.id && (!activeId || data.session.user.id === activeId));
          authDiag("applySession", "SIGNED_OUT getSession_check", {
            event: opts?.event ?? null,
            checkClientStorageKey: (checkClient as any)?.storageKey ?? null,
            getSessionResult: data.session ? { hasSession: true, sessionUserId: data.session.user?.id ?? null } : null,
            activeId,
          });
        }
      } catch {}
      if (hasSession || hasPersisted) {
        authDiag("applySession", "applySession_ignored_stale_signout", { event: opts?.event ?? null, activeId, hasPersisted });
        return;
      }
    }

    setSession(next);
    setUser(nextUser);
    if (nextUser?.id) {
      setActive(nextUser.id);
      setActiveUserId(nextUser.id);
      // Sessions created by the legacy/default client (older installs, OAuth or
      // email callbacks, sign-up) must also be persisted under the active
      // account's isolated storage key. Otherwise a reload binds the per-account
      // client, finds no session, and shows the app as signed out.
      if (next) {
        const target = getClientForUser(nextUser.id);
        if (target && sourceClient !== target) {
          const copied = await ensureActiveSession(nextUser.id, next).catch(() => false);
          authDiag("applySession", "applySession_ensure_active_session", { userId: nextUser.id, copied });
        }
      }
      const profile = await fetchProfileMeta(sourceClient ?? getClientForUser(nextUser.id), nextUser.id).catch(() => null);
      upsertSavedAccount({
        userId: nextUser.id,
        email: nextUser.email ?? null,
        username: profile?.username ?? (nextUser.user_metadata?.username as string | undefined) ?? null,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        sessionStatus: "active",
      });
    } else if (next === null) {
      // Session explicitly cleared by sign-out/deletion event. Preserve saved
      // accounts for multi-account support; do not force-expire other state here.
      authDiag("applySession", "session_cleared_explicit", { event: opts?.event ?? null, reason: "explicit_sign_out_or_deletion_or_initial_null", activeUserIdAfter: getActiveUserId() });
      setActive(getActiveUserId());
    }
  }, []);

  const bindClient = useCallback(async (client: ReturnType<typeof createClient>, userIdHint?: string | null) => {
    authDiag("bindClient", "bindClient_start", { userIdHint: userIdHint ?? null, hasClient: Boolean(client), activeUserId: getActiveUserId() });
    // Avoid re-binding the same client for the same user
    if (boundClientRef.current === client && boundUserIdRef.current === userIdHint) {
      setActiveBoundClient(client);
      authDiag("bindClient", "bindClient_skip_same", { userIdHint: userIdHint ?? null });
      return;
    }

    subRef.current?.unsubscribe?.();
    subRef.current = null;

    if (!client) {
      clearActiveBoundClient();
      boundClientRef.current = null;
      boundUserIdRef.current = null;
      authDiag("bindClient", "bindClient_no_client_clearing", { activeUserId: getActiveUserId() });
      setSession(null); setUser(null); setLoading(false);
      pauseInactiveClientRefresh(null);
      return;
    }

    boundClientRef.current = client;
    boundUserIdRef.current = userIdHint ?? null;
    setActiveBoundClient(client);
    setLoading(true);

    const { data } = await client.auth.getSession().catch(() => ({ data: { session: null } as { session: Session | null } }));
    let initialSession = data.session ?? null;
    let effectiveClient = client;

    // Older installs (and OAuth/email callbacks) store the session under the
    // legacy/default key while the active account uses an isolated per-user key.
    // Recover that session instead of showing a signed-out state.
    if (!initialSession && userIdHint) {
      const stored = peekSessionForUser(userIdHint);
      if (stored?.access_token && (!stored.user?.id || stored.user.id === userIdHint)) {
        authDiag("bindClient", "bindClient_stored_session_recovered_early", { userId: userIdHint });
        initialSession = stored;
      }
    }
    if (!initialSession && userIdHint) {
      const legacy = getLegacyClient();
      if (legacy && legacy !== client) {
        const { data: legacyData } = await legacy.auth.getSession().catch(() => ({ data: { session: null } as { session: Session | null } }));
        if (legacyData.session && legacyData.session.user?.id === userIdHint) {
          authDiag("bindClient", "bindClient_legacy_session_recovered", { userId: userIdHint });
          await applySession(legacyData.session, legacy, { event: "LEGACY_SESSION_RECOVERED" });
          const { data: targetData } = await client.auth.getSession().catch(() => ({ data: { session: null } as { session: Session | null } }));
          if (targetData.session) {
            initialSession = targetData.session;
          } else {
            // Prefer keeping the per-account client bound. If the copy could not be
            // persisted, fall back to the stored session snapshot so refresh/network
            // races do not present a false signed-out state.
            initialSession = peekSessionForUser(userIdHint) ?? legacyData.session;
          }
        }
      }
      // A transient refresh/network failure can make getSession() return null
      // while the persisted session is still valid. Restore the UI from storage
      // instead of showing a false signed-out state.
      if (!initialSession) {
        const stored = peekSessionForUser(userIdHint);
        if (stored?.access_token && (!stored.user?.id || stored.user.id === userIdHint)) {
          authDiag("bindClient", "bindClient_stored_session_recovered", { userId: userIdHint });
          initialSession = stored;
        }
      }
    }

    boundClientRef.current = effectiveClient;
    boundUserIdRef.current = userIdHint ?? initialSession?.user?.id ?? null;
    setActiveBoundClient(effectiveClient);
    authDiag("bindClient", "bindClient_getSession", { userIdHint: userIdHint ?? null, hasSession: Boolean(initialSession), sessionUserId: initialSession?.user?.id ?? null, usingLegacy: effectiveClient !== client, clientStorageKey: (effectiveClient as any)?.storageKey ?? null, activeUserId: getActiveUserId() });
    await applySession(initialSession, effectiveClient, { event: "INITIAL_SESSION_SNAPSHOT" });
    const activeId = userIdHint ?? initialSession?.user?.id ?? getActiveUserId();
    pauseInactiveClientRefresh(activeId ?? null);

    // Wait for the initial onAuthStateChange firing (synchronous) to ensure
    // session restoration from storage has completed before marking loading=false.
    // This prevents a race where ProfileClient proceeds with session=null.
    let resolved = false;
    const initPromise = new Promise<void>((resolve) => {
      const { data: sub } = effectiveClient.auth.onAuthStateChange((event, nextSession) => {
        if (effectiveClient !== boundClientRef.current) return;
        authDiag("onAuthStateChange", `event=${event}`, { event, hasSession: Boolean(nextSession), sessionUserId: nextSession?.user?.id ?? null, clientStorageKey: (effectiveClient as any)?.storageKey ?? null, activeUserId: getActiveUserId() });
        void applySession(nextSession ?? null, effectiveClient, { event });
        pauseInactiveClientRefresh(nextSession?.user?.id ?? getActiveUserId());
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });
      subRef.current = sub.subscription;
    });
    await initPromise;

    setLoading(false);
    if (userIdHint && !initialSession) {
      setActive(getActiveUserId());
    }
  }, [applySession]);

  const refreshSavedAccount = useCallback(async (userId?: string) => {
    const id = userId ?? user?.id;
    if (!id) return;
    const client = getClientForUser(id);
    const profile = await fetchProfileMeta(client, id).catch(() => null);
    const existing = getSavedAccount(id);
    upsertSavedAccount({
      userId: id,
      email: user?.id === id ? user.email ?? existing?.email ?? null : existing?.email ?? null,
      username: profile?.username ?? existing?.username ?? null,
      displayName: profile?.display_name ?? existing?.displayName ?? null,
      avatarUrl: profile?.avatar_url ?? existing?.avatarUrl ?? null,
      sessionStatus: existing?.sessionStatus ?? "unknown",
    });
  }, [user]);

  useEffect(() => {
    const initialClient = getActiveClient();
    void bindClient(initialClient, getActiveUserId());
    const onSwitch = (e: Event) => {
      const detail = (e as CustomEvent<{ userId?: string | null }>).detail;
      clearTransientAccountState();
      const nextClient = detail?.userId ? getClientForUser(detail.userId) : getActiveClient();
      void bindClient(nextClient, detail?.userId ?? null);
      routerRef.current.refresh();
    };
    window.addEventListener(ACCOUNT_SWITCH_EVENT, onSwitch);
    return () => {
      window.removeEventListener(ACCOUNT_SWITCH_EVENT, onSwitch);
      subRef.current?.unsubscribe?.();
    };
  }, [bindClient]);

  const switchAccount = useCallback(async (userId: string) => {
    const result = await restoreAccountSession(userId);
    if (!result.ok) {
      // If session has invalid refresh token, clear it and force reauth
      if (result.reason === "invalid_refresh_token") {
        return { error: result.message || "Session invalidated. Please sign in again." };
      }
      return { error: result.message || "Session expired. Please sign in again." };
    }
    emitAccountSwitched(userId);
    return { error: null };
  }, []);

  const signOut = useCallback(async (opts?: SignOutOpts) => {
    authDiag("signOut", "signOut_called", { requestedUserId: opts?.userId ?? null, activeUserId: getActiveUserId(), allAccounts: Boolean(opts?.allAccounts), stack: new Error().stack?.split("\n").slice(1, 6).join(" | ") });
    const targetId = opts?.userId ?? user?.id ?? getActiveUserId();
    if (!targetId) return { error: null };
    if (opts?.allAccounts) {
      const { signOutAllAccounts } = await import("@/lib/accountSessions");
      authDiag("signOut", "signOutAllAccounts_delegated", { targetId });
      await signOutAllAccounts();
      clearTransientAccountState();
      clearActiveBoundClient();
      setSession(null); setUser(null); setActive(null);
      pauseInactiveClientRefresh(null);
      emitAccountSwitched(null);
      router.push(opts.redirectTo ?? "/signin");
      router.refresh();
      return { error: null };
    }
    authDiag("signOut", "signOutAccount_delegated", { targetId });
    const r = await signOutAccount(targetId);
    authDiag("signOut", "signOutAccount_result", { targetId, error: r.error ?? null, activeUserIdAfter: getActiveUserId() });
    clearTransientAccountState();
    const nextId = getActiveUserId();
    pauseInactiveClientRefresh(nextId);
    if (!nextId) {
      clearActiveBoundClient();
      setSession(null); setUser(null); setActive(null);
      emitAccountSwitched(null);
      router.push(opts?.redirectTo ?? "/signin");
    } else {
      emitAccountSwitched(nextId);
    }
    router.refresh();
    return r;
  }, [router, user?.id]);

  return <AuthContext.Provider value={{ user, session, loading, activeUserId, signOut, switchAccount, refreshSavedAccount }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
