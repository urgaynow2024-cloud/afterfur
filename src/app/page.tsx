"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";

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
  const [tab, setTab] = useState<"foryou" | "following">("foryou");
  const [draft, setDraft] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const max = 300;
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [repostedIds, setRepostedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(40);
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    const ids = [...new Set((data ?? []).map((p: any) => p.author_id))];
    let profMap = new Map();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
      profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
    }
    setPosts(((data ?? []).map((p: any) => ({ ...p, profiles: profMap.get(p.author_id) || null })) as Post[]));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    supabase.from("likes").select("post_id").eq("user_id", user.id).then(({ data }: any) => setLikedIds(new Set((data ?? []).map((r: any) => r.post_id))));
    supabase.from("bookmarks").select("post_id").eq("user_id", user.id).then(({ data }: any) => setBookmarkedIds(new Set((data ?? []).map((r: any) => r.post_id))));
    supabase.from("reposts").select("post_id").eq("user_id", user.id).then(({ data }: any) => setRepostedIds(new Set((data ?? []).map((r: any) => r.post_id))));
    supabase.from("follows").select("following_id").eq("follower_id", user.id).then(({ data }: any) => setFollowingIds(new Set((data ?? []).map((r: any) => r.following_id))));
  }, [user]);

  async function submit() {
    const text = draft.trim();
    if (!text && !mediaFile) return;
    const supabase = createClient();
    if (!supabase || !user) {
      setError("Sign in to post.");
      return;
    }
    setLoading(true);
    let mediaUrls: string[] = [];
    if (mediaFile) {
      try {
        const ext = mediaFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, mediaFile, { upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        mediaUrls = [data.publicUrl];
      } catch (e: any) {
        setError(e.message);
        setLoading(false);
        return;
      }
    }
    const { error } = await supabase.from("posts").insert({ author_id: user.id, content: text || "", media_urls: mediaUrls });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setDraft("");
    setMediaFile(null);
    setMediaPreview(null);
    setLoading(false);
    load();
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
          <div className="rounded-2xl border border-af-border/70 bg-gradient-to-b from-af-surface to-transparent overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="text-lg font-semibold tracking-tight">Community Pulse</h2>
              <p className="mt-1 text-sm text-af-muted">No live activity to show yet. Check back as creators join.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-af-border/70 bg-gradient-to-b from-af-surface to-transparent overflow-hidden">
            <div className="px-5 py-4">
              <h2 className="text-lg font-semibold tracking-tight">Creator Spotlight</h2>
              <p className="mt-1 text-sm text-af-muted">Discover artists and creators across the community.</p>
            </div>
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
          {tab === "foryou" && <div className="absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-af-accent to-af-highlight" />}
        </button>
        <button
          onClick={() => setTab("following")}
          className={`relative flex-1 py-3 text-[15px] transition-colors hover:bg-af-surface/40 ${tab === "following" ? "font-semibold text-af-text" : "text-af-muted"}`}
        >
          Following
          {tab === "following" && <div className="absolute bottom-0 left-1/2 h-0.5 w-16 -translate-x-1/2 rounded-full bg-gradient-to-r from-af-accent to-af-highlight" />}
        </button>
      </div>

      {user && (
        <div className="border-b border-af-border/70 px-5 py-4">
          <div className="flex gap-3">
            <div className="h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-af-accent to-af-highlight" />
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
                  disabled={(!draft.trim() && !mediaFile) || loading}
                  className="rounded-xl bg-gradient-to-r from-af-accent to-af-highlight px-5 py-1.5 text-[15px] font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Posting..." : "Post"}
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
          title={tab === "following" ? "Nothing from follows yet" : "Your feed awaits"}
          body={tab === "following" ? "Follow creators to see their work here." : "Explore creators or sign in to start building your space."}
          action={{ label: "Explore creators", href: "/explore" }}
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
              onLike={toggleLike}
              onBookmark={toggleBookmark}
              onRepost={toggleRepost}
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

