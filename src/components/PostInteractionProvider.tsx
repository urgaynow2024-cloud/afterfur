"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { acquireInteractionLock, nextLikeState, reconcileLikeCountRows, releaseInteractionLock, resolveLikeToggle } from "@/lib/likes";

type InteractionTable = "likes" | "bookmarks" | "reposts";
type InteractionState = Record<InteractionTable, Set<string>>;
type InteractionContextValue = {
  userId: string | null;
  ready: boolean;
  available: boolean;
  liked: (postId: string) => boolean;
  bookmarked: (postId: string) => boolean;
  reposted: (postId: string) => boolean;
  pending: (table: InteractionTable, postId: string) => boolean;
  toggle: (table: InteractionTable, postId: string, authorId: string) => Promise<{ active: boolean; error: string | null }>;
  errorFor: (table: InteractionTable, postId: string) => string | null;
  likeCount: (postId: string) => number | null;
  repostCount: (postId: string) => number | null;
  replyCount: (postId: string) => number | null;
  requestLikeCount: (postId: string, refresh?: boolean) => void;
  requestRepostCount: (postId: string, refresh?: boolean) => void;
  requestReplyCount: (postId: string, refresh?: boolean) => void;
};

const EMPTY: InteractionState = { likes: new Set(), bookmarks: new Set(), reposts: new Set() };
const InteractionContext = createContext<InteractionContextValue | null>(null);

export function PostInteractionProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [states, setStates] = useState<InteractionState>(EMPTY);
  const statesRef = useRef<InteractionState>(EMPTY);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const [ready, setReady] = useState(!user);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<{ likes: Record<string, number>; reposts: Record<string, number>; replies: Record<string, number> }>({ likes: {}, reposts: {}, replies: {} });
  const countQueue = useRef({ likes: new Set<string>(), reposts: new Set<string>(), replies: new Set<string>() });
  const countAttempted = useRef({ likes: new Set<string>(), reposts: new Set<string>(), replies: new Set<string>() });
  const countVersion = useRef({ likes: new Map<string, number>(), reposts: new Map<string, number>(), replies: new Map<string, number>() });
  const countTimer = useRef<{ likes: number | null; reposts: number | null; replies: number | null }>({ likes: null, reposts: null, replies: null });

  const setTableState = useCallback((table: InteractionTable, next: Set<string>) => {
    statesRef.current = { ...statesRef.current, [table]: next };
    setStates(statesRef.current);
  }, []);

  const flushCountQueue = useCallback(async (table: "likes" | "reposts" | "replies") => {
    const postIds = [...countQueue.current[table]];
    countQueue.current[table].clear();
    if (!postIds.length) return;
    postIds.forEach((postId) => countAttempted.current[table].add(postId));
    const versions = new Map(postIds.map((postId) => [postId, countVersion.current[table].get(postId) ?? 0]));
    const countField = table === "likes" ? "like_count" : table === "reposts" ? "repost_count" : "reply_count";
    const supabase = createClient();
    if (!supabase) {
      setCounts((current) => ({ ...current, [table]: reconcileLikeCountRows(current[table], postIds, null, countField) }));
      return;
    }
    const functionName = table === "likes" ? "get_post_like_counts" : table === "reposts" ? "get_post_repost_counts" : "get_post_reply_counts";
    let data: unknown = null;
    try {
      const response = await supabase.rpc(functionName, { p_post_ids: postIds });
      if (!response.error) data = response.data;
    } catch { /* Missing counts are safer than stale or inferred totals. */ }
    const currentIds = postIds.filter((postId) => (countVersion.current[table].get(postId) ?? 0) === versions.get(postId));
    if (!currentIds.length) return;
    const currentRows = Array.isArray(data) ? data.filter((row) => Boolean(row) && typeof row === "object" && typeof (row as { post_id?: unknown }).post_id === "string" && currentIds.includes((row as { post_id: string }).post_id)) : data;
    setCounts((current) => ({ ...current, [table]: reconcileLikeCountRows(current[table], currentIds, currentRows, countField) }));
  }, []);

  const requestCount = useCallback((table: "likes" | "reposts" | "replies", postId: string, refresh = false) => {
    if (refresh) {
      countAttempted.current[table].delete(postId);
      countVersion.current[table].set(postId, (countVersion.current[table].get(postId) ?? 0) + 1);
    }
    if (countAttempted.current[table].has(postId) || countQueue.current[table].has(postId)) return;
    countQueue.current[table].add(postId);
    if (countTimer.current[table] === null) {
      countTimer.current[table] = window.setTimeout(() => {
        countTimer.current[table] = null;
        void flushCountQueue(table);
      }, 0);
    }
  }, [flushCountQueue]);

  const requestLikeCount = useCallback((postId: string, refresh = false) => requestCount("likes", postId, refresh), [requestCount]);
  const requestRepostCount = useCallback((postId: string, refresh = false) => requestCount("reposts", postId, refresh), [requestCount]);
  const requestReplyCount = useCallback((postId: string, refresh = false) => requestCount("replies", postId, refresh), [requestCount]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const load = async () => {
        if (!user) {
          statesRef.current = EMPTY;
          setStates(EMPTY);
          setLoadedUserId(null);
          setLoadFailed(false);
          setReady(true);
          return;
        }
        setReady(false);
        const supabase = createClient();
        if (!supabase) {
          if (!cancelled) { setLoadFailed(true); setReady(true); }
          return;
        }
        try {
          const [likes, bookmarks, reposts] = await Promise.all([
            supabase.from("likes").select("post_id").eq("user_id", user.id),
            supabase.from("bookmarks").select("post_id").eq("user_id", user.id),
            supabase.from("reposts").select("post_id").eq("user_id", user.id),
          ]);
          if (cancelled) return;
          if (likes.error || bookmarks.error || reposts.error) {
            setLoadFailed(true);
          } else {
            const hydrated: InteractionState = {
              likes: new Set((likes.data ?? []).flatMap((row) => row.post_id ? [row.post_id] : [])),
              bookmarks: new Set((bookmarks.data ?? []).flatMap((row) => row.post_id ? [row.post_id] : [])),
              reposts: new Set((reposts.data ?? []).flatMap((row) => row.post_id ? [row.post_id] : [])),
            };
            statesRef.current = hydrated;
            setStates(hydrated);
            setLoadFailed(false);
            setLoadedUserId(user.id);
          }
          setReady(true);
        } catch {
          if (!cancelled) { setLoadFailed(true); setReady(true); }
        }
      };
      void load();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  useEffect(() => () => {
    for (const timer of Object.values(countTimer.current)) if (timer !== null) window.clearTimeout(timer);
  }, []);

  const toggle = useCallback(async (table: InteractionTable, postId: string, authorId: string) => {
    const currentSet = statesRef.current[table];
    const wasActive = currentSet.has(postId);
    if (!user || !ready || loadedUserId !== user.id || loadFailed) return { active: wasActive, error: "Post interactions are unavailable right now." };
    const supabase = createClient();
    if (!supabase) return { active: wasActive, error: "Supabase is not configured." };

    const lockKey = `${table}:${postId}`;
    if (!acquireInteractionLock(pendingRef.current, lockKey)) return { active: wasActive, error: null };
    const shouldBeActive = nextLikeState(wasActive);
    setPendingKeys((current) => new Set(current).add(lockKey));
    setErrors((current) => { const next = { ...current }; delete next[lockKey]; return next; });
    const optimistic = new Set(statesRef.current[table]);
    if (shouldBeActive) optimistic.add(postId); else optimistic.delete(postId);
    setTableState(table, optimistic);

    try {
      const mutation = shouldBeActive
        ? await supabase.from(table).insert({ user_id: user.id, post_id: postId })
        : await supabase.from(table).delete().eq("user_id", user.id).eq("post_id", postId);
      const { data: persisted, error: verifyError } = await supabase.from(table).select("post_id").eq("user_id", user.id).eq("post_id", postId).maybeSingle();
      const result = resolveLikeToggle(wasActive, shouldBeActive, verifyError ? null : Boolean(persisted), mutation.error?.message ?? null, verifyError?.message ?? null);
      const reconciled = new Set(statesRef.current[table]);
      if (result.liked) reconciled.add(postId); else reconciled.delete(postId);
      setTableState(table, reconciled);
      if (result.error) setErrors((current) => ({ ...current, [lockKey]: result.error! }));
      if (table === "likes" || table === "reposts") requestCount(table, postId, true);
      if (!mutation.error && result.liked && !wasActive && authorId !== user.id && (table === "likes" || table === "reposts")) {
        try {
          const type = table === "likes" ? "like" : "repost";
          const { error: notificationError } = await supabase.rpc("create_post_notification", { p_recipient_id: authorId, p_post_id: postId, p_type: type });
          if (notificationError) console.error("Could not create interaction notification:", notificationError.message);
        } catch (error) {
          console.error(`Could not create ${table} notification:`, error);
        }
      }
      return { active: result.liked, error: result.error };
    } catch (error) {
      let confirmed: boolean | null = null;
      try {
        const { data, error: verifyError } = await supabase.from(table).select("post_id").eq("user_id", user.id).eq("post_id", postId).maybeSingle();
        if (!verifyError) confirmed = Boolean(data);
      } catch { /* Keep the pre-request state if the server cannot be reached. */ }
      const result = resolveLikeToggle(wasActive, shouldBeActive, confirmed, error instanceof Error ? error.message : "Could not update this post interaction.", null);
      const reconciled = new Set(statesRef.current[table]);
      if (result.liked) reconciled.add(postId); else reconciled.delete(postId);
      setTableState(table, reconciled);
      if (result.error) setErrors((current) => ({ ...current, [lockKey]: result.error! }));
      return { active: result.liked, error: result.error };
    } finally {
      releaseInteractionLock(pendingRef.current, lockKey);
      setPendingKeys((current) => { const next = new Set(current); next.delete(lockKey); return next; });
    }
  }, [loadFailed, loadedUserId, ready, requestCount, setTableState, user]);

  const visibleStates = user ? loadedUserId === user.id ? states : EMPTY : loadedUserId === null ? states : EMPTY;
  const value = useMemo<InteractionContextValue>(() => ({
    userId: user?.id ?? null,
    ready: ready && (!user || loadedUserId === user.id),
    available: ready && (!user || loadedUserId === user.id) && !loadFailed,
    liked: (postId) => visibleStates.likes.has(postId),
    bookmarked: (postId) => visibleStates.bookmarks.has(postId),
    reposted: (postId) => visibleStates.reposts.has(postId),
    pending: (table, postId) => pendingKeys.has(`${table}:${postId}`),
    toggle,
    errorFor: (table, postId) => errors[`${table}:${postId}`] ?? null,
    likeCount: (postId) => counts.likes[postId] ?? null,
    repostCount: (postId) => counts.reposts[postId] ?? null,
    replyCount: (postId) => counts.replies[postId] ?? null,
    requestLikeCount,
    requestRepostCount,
    requestReplyCount,
  }), [counts, errors, loadFailed, loadedUserId, pendingKeys, ready, requestLikeCount, requestRepostCount, requestReplyCount, toggle, user, visibleStates]);

  return <InteractionContext.Provider value={value}>{children}</InteractionContext.Provider>;
}

export function usePostInteractions() {
  return useContext(InteractionContext);
}
