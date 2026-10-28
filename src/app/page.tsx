"use client";
import { useEffect, useRef, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canFollow } from "@/lib/follow";
import { addPostToFeed, submitAndPublishPost } from "@/lib/feed";
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const max = 300;
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [repostedIds, setRepostedIds] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [repostCounts, setRepostCounts] = useState<Record<string, number>>({});
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [spotlight, setSpotlight] = useState<{ id: string; username?: string; display_name?: string | null; avatar_url?: string | null }[]>([]);
  const [spotlightLoading, setSpotlightLoading] = useState(true);
  const spotlightLoaded = useRef(false);
  const [spotlightAction, setSpotlightAction] = useState<string | null>(null);
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
      setError("Supabase not configured.");
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(40);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const ids = [...new Set((data ?? []).map((p: { author_id: string }) => p.author_id))];
    let profMap = new Map();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
      profMap = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));
    }
        setPosts(((data ?? []).map((p: { author_id: string }) => ({ ...p, profiles: profMap.get(p.author_id) || null })) as Post[]));
        setLoading(false);
  }

  useEffect(() => {
    load();
    const handler = (event: Event) => {
      const post = (event as CustomEvent<Post>).detail;
      if (post?.id) setPosts((current) => addPostToFeed(current, post));
    };
    window.addEventListener("afterfur:post-created", handler);
    return () => window.removeEventListener("afterfur:post-created", handler);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    supabase.from("likes").select("post_id").eq("user_id", user.id).then(({ data }: { data: { post_id: string }[] | null }) => setLikedIds(new Set((data ?? []).map((r: { post_id: string }) => r.post_id))));
    supabase.from("bookmarks").select("post_id").eq("user_id", user.id).then(({ data }: { data: { post_id: string }[] | null }) => setBookmarkedIds(new Set((data ?? []).map((r: { post_id: string }) => r.post_id))));
    supabase.from("reposts").select("post_id").eq("user_id", user.id).then(({ data }: { data: { post_id: string }[] | null }) => setRepostedIds(new Set((data ?? []).map((r: { post_id: string }) => r.post_id))));
    supabase.from("follows").select("following_id").eq("follower_id", user.id).then(({ data }: { data: { following_id: string }[] | null }) => setFollowingIds(new Set((data ?? []).map((r: { following_id: string }) => r.following_id))));
  }, [user]);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase) { setSpotlightLoading(false); return; }
      const { data: profs } = await supabase.from('profiles').select('*').limit(50);
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
    if (followingIds.has(targetId)) {
      await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', targetId);
      setFollowingIds((s) => { const n = new Set(s); n.delete(targetId); return n; });
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: targetId });
      setFollowingIds((s) => new Set(s).add(targetId));
    }
    setSpotlightAction(null);
  }

  async function createNotification(recipientId: string, actorId: string, type: string, postId: string | null) {
    if (!recipientId || recipientId === actorId) return;
    const supabase = createClient();
    if (!supabase) return;
    const { data: existing } = await supabase.from("notifications").select("id").eq("user_id", recipientId).eq("type", type).contains("payload", { actor_id: actorId, post_id: postId ?? null }).limit(1);
    if (existing && existing.length) return;
    await supabase.from("notifications").insert({ user_id: recipientId, type, payload: { actor_id: actorId, post_id: postId ?? null }, read: false });
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

  async function toggleLike(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) {
      setError("Sign in to like posts.");
      return;
    }
    if (likedIds.has(postId)) {
      await supabase.from("likes").delete().eq("user_id", user.id).eq("post_id", postId);
      setLikedIds((s) => {
        const n = new Set(s);
        n.delete(postId);
        return n;
      });
    } else {
      await supabase.from("likes").insert({ user_id: user.id, post_id: postId });
      const post = posts.find((p) => p.id === postId);
      if (post?.author_id) await createNotification(post.author_id, user.id, "like", postId);
      setLikedIds((s) => new Set(s).add(postId));
    }
  }

  async function toggleBookmark(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) {
      setError("Sign in to bookmark posts.");
      return;
    }
    if (bookmarkedIds.has(postId)) {
      await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("post_id", postId);
      setBookmarkedIds((s) => {
        const n = new Set(s);
        n.delete(postId);
        return n;
      });
    } else {
      await supabase.from("bookmarks").insert({ user_id: user.id, post_id: postId });
      setBookmarkedIds((s) => new Set(s).add(postId));
    }
  }

  async function toggleRepost(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) {
      setError("Sign in to repost.");
      return;
    }
    if (repostedIds.has(postId)) {
      await supabase.from("reposts").delete().eq("user_id", user.id).eq("post_id", postId);
      setRepostedIds((s) => {
        const n = new Set(s);
        n.delete(postId);
        return n;
      });
    } else {
      await supabase.from("reposts").insert({ user_id: user.id, post_id: postId });
      const post = posts.find((p) => p.id === postId);
      if (post?.author_id) await createNotification(post.author_id, user.id, "repost", postId);
      setRepostedIds((s) => new Set(s).add(postId));
    }
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

  const visiblePosts = tab === "following" ? posts.filter((p) => followingIds.has(p.author_id)) : posts;

  return (
    <Shell
      right={
        <div className="space-y-4 pt-4">
          <div className="rounded-2xl border border-af-border bg-af-surface p-4">
            <h2 className="text-lg font-semibold tracking-tight text-af-text">Creator Spotlight</h2>
            {spotlightLoading ? (
              <p className="mt-3 text-sm text-af-muted">Loading creators…</p>
            ) : spotlight.length === 0 ? (
              <p className="mt-3 text-sm text-af-muted">No creators to show yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {spotlight.map((creator) => (
                  <div key={creator.id} className="flex items-center gap-3">
                    <Link href={`/${creator.username}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                      {creator.avatar_url ? <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/${creator.username}`} className="block truncate text-sm font-bold hover:underline">{creator.display_name || creator.username}</Link>
                      <p className="truncate text-xs text-af-muted">@{creator.username}</p>
                    </div>
                    <button
                      onClick={() => toggleSpotlightFollow(creator.id)}
                      disabled={spotlightAction === creator.id}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${followingIds.has(creator.id) ? "border border-af-border text-af-text hover:bg-af-surface-2" : "bg-af-brand text-white hover:bg-af-brand-hover"}`}
                    >
                      {spotlightAction === creator.id ? "..." : followingIds.has(creator.id) ? "Following" : "Follow"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Link href="/explore" className="mt-4 block text-sm font-medium text-af-accent hover:underline">Show more</Link>
          </div>
        </div>
      }
    >
      <PageHeader title="Home" subtitle="Your space for the AfterFur community" />
      <div className="flex border-b border-af-border/70">
        <button
          onClick={() => setTab("foryou")}
          className={`relative flex-1 py-3 text-[15px] transition-colors hover:bg-af-surface/40 ${tab === "foryou" ? "font-semibold text-af-text" : "text-af-muted"}`}
        >
          All
          {tab === "foryou" && <div className="absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-af-brand" />}
        </button>
        <button
          onClick={() => setTab("following")}
          className={`relative flex-1 py-3 text-[15px] transition-colors hover:bg-af-surface/40 ${tab === "following" ? "font-semibold text-af-text" : "text-af-muted"}`}
        >
          Following
          {tab === "following" && <div className="absolute bottom-0 left-1/2 h-0.5 w-16 -translate-x-1/2 rounded-full bg-af-brand" />}
        </button>
      </div>

      {user && (
        <div className="border-b border-af-border/70 px-5 py-4">
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
                className="w-full resize-none bg-transparent text-[16px] outline-none placeholder:text-af-muted"
                rows={3}
              />
              {mediaPreview && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-af-border/70">
                  <img src={mediaPreview} alt="" className="max-h-80 w-full object-cover" />
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-af-border/70 pt-3">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer rounded-lg px-2 py-1.5 text-sm text-af-accent transition-colors hover:bg-af-accent/10">
                    Add media
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
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
                      className="rounded-lg px-2 py-1.5 text-sm text-af-muted hover:text-af-danger"
                    >
                      Remove
                    </button>
                  )}
                  <span className="text-sm text-af-muted">{draft.length}/{max}</span>
                </div>
                <button
                  onClick={submit}
                  disabled={(!draft.trim() && !mediaFile) || submitting}
                  className="rounded-xl bg-af-accent px-5 py-1.5 text-[15px] font-semibold text-white transition-all hover:bg-af-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? "Posting..." : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-sm text-af-muted">Loading…</div>
      ) : error ? (
        <div className="p-10 text-center text-sm text-af-danger">{error}</div>
      ) : visiblePosts.length === 0 ? (
        <EmptyState
          title={tab === "following" ? (user ? "Nothing from follows yet" : "Sign in to follow creators") : "Your feed awaits"}
          body={tab === "following" ? (user ? "Follow creators to see their work here." : "Sign in to build a personalised following feed.") : "Explore creators or sign in to start building your space."}
          action={{ label: user ? "Explore creators" : "Sign in", href: user ? "/explore" : "/signin" }}
        />
      ) : (
        <div>
          {visiblePosts.map((p: Post) => (
                <PostCard
                  key={p.id}
                  post={p}
                  liked={likedIds.has(p.id)}
                  bookmarked={bookmarkedIds.has(p.id)}
                  reposted={repostedIds.has(p.id)}
                  likeCount={likeCounts[p.id] ?? 0}
                  repostCount={repostCounts[p.id] ?? 0}
                  onLike={toggleLike}
                  onBookmark={toggleBookmark}
                  onRepost={toggleRepost}
                  onShare={(id) => {
                    const post = posts.find((p) => p.id === id);
                    const username = post?.profiles?.username || "profile";
                    const url = `${window.location.origin}/${username}/status/${id}`;
                    navigator.clipboard?.writeText(url).then(() => setError("")).catch(() => setError("Could not copy link."));
                  }}
                  onDelete={user?.id === p.author_id ? deletePost : undefined}
                />
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-af-border/70 bg-af-surface p-6 shadow-[0_60px_160px_-80px_rgba(167,139,250,0.6)]">
            <h3 className="text-lg font-semibold">Remove post?</h3>
            <p className="mt-2 text-sm text-af-muted">This action cannot be undone.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-xl border border-af-border/70 px-4 py-2 text-sm font-medium transition-colors hover:bg-af-surface-2">
                Cancel
              </button>
              <button
                onClick={() => {
                  deletePost(confirmDelete);
                  setConfirmDelete(null);
                }}
                className="flex-1 rounded-xl bg-af-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}



