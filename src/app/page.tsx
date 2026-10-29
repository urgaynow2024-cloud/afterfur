"use client";
import { useEffect, useRef, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canFollow } from "@/lib/follow";
import { addPostToFeed, mergeFeedPosts, submitAndPublishPost } from "@/lib/feed";
import PostCard from "@/components/PostCard";
import Link from "next/link";

type Post = {
  id: string;
  content: string;
  classification: string;
  created_at: string;
  author_id: string;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export default function Home() {
  const { user } = useAuth();
  const submittingRef = useRef(false);
  const [tab, setTab] = useState<"foryou" | "following">("foryou");
  const [draft, setDraft] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState("");
  const max = 300;
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [followingError, setFollowingError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const [spotlight, setSpotlight] = useState<{ id: string; username?: string; display_name?: string | null; avatar_url?: string | null }[]>([]);
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  const [spotlightError, setSpotlightError] = useState("");
  const spotlightLoaded = useRef(false);
  const [spotlightAction, setSpotlightAction] = useState<string | null>(null);
  const [spotlightActionError, setSpotlightActionError] = useState("");
  const [currentUserProfile, setCurrentUserProfile] = useState<{ avatar_url?: string | null; display_name?: string | null; username?: string | null } | null>(null);

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

  async function load() {
    await Promise.resolve();
    const supabase = createClient();
    if (!supabase) {
      setFeedError("Supabase not configured.");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40);
    if (error) {
      setFeedError(error.message);
      setLoading(false);
      return;
    }
    setFeedError("");
    setHasMore((data ?? []).length === 40);
    const ids = [...new Set((data ?? []).map((p: { author_id: string }) => p.author_id))];
    let profMap = new Map();
    if (ids.length) {
      const { data: profs, error: profileError } = await supabase.from("profiles").select("*").in("id", ids);
      if (profileError) {
        setFeedError(profileError.message);
        setLoading(false);
        return;
      }
      profMap = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));
    }
        const fetchedPosts = ((data ?? []).map((p: { author_id: string }) => ({ ...p, profiles: profMap.get(p.author_id) || null })) as Post[]);
        setPosts((current) => mergeFeedPosts(current, fetchedPosts));
        setLoading(false);
  }

  async function loadOlder() {
    const supabase = createClient();
    const oldest = posts.at(-1);
    if (!supabase || !oldest || loadingMore) return;
    setLoadingMore(true); setFeedError("");
    const { data, error: olderError } = await supabase.from("posts").select("*").or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(40);
    if (olderError) { setFeedError(olderError.message); setLoadingMore(false); return; }
    const rows = data ?? [];
    const authorIds = [...new Set(rows.map((post: { author_id: string }) => post.author_id))];
    const { data: profiles, error: profilesError } = authorIds.length ? await supabase.from("profiles").select("*").in("id", authorIds) : { data: [], error: null };
    if (profilesError) { setFeedError(profilesError.message); setLoadingMore(false); return; }
    const profileMap = new Map((profiles ?? []).map((profile: { id: string }) => [profile.id, profile]));
    const olderPosts = rows.map((post: { author_id: string }) => ({ ...post, profiles: profileMap.get(post.author_id) ?? null })) as Post[];
    setPosts((current) => mergeFeedPosts(current, olderPosts));
    setHasMore(rows.length === 40);
    setLoadingMore(false);
  }

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void load(); }, 0);
    const handler = (event: Event) => {
      const post = (event as CustomEvent<Post>).detail;
      if (post?.id) setPosts((current) => addPostToFeed(current, post));
    };
    window.addEventListener("afterfur:post-created", handler);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener("afterfur:post-created", handler);
    };
  }, []);

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
      const { data: profs, error: spotlightQueryError } = await supabase.from('profiles').select('*').limit(50);
      if (spotlightQueryError) {
        setSpotlightError(spotlightQueryError.message);
        setSpotlightLoading(false);
        return;
      }
      setSpotlightError("");
      const eligible = (profs ?? []).filter((p: { id: string }) => p.id !== user?.id && !followingIds.has(p.id));
      const previous = JSON.parse(localStorage.getItem('af_spotlight_prev') || '[]');
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
      localStorage.setItem('af_spotlight_prev', JSON.stringify(selected.map((p: { id: string }) => p.id)));
      spotlightLoaded.current = true;
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
      const { error: followError } = await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
      if (followError) { setSpotlightActionError(followError.message); setSpotlightAction(null); return; }
      setFollowingIds((s) => { const n = new Set(s); n.delete(targetId); return n; });
    } else {
      const { error: followError } = await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
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
    let mediaUrls: string[] = [];
    if (mediaFile) {
      try {
        const ext = mediaFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, mediaFile, { upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        mediaUrls = [data.publicUrl];
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not upload media.");
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
    }
    const result = await submitAndPublishPost(
      () => supabase.from("posts").insert({ author_id: user.id, content: text || "", media_urls: mediaUrls }).select("*").single(),
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
    submittingRef.current = false;
    setSubmitting(false);
  }

  async function deletePost(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) return;
    const { error } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", user.id);
    if (error) {
      setError(error.message);
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
    const supabase = createClient();
    if (!editingPost || !user || !supabase || !content || content.length > max || editSubmitting) return;
    setEditSubmitting(true); setEditError("");
    const { data, error: updateError } = await supabase.from("posts").update({ content, edited_at: new Date().toISOString() }).eq("id", editingPost.id).eq("author_id", user.id).select("*").single();
    if (updateError || !data) {
      setEditError(updateError?.message ?? "The post was not updated. Your changes are still here.");
      setEditSubmitting(false);
      return;
    }
    setPosts((current) => current.map((post) => post.id === editingPost.id ? { ...post, ...(data as Post) } : post));
    setEditingPost(null);
    setEditDraft("");
    setEditSubmitting(false);
  }

  const visiblePosts = tab === "following" ? posts.filter((p) => followingIds.has(p.author_id)) : posts;

  return (
    <Shell
      right={
        <div className="space-y-4 pt-5">
          <div className="rounded-xl border border-af-border bg-af-surface p-4">
            <h2 className="text-sm font-semibold tracking-wide text-af-text">Creator Spotlight</h2>
            {spotlightLoading ? (
              <p className="mt-3 text-sm text-af-muted">Loading creators…</p>
            ) : spotlightError ? (
              <p role="alert" className="mt-3 text-sm text-af-danger">Could not load creators: {spotlightError}</p>
            ) : spotlight.length === 0 ? (
              <p className="mt-3 text-sm text-af-muted">No creators to show yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
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
                      className={`min-h-9 rounded-md px-3 text-xs font-semibold transition-colors disabled:opacity-60 ${followingIds.has(creator.id) ? "border border-af-border-strong text-af-text hover:bg-af-surface-2" : "bg-af-brand text-white hover:bg-af-brand-hover"}`}
                    >
                      {spotlightAction === creator.id ? "..." : followingIds.has(creator.id) ? "Following" : "Follow"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Link href="/explore" className="mt-3 inline-flex min-h-9 items-center text-sm font-medium text-af-brand-soft hover:underline">Discover more creators <span aria-hidden="true" className="ml-1">→</span></Link>
          </div>
        </div>
      }
    >
      <PageHeader title="Home" subtitle="Your space for the AfterFur community" />
      <div role="tablist" aria-label="Feed selection" className="flex border-b border-af-border/80 px-2 sm:px-4">
        <button
          role="tab"
          aria-selected={tab === "foryou"}
          onClick={() => setTab("foryou")}
          className={`relative min-h-12 flex-1 px-3 text-sm transition-colors hover:text-af-text ${tab === "foryou" ? "font-semibold text-af-text" : "text-af-muted"}`}
        >
          For You
          {tab === "foryou" && <div className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-af-brand" />}
        </button>
        <button
          role="tab"
          aria-selected={tab === "following"}
          onClick={() => setTab("following")}
          className={`relative min-h-12 flex-1 px-3 text-sm transition-colors hover:text-af-text ${tab === "following" ? "font-semibold text-af-text" : "text-af-muted"}`}
        >
          Following
          {tab === "following" && <div className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-af-brand" />}
        </button>
      </div>
      {tab === "following" && followingError && <div role="alert" className="m-4 rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">Could not load the following feed: {followingError}<button type="button" onClick={() => { const supabase = createClient(); if (!supabase || !user) return; void supabase.from("follows").select("following_id").eq("follower_id", user.id).then(({ data, error: queryError }) => { if (queryError) setFollowingError(queryError.message); else { setFollowingIds(new Set((data ?? []).flatMap((row) => row.following_id ? [row.following_id] : []))); setFollowingError(""); } }); }} className="ml-2 underline">Retry</button></div>}
      {spotlightActionError && <div role="alert" className="mx-4 mt-2 text-sm text-af-danger">Follow update failed: {spotlightActionError}</div>}

      {user && (
        <div className="border-b border-af-border/80 px-4 py-4 sm:px-5">
          <div className="flex gap-3">
            {currentUserProfile?.avatar_url ? (
              <img src={currentUserProfile.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-af-brand text-sm font-bold text-white">
                {(currentUserProfile?.display_name || user.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={max}
                placeholder="Share something with the community..."
                aria-label="Write a post"
                className="min-h-24 w-full resize-y bg-transparent py-1 text-[15px] leading-6 text-af-text placeholder:text-af-muted focus:outline-none"
                rows={2}
              />
              {mediaPreview && (
                <div className="mt-3 overflow-hidden rounded-lg border border-af-border bg-black/20">
                  {mediaFile?.type.startsWith("video/") ? <video src={mediaPreview} controls playsInline className="max-h-72 w-full object-contain" /> : <img src={mediaPreview} alt="Selected post media preview" className="max-h-72 w-full object-contain" />}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-af-border/70 pt-3">
                <div className="flex flex-wrap items-center gap-1">
                  <label className="inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-sm font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2">
                    Add media
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
                      onClick={() => {
                        setMediaFile(null);
                        setMediaPreview(null);
                      }}
                      className="min-h-9 rounded-md px-2 text-sm text-af-muted hover:bg-af-surface-2 hover:text-af-danger"
                    >
                      Remove
                    </button>
                  )}
                  <span aria-live="polite" className={`px-2 text-xs ${draft.length > max - 30 ? "text-af-brand-soft" : "text-af-muted"}`}>{draft.length}/{max}</span>
                </div>
                <button
                  onClick={submit}
                  disabled={(!draft.trim() && !mediaFile) || submitting}
                  className="min-h-9 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div role="alert" className="mx-4 mt-3 rounded-lg border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-sm text-af-danger sm:mx-5">{error}</div>}

      {loading ? (
        <div aria-label="Loading posts" className="divide-y divide-af-border/70">
          {[0, 1, 2].map((n) => <div key={n} aria-hidden="true" className="flex animate-pulse gap-3 px-4 py-5 sm:px-5"><div className="h-10 w-10 shrink-0 rounded-full bg-af-surface-2" /><div className="flex-1 space-y-3"><div className="h-3 w-2/5 rounded bg-af-surface-2" /><div className="h-3 w-full rounded bg-af-surface-2" /><div className="h-3 w-4/5 rounded bg-af-surface-2" /></div></div>)}
        </div>
      ) : feedError ? (
        <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 sm:m-5">
          <p className="text-sm text-af-danger">Could not load the feed: {feedError}</p>
          <button type="button" onClick={() => { setLoading(true); void load(); }} className="mt-3 min-h-9 rounded-md border border-af-border-strong px-3 text-sm font-medium text-af-text hover:bg-af-surface-2">Try again</button>
        </div>
      ) : (tab === "following" && followingError) ? null : visiblePosts.length === 0 ? (
        <EmptyState
          title={tab === "following" ? (user ? "Nothing from follows yet" : "Sign in to follow creators") : "Your feed awaits"}
          body={tab === "following" ? (user ? "Follow creators to see their work here." : "Sign in to build a personalised following feed.") : "Explore creators or sign in to start building your space."}
          action={{ label: user ? "Explore creators" : "Sign in", href: user ? "/explore" : "/signin" }}
        />
      ) : (
        <div className="divide-y divide-af-border/70">
          {visiblePosts.map((p: Post) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onShare={(id) => {
                    const post = posts.find((p) => p.id === id);
                    const username = post?.profiles?.username || "profile";
                    const url = `${window.location.origin}/${username}/status/${id}`;
                    navigator.clipboard?.writeText(url).then(() => setError("")).catch(() => setError("Could not copy link."));
                  }}
                  onEdit={user?.id === p.author_id ? startEdit : undefined}
                  onDelete={user?.id === p.author_id ? deletePost : undefined}
                />
          ))}
        </div>
      )}

      {!loading && !feedError && hasMore && posts.length > 0 && <div className="border-b border-af-border p-4 text-center">
        <button type="button" onClick={() => { void loadOlder(); }} disabled={loadingMore} className="min-h-10 rounded-md border border-af-border-strong px-4 text-sm font-medium text-af-text-2 hover:bg-af-surface-2 disabled:opacity-50">{loadingMore ? "Loading older posts…" : "Load older posts"}</button>
      </div>}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-labelledby="delete-post-title">
          <div className="w-full max-w-sm rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl">
            <h3 id="delete-post-title" className="text-lg font-semibold">Remove post?</h3>
            <p className="mt-2 text-sm text-af-muted">This action cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className="af-action-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deletePost(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="min-h-10 flex-1 rounded-md bg-af-danger px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
              <button type="submit" disabled={editSubmitting || !editDraft.trim() || editDraft.length > max} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{editSubmitting ? "Saving…" : "Save changes"}</button>
            </div></div>
          </form>
        </div>
      )}
    </Shell>
  );
}



