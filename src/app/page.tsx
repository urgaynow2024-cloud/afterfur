"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canFollow } from "@/lib/follow";
import { addPostToFeed, filterVisibleFeedPosts, mergeFeedPosts, submitAndPublishPost } from "@/lib/feed";
import { loadMyMembershipStatus } from "@/lib/pawpass";
import PostCard from "@/components/PostCard";
import EmojiPicker from "@/components/EmojiPicker";
import Link from "next/link";

type Post = {
  id: string;
  content: string;
  classification?: string | null;
  created_at: string;
  edited_at?: string | null;
  author_id: string;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null; is_private?: boolean | null } | null;
};

const PAGE_SIZE = 40;
const VISIBLE_MODERATION = "moderation_status.is.null,moderation_status.eq.visible";

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [isPawPass, setIsPawPass] = useState(false);
  const submittingRef = useRef(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"foryou" | "following">("foryou");
  const [draft, setDraft] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  const max = isPawPass ? 1000 : 600;
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followingError, setFollowingError] = useState("");
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [spotlight, setSpotlight] = useState<{ id: string; username?: string; display_name?: string | null; avatar_url?: string | null }[]>([]);
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  const [spotlightError, setSpotlightError] = useState("");
  const [spotlightAction, setSpotlightAction] = useState<string | null>(null);
  const [spotlightActionError, setSpotlightActionError] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ avatar_url?: string | null; display_name?: string | null; username?: string | null } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) { setIsPawPass(false); return; }
    let cancelled = false;
    void loadMyMembershipStatus(supabase).then(({ status }) => {
      if (cancelled) return;
      const active = !!status && (status.status === "active" || status.status === "cancel_at_period_end") && !!status.currentPeriodEnd && new Date(status.currentPeriodEnd).getTime() > Date.now();
      setIsPawPass(active);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const el = composerTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    supabase
      .from("profiles")
      .select("avatar_url,display_name,username")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { avatar_url?: string | null; display_name?: string | null; username?: string | null } | null }) => setCurrentUserProfile(data));
  }, [user]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    void supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id).then(({ data }: { data: { blocked_id: string }[] | null }) => {
      setBlockedSet(new Set((data ?? []).map((row) => row.blocked_id)));
    });
  }, [user]);

  const attachProfiles = useCallback(async (rows: Post[]): Promise<Post[]> => {
    const ids = [...new Set(rows.map((post) => post.author_id).filter(Boolean))];
    if (ids.length === 0) return rows;
    const supabase = createClient();
    if (!supabase) return rows;
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id,username,display_name,avatar_url,is_private")
      .in("id", ids);
    if (profileError) throw new Error(profileError.message);
    const map = new Map((profiles ?? []).map((profile: { id: string; username: string; display_name: string | null; avatar_url: string | null; is_private?: boolean | null }) => [profile.id, profile]));
    return rows.map((post) => {
      const profile = map.get(post.author_id);
      return {
        ...post,
        profiles: profile
          ? { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, is_private: !!profile.is_private }
          : null,
      };
    });
  }, []);

  const load = useCallback(async (options?: { replace?: boolean }) => {
    const supabase = createClient();
    if (!supabase) {
      setFeedError("Supabase not configured.");
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setFeedError("");
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .or(VISIBLE_MODERATION)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) {
        setFeedError(error.message);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const fetchedPosts = await attachProfiles((data ?? []) as Post[]);
      setPosts((current) => (options?.replace ? fetchedPosts : mergeFeedPosts(current, fetchedPosts)));
      setHasMore((data ?? []).length === PAGE_SIZE);
      setLoading(false);
      setRefreshing(false);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Could not load the feed.");
      setLoading(false);
      setRefreshing(false);
    }
  }, [attachProfiles]);

  const loadOlder = useCallback(async () => {
    if (loadingMore) return;
    const oldest = posts.at(-1);
    const supabase = createClient();
    if (!supabase || !oldest) return;
    setLoadingMore(true);
    setFeedError("");
    try {
      const { data, error: olderError } = await supabase
        .from("posts")
        .select("*")
        .or(`${VISIBLE_MODERATION},and(created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id}))`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (olderError) { setFeedError(olderError.message); return; }
      const rows = (data ?? []) as Post[];
      const olderPosts = await attachProfiles(rows);
      setPosts((current) => mergeFeedPosts(current, olderPosts));
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Could not load older posts.");
    } finally {
      setLoadingMore(false);
    }
  }, [attachProfiles, loadingMore, posts]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load({ replace: true }); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const handler = (event: Event) => {
      const post = (event as CustomEvent<Post>).detail;
      if (post?.id) setPosts((current) => addPostToFeed(current, post));
    };
    window.addEventListener("afterfur:post-created", handler);
    return () => window.removeEventListener("afterfur:post-created", handler);
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore || posts.length === 0) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadOlder();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadOlder, loading, loadingMore, posts.length]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const loadFollowing = async () => {
        const supabase = createClient();
        if (!user) { setFollowingIds(new Set()); setFollowingError(""); return; }
        if (!supabase) { setFollowingError("Supabase is not configured."); return; }
        const { data, error: queryError } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
        if (cancelled) return;
        if (queryError) { setFollowingError(queryError.message); return; }
        setFollowingIds(new Set((data ?? []).flatMap((row) => row.following_id ? [row.following_id] : [])));
        setFollowingError("");
      };
      void loadFollowing();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase) { setSpotlightLoading(false); return; }
      const { data: profs, error: spotlightQueryError } = await supabase.from("profiles").select("*").limit(50);
      if (spotlightQueryError) {
        setSpotlightError(spotlightQueryError.message);
        setSpotlightLoading(false);
        return;
      }
      setSpotlightError("");
      const eligible = (profs ?? []).filter((p: { id: string }) => p.id !== user?.id);
      const previous = JSON.parse(localStorage.getItem("af_spotlight_prev") || "[]");
      const pool = eligible.filter((p: { id: string }) => !previous.includes(p.id));
      const source = pool.length >= 5 ? pool : eligible;
      if (source.length === 0) {
        setSpotlight([]);
        setSpotlightLoading(false);
        return;
      }
      const hash = (value: string) => {
        let h = 0;
        for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) >>> 0;
        return h;
      };
      const today = new Date().toISOString().slice(0, 10);
      const selected = source
        .map((p: { id: string }) => ({ p, score: hash(p.id + today) }))
        .sort((a: { score: number }, b: { score: number }) => a.score - b.score)
        .slice(0, 5)
        .map((x: { p: { id: string; username?: string; display_name?: string | null; avatar_url?: string | null } }) => x.p);
      setSpotlight(selected);
      localStorage.setItem("af_spotlight_prev", JSON.stringify(selected.map((p: { id: string }) => p.id)));
      setSpotlightLoading(false);
    };
    run();
  }, [user, followingIds]);

  async function toggleSpotlightFollow(targetId: string) {
    const supabase = createClient();
    if (!supabase || !user || !canFollow(user.id, targetId)) return;
    setSpotlightAction(targetId);
    setSpotlightActionError("");
    if (followingIds.has(targetId)) {
      const { error: followError } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
      if (followError) { setSpotlightActionError(followError.message); setSpotlightAction(null); return; }
      setFollowingIds((s) => { const n = new Set(s); n.delete(targetId); return n; });
    } else {
      const { error: followError } = await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
      if (followError) { setSpotlightActionError(followError.message); setSpotlightAction(null); return; }
      setFollowingIds((s) => new Set(s).add(targetId));
    }
    setSpotlightAction(null);
  }

  async function submit() {
    if (submittingRef.current) return;
    const text = draft.trim();
    if (!text && !mediaFile) return;
    const supabase = createClient();
    if (!supabase || !user) {
      setError("Sign in to post.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    let mediaUrls: string[] = [];
    if (mediaFile) {
      try {
        const ext = mediaFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media_private").upload(path, mediaFile, { upsert: true });
        if (upErr) throw upErr;
        mediaUrls = [path];
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not upload media.");
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
    }
    const result = await submitAndPublishPost(
      async () => {
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text || "",
            media_urls: mediaUrls,
            classification: "SFW",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { data: null, error: err.error || "Could not create post." };
        }
        const json = await res.json();
        return { data: json.post ?? null, error: null };
      },
      (post: Post) => setPosts((current) => addPostToFeed(current, {
        ...post,
        profiles: currentUserProfile ? {
          username: currentUserProfile.username || "unknown",
          display_name: currentUserProfile.display_name || null,
          avatar_url: currentUserProfile.avatar_url || null,
        } : null,
      })),
    );
    if (result.error) {
      setError(result.error);
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    setDraft("");
    setMediaFile(null);
    setMediaPreview(null);
    try {
      const { createMentionNotifications } = await import("@/lib/mentions.server");
      await createMentionNotifications({ authorId: user.id, postId: (result as any).data?.id, content: text || "" });
    } catch {}
    submittingRef.current = false;
    setSubmitting(false);
  }

  async function deletePost(postId: string) {
    if (!user) return;
    const res = await fetch("/api/posts/" + postId, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Could not delete post.");
      return;
    }
    setPosts((ps) => ps.filter((p) => p.id !== postId));
  }

  function startEdit(postId: string) {
    const post = posts.find((item) => item.id === postId);
    if (!post || post.author_id !== user?.id) return;
    setEditingPost(post);
    setEditDraft(post.content);
    setEditError("");
    setError("");
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    const content = editDraft.trim();
    if (!editingPost || !user || !content || content.length > max || editSubmitting) return;
    setEditSubmitting(true); setEditError("");
    const res = await fetch("/api/posts/" + editingPost.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, edited_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setEditError(err.error || "The post was not updated. Your changes are still here.");
      setEditSubmitting(false);
      return;
    }
    const json = await res.json();
    const data = json.post;
    setPosts((current) => current.map((post) => post.id === editingPost.id ? { ...post, ...(data as Post) } : post));
    setEditingPost(null);
    setEditDraft("");
    setEditSubmitting(false);
  }

  function refreshFeed() {
    if (refreshing || loading) return;
    setRefreshing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void load({ replace: true });
  }

  const visiblePosts = filterVisibleFeedPosts(posts, {
    userId: user?.id ?? null,
    followingIds,
    blockedIds: blockedSet,
    tab,
  });

  const isLoading = authLoading || loading;

  return (
    <Shell
      right={
        <div className="space-y-4">
          <div className="rounded-2xl border border-af-border bg-af-surface/60 p-4">
            <h2 className="text-sm font-semibold tracking-wide text-af-text">Creator Spotlight</h2>
            {spotlightLoading ? (
              <div className="mt-3 space-y-3" aria-label="Loading creators">
                {[0, 1, 2].map((n) => <div key={n} className="flex animate-pulse items-center gap-3"><div className="h-10 w-10 rounded-full bg-af-surface-2" /><div className="flex-1 space-y-1.5"><div className="h-3 w-2/3 rounded bg-af-surface-2" /><div className="h-2.5 w-1/3 rounded bg-af-surface-2" /></div></div>)}
              </div>
            ) : spotlightError ? (
              <p role="alert" className="mt-3 text-sm text-af-danger">Could not load creators: {spotlightError}</p>
            ) : spotlight.length === 0 ? (
              <p className="mt-3 text-sm text-af-muted">No creators to show yet.</p>
            ) : (
              <div className="mt-3 space-y-1">
                {spotlight.map((creator) => (
                  <div key={creator.id} className="flex items-center gap-3 border-t border-af-border/70 py-3 first:border-0">
                    <Link href={`/${encodeURIComponent(creator.username || "")}`} aria-label={`View ${creator.display_name || creator.username}'s profile`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                      {creator.avatar_url ? (
                        <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-semibold text-af-brand-soft">
                          {(creator.display_name || creator.username || "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/${encodeURIComponent(creator.username || "")}`} className="block truncate text-sm font-semibold text-af-text hover:underline">{creator.display_name || creator.username}</Link>
                      <p className="truncate text-xs text-af-muted">@{creator.username}</p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={followingIds.has(creator.id)}
                      aria-label={`${followingIds.has(creator.id) ? "Unfollow" : "Follow"} ${creator.display_name || creator.username}`}
                      onClick={() => toggleSpotlightFollow(creator.id)}
                      disabled={spotlightAction === creator.id}
                      className={`min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${followingIds.has(creator.id) ? "border border-af-border-strong text-af-text hover:bg-af-surface-2" : "bg-af-text text-af-bg hover:opacity-90"}`}
                    >
                      {spotlightAction === creator.id ? "..." : followingIds.has(creator.id) ? "Following" : "Follow"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Link href="/explore" className="mt-3 inline-flex min-h-9 items-center text-sm font-medium text-af-brand-soft hover:underline">Discover more creators <span aria-hidden="true" className="ml-1">→</span></Link>
          </div>

          <div className="rounded-2xl border border-af-border bg-gradient-to-b from-af-surface/70 to-af-surface/30 p-4">
            <h2 className="text-sm font-semibold text-af-text">AfterFur</h2>
            <p className="mt-2 text-xs leading-relaxed text-af-muted">A community for the furry fandom. Keep it kind, keep it consensual, and keep it AfterFur.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-af-text-2">
              <Link href="/guidelines" className="rounded-full border border-af-border px-2.5 py-1 hover:bg-af-surface-2">Guidelines</Link>
              <Link href="/safety" className="rounded-full border border-af-border px-2.5 py-1 hover:bg-af-surface-2">Safety</Link>
              <Link href="/pawpass" className="rounded-full border border-af-border px-2.5 py-1 hover:bg-af-surface-2">PawPass</Link>
            </div>
          </div>
        </div>
      }
    >
      <header className="sticky top-14 z-20 border-b border-af-border/80 bg-af-bg/90 backdrop-blur-md md:top-0">
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3 sm:px-5">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-af-text">Home</h1>
            <p className="truncate text-xs text-af-muted">Your space for the AfterFur community</p>
          </div>
          <button
            type="button"
            onClick={refreshFeed}
            disabled={refreshing || loading}
            aria-label="Refresh feed"
            title="Refresh feed"
            className="af-post-action shrink-0"
          >
            <span aria-hidden="true" className={`h-5 w-5 bg-current ${refreshing ? "animate-spin" : ""}`} style={{ maskImage: "url(/icons/afterfur/refresh.svg)", WebkitMaskImage: "url(/icons/afterfur/refresh.svg)", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskSize: "contain", WebkitMaskSize: "contain" }} />
          </button>
        </div>
        <div role="tablist" aria-label="Feed selection" className="mt-1 flex">
          <button role="tab" aria-selected={tab === "foryou"} onClick={() => setTab("foryou")} className="af-feed-tab">For You</button>
          <button role="tab" aria-selected={tab === "following"} onClick={() => setTab("following")} className="af-feed-tab">Following</button>
        </div>
      </header>

      {tab === "following" && followingError && <div role="alert" className="m-4 rounded-xl border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">Could not load the following feed: {followingError}<button type="button" onClick={() => { const supabase = createClient(); if (!supabase || !user) return; void supabase.from("follows").select("following_id").eq("follower_id", user.id).then(({ data, error: queryError }) => { if (queryError) setFollowingError(queryError.message); else { setFollowingIds(new Set((data ?? []).flatMap((row) => row.following_id ? [row.following_id] : []))); setFollowingError(""); } }); }} className="ml-2 underline">Retry</button></div>}
      {spotlightActionError && <div role="alert" className="mx-4 mt-2 text-sm text-af-danger">Follow update failed: {spotlightActionError}</div>}

      {user && (
        <div className="border-b border-af-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex gap-3">
            {currentUserProfile?.avatar_url ? (
              <img src={currentUserProfile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-af-border" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-af-brand text-sm font-bold text-white">
                {(currentUserProfile?.display_name || user.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <textarea
                ref={composerTextareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={max}
                placeholder="What's on your mind?"
                aria-label="Write a post"
                style={{ resize: "none" }}
                className="min-h-[40px] max-h-40 w-full resize-none overflow-y-auto bg-transparent py-2 text-[15px] leading-6 text-af-text placeholder:text-af-muted/80 focus:outline-none"
                rows={1}
              />
              {mediaPreview && (
                <div className="mt-2 overflow-hidden rounded-2xl border border-af-border bg-black/20">
                  {mediaFile?.type.startsWith("video/") ? <video src={mediaPreview} controls playsInline className="max-h-72 w-full bg-black object-contain" /> : <img src={mediaPreview} alt="Selected post media preview" className="max-h-72 w-full object-contain" />}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-af-border/60 pt-2">
                <div className="flex items-center gap-1">
                  <EmojiPicker onPick={(emoji) => setDraft((t) => t + emoji)} />
                  <label className="af-post-action cursor-pointer">
                    <span aria-hidden="true" className="h-[18px] w-[18px] shrink-0 bg-current" style={{ maskImage: "url(/icons/afterfur/image.svg)", WebkitMaskImage: "url(/icons/afterfur/image.svg)", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskSize: "contain", WebkitMaskSize: "contain" }} />
                    <span className="sr-only">Attach image or video</span>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="sr-only"
                      aria-label="Attach image or video"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setMediaFile(f);
                          setMediaPreview(URL.createObjectURL(f));
                        }
                      }}
                    />
                  </label>
                  {mediaFile && (
                    <button
                      onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                      className="min-h-9 rounded-full px-2.5 text-xs font-medium text-af-muted transition-colors hover:bg-af-surface-2 hover:text-af-danger"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span aria-live="polite" className={`text-xs tabular-nums ${draft.length > max - 30 ? "text-af-brand-soft" : "text-af-muted"}`}>{draft.length}/{max}</span>
                  <button
                    onClick={submit}
                    disabled={(!draft.trim() && !mediaFile) || submitting}
                    className="min-h-9 rounded-full bg-af-brand px-4 text-sm font-bold text-white transition-all hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div role="alert" className="mx-4 mt-3 rounded-xl border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-sm text-af-danger sm:mx-5">{error}</div>}

      {isLoading ? (
        <div aria-label="Loading posts" className="divide-y divide-af-border/70">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} aria-hidden="true" className="flex animate-pulse gap-3 px-4 py-4 sm:px-5">
              <div className="h-10 w-10 shrink-0 rounded-full bg-af-surface-2" />
              <div className="flex-1 space-y-2.5">
                <div className="h-3 w-2/5 rounded bg-af-surface-2" />
                <div className="h-3 w-full rounded bg-af-surface-2" />
                <div className="h-3 w-4/5 rounded bg-af-surface-2" />
                {n === 1 && <div className="mt-3 aspect-[16/9] w-full rounded-2xl bg-af-surface-2" />}
                <div className="flex gap-8 pt-1.5">
                  <div className="h-3 w-8 rounded bg-af-surface-2" />
                  <div className="h-3 w-8 rounded bg-af-surface-2" />
                  <div className="h-3 w-8 rounded bg-af-surface-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : feedError ? (
        <div role="alert" className="m-4 rounded-2xl border border-af-danger/40 bg-af-danger/10 p-4 sm:m-5">
          <p className="text-sm text-af-danger">Could not load the feed: {feedError}</p>
          <button type="button" onClick={() => { setLoading(true); void load({ replace: true }); }} className="mt-3 min-h-9 rounded-full border border-af-border-strong px-4 text-sm font-medium text-af-text hover:bg-af-surface-2">Try again</button>
        </div>
      ) : visiblePosts.length === 0 ? (
        <EmptyState
          title={
            !user
              ? "Sign in to view your feed"
              : tab === "following"
                ? (followingIds.size === 0 ? "Follow creators to see their posts" : "No posts from followed accounts yet")
                : "No posts yet"
          }
          body={
            !user
              ? "Create an account or sign in to see posts from the community."
              : tab === "following"
                ? (followingIds.size === 0 ? "Discover creators and follow them to build your Following feed." : "The accounts you follow haven't posted yet.")
                : "Be the first to share something with the AfterFur community."
          }
          action={{ label: !user ? "Sign in" : "Explore creators", href: !user ? "/signin" : "/explore" }}
        />
      ) : (
        <div>
          {visiblePosts.map((p: Post) => (
            <PostCard
              key={p.id}
              post={p}
              onShare={(id) => {
                const post = posts.find((p) => p.id === id);
                const username = post?.profiles?.username || "profile";
                const url = `${window.location.origin}/${username}/status/${id}`;
                const copied = navigator.clipboard?.writeText(url);
                if (copied) copied.then(() => setError("")).catch(() => setError("Could not copy link."));
                else setError("Could not copy link.");
              }}
              onEdit={user?.id === p.author_id ? startEdit : undefined}
              onDelete={user?.id === p.author_id ? (id) => setConfirmDelete(id) : undefined}
            />
          ))}
          <div ref={sentinelRef} aria-hidden="true" className="h-1" />
          {hasMore && (
            <div className="border-b border-af-border p-4 text-center">
              <button type="button" onClick={() => { void loadOlder(); }} disabled={loadingMore} className="min-h-10 rounded-full border border-af-border-strong px-4 text-sm font-medium text-af-text-2 hover:bg-af-surface-2 disabled:opacity-50">
                {loadingMore ? "Loading older posts…" : "Load older posts"}
              </button>
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-post-title">
          <div className="w-full max-w-sm rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl">
            <h3 id="delete-post-title" className="text-lg font-semibold">Remove post?</h3>
            <p className="mt-2 text-sm text-af-muted">This action cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className="af-action-secondary flex-1">Cancel</button>
              <button
                type="button"
                onClick={() => {
                  deletePost(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="min-h-10 flex-1 rounded-full bg-af-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-post-title">
          <form onSubmit={saveEdit} className="w-full max-w-xl rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl">
            <h2 id="edit-post-title" className="text-lg font-semibold">Edit post</h2>
            {editError && <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{editError}</p>}
            <label htmlFor="edit-post-content" className="sr-only">Post content</label>
            <textarea id="edit-post-content" value={editDraft} onChange={(event) => setEditDraft(event.target.value)} maxLength={max} rows={6} className="af-field mt-4 min-h-36 w-full resize-y px-3 py-2 text-sm leading-relaxed" />
            <div className="mt-2 flex items-center justify-between"><span className="text-xs text-af-muted">{editDraft.length}/{max}</span><div className="flex gap-2">
              <button type="button" onClick={() => { setEditingPost(null); setEditDraft(""); }} disabled={editSubmitting} className="af-action-secondary">Cancel</button>
              <button type="submit" disabled={editSubmitting || !editDraft.trim() || editDraft.length > max} className="min-h-10 rounded-full bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{editSubmitting ? "Saving…" : "Save changes"}</button>
            </div></div>
          </form>
        </div>
      )}
    </Shell>
  );
}