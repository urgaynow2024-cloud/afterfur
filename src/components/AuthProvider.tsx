"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ACCOUNT_SWITCH_EVENT,
  clearTransientAccountState,
  emitAccountSwitched,
  getActiveClient,
  getActiveUserId,
  getClientForUser,
  getSavedAccount,
  pauseInactiveClientRefresh,
  restoreAccountSession,
  setActiveUserId,
  signOutAccount,
  upsertSavedAccount,
  // markAccountSessionStatus,
} from "@/lib/accountSessions";

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
  // Track the currently bound client to avoid redundant subscriptions
  const boundClientRef = useRef<ReturnType<typeof createClient> | null>(null);
  // Track the userId we're currently bound to
  const boundUserIdRef = useRef<string | null>(null);

  const applySession = useCallback(async (next: Session | null, sourceClient?: ReturnType<typeof createClient>, opts?: { event?: string }) => {
    const nextUser = next?.user ?? null;
    try {
      console.info("[auth-diag] applySession", {
        event: opts?.event ?? null,
        hasSession: Boolean(next),
        hasUserId: Boolean(nextUser?.id),
        userId: nextUser?.id ?? null,
        activeUserId: getActiveUserId(),
        willIgnoreNull: !nextUser && !!opts?.event && opts.event !== "SIGNED_OUT" && opts.event !== "USER_DELETED",
        willClear: !nextUser && (!opts?.event || opts.event === "SIGNED_OUT" || opts.event === "USER_DELETED"),
      });
    } catch {}
    // Ignore null-session updates for non-sign-out events to avoid transient auth
    // callbacks (e.g. during token refresh/navigation races) from clearing an
    // otherwise valid local session.
    if (!nextUser && opts?.event && opts.event !== "SIGNED_OUT" && opts.event !== "USER_DELETED") {
      try { console.info("[auth-diag] applySession_ignored_transient_null", { event: opts.event, activeUserId: getActiveUserId() }); } catch {}
      return;
    }
    setSession(next);
    setUser(nextUser);
    if (nextUser?.id) {
      setActive(nextUser.id);
      setActiveUserId(nextUser.id);
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
      try { console.info("[auth-diag] session_cleared_explicit", { event: opts?.event ?? null, reason: "explicit_sign_out_or_deletion_or_initial_null", activeUserIdAfter: getActiveUserId() }); } catch {}
      setActive(getActiveUserId());
    }
  }, []);

  const bindClient = useCallback(async (client: ReturnType<typeof createClient>, userIdHint?: string | null) => {
    try { console.info("[auth-diag] bindClient_start", { userIdHint: userIdHint ?? null, hasClient: Boolean(client), activeUserId: getActiveUserId() }); } catch {}
    // Avoid re-binding the same client for the same user
    if (boundClientRef.current === client && boundUserIdRef.current === userIdHint) {
      try { console.info("[auth-diag] bindClient_skip_same", { userIdHint: userIdHint ?? null }); } catch {}
      return;
    }
    
    subRef.current?.unsubscribe?.();
    subRef.current = null;
    boundClientRef.current = client;
    boundUserIdRef.current = userIdHint ?? null;
    
    if (!client) {
      try { console.info("[auth-diag] bindClient_no_client_clearing", { activeUserId: getActiveUserId() }); } catch {}
      setSession(null); setUser(null); setLoading(false);
      pauseInactiveClientRefresh(null);
      return;
    }
    setLoading(true);
    const { data } = await client.auth.getSession();
    try { console.info("[auth-diag] bindClient_getSession", { userIdHint: userIdHint ?? null, hasSession: Boolean(data.session), sessionUserId: data.session?.user?.id ?? null }); } catch {}
    await applySession(data.session ?? null, client, { event: "INITIAL_SESSION_SNAPSHOT" });
    const activeId = userIdHint ?? data.session?.user?.id ?? getActiveUserId();
    pauseInactiveClientRefresh(activeId ?? null);

    // Wait for the initial onAuthStateChange firing (synchronous) to ensure
    // session restoration from storage has completed before marking loading=false.
    // This prevents a race where ProfileClient proceeds with session=null.
    let resolved = false;
    const initPromise = new Promise<void>((resolve) => {
      const { data: sub } = client.auth.onAuthStateChange((event, nextSession) => {
        void applySession(nextSession ?? null, client, { event });
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
    if (userIdHint && !data.session) {
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
      router.refresh();
    };
    window.addEventListener(ACCOUNT_SWITCH_EVENT, onSwitch);
    return () => {
      window.removeEventListener(ACCOUNT_SWITCH_EVENT, onSwitch);
      subRef.current?.unsubscribe?.();
    };
  }, [bindClient, router]);

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
    try { console.info("[auth-diag] signOut_called", { requestedUserId: opts?.userId ?? null, activeUserId: getActiveUserId(), allAccounts: Boolean(opts?.allAccounts) }); } catch {}
    const targetId = opts?.userId ?? user?.id ?? getActiveUserId();
    if (!targetId) return { error: null };
    if (opts?.allAccounts) {
      const { signOutAllAccounts } = await import("@/lib/accountSessions");
      await signOutAllAccounts();
      clearTransientAccountState();
      setSession(null); setUser(null); setActive(null);
      pauseInactiveClientRefresh(null);
      emitAccountSwitched(null);
      router.push(opts.redirectTo ?? "/signin");
      router.refresh();
      return { error: null };
    }
    const r = await signOutAccount(targetId);
    clearTransientAccountState();
    const nextId = getActiveUserId();
    pauseInactiveClientRefresh(nextId);
    if (!nextId) {
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
