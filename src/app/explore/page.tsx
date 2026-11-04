"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import PostCard from "@/components/PostCard";
import { createClient } from "@/lib/supabase/client";
import { mergeByIdPage, pageRange } from "@/lib/search";
import { useAuth } from "@/components/AuthProvider";
import { BadgeList } from "@/components/BadgeList";

type Creator = { id: string; username: string; display_name: string | null; avatar_url: string | null; bio: string | null };
type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };

export default function Explore() {
  const { user } = useAuth();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [postsError, setPostsError] = useState("");
  const loadingMoreRef = useRef(false);
  const [error, setError] = useState("");
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
    const [{ data: creatorRows, error: creatorError }, { data: postRows, error: postError }] = await Promise.all([
      supabase.from("profiles").select("id,username,display_name,avatar_url,bio").order("created_at", { ascending: false }).limit(12),
      supabase.from("posts").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, 11),
    ]);
    if (creatorError || postError) { setError((creatorError || postError)?.message ?? "Explore could not load."); setLoading(false); return; }
    const foundPosts = (postRows ?? []) as Post[];
    const authorIds = [...new Set(foundPosts.map((post) => post.author_id))];
    const { data: authorRows, error: authorError } = authorIds.length
      ? await supabase.from("profiles").select("id,username,display_name,avatar_url,is_private").in("id", authorIds)
      : { data: [], error: null };
    if (authorError) { setError(authorError.message); setLoading(false); return; }
    const authorMap = new Map(((authorRows ?? []) as Creator[]).map((profile) => [profile.id, profile]));
    setCreators((creatorRows ?? []) as Creator[]);
    const followingIds = new Set<string>();
    if (user) {
      const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
      (follows ?? []).forEach((f) => { if (f.following_id) followingIds.add(f.following_id); });
    }
    const visiblePosts = foundPosts.filter((post) => {
      const prof = authorMap.get(post.author_id);
      const isPrivate = !!(prof as any)?.is_private;
      const isFollowing = followingIds.has(post.author_id);
      const isBlocked = blockedSet.has(post.author_id);
      if (isBlocked) return false;
      if (!isPrivate) return true;
      if (post.author_id === user?.id) return true;
      if (isFollowing) return true;
      return false;
    }).map((post) => ({ ...post, profiles: authorMap.get(post.author_id) ?? null }));
    setPosts(visiblePosts);
    setHasMorePosts(foundPosts.length === 12);
    setLoading(false);
    } catch {
      setError("Explore could not reach the server. Please retry.");
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    void supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id).then(({ data }: { data: { blocked_id: string }[] | null }) => {
      setBlockedSet(new Set((data ?? []).map((row) => row.blocked_id)));
    });
  }, [user]);

  async function deletePost(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) return;
    const { error: deleteError } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", user.id);
    if (deleteError) { setError(deleteError.message); return; }
    setPosts((ps) => ps.filter((p) => p.id !== postId));
  }

  function startEdit(postId: string) {
    const post = posts.find((p) => p.id === postId);
    if (!post || post.author_id !== user?.id) return;
    if (post.profiles?.username) {
      window.location.href = `/${post.profiles.username}/status/${postId}`;
    }
  }

  async function loadMorePosts() {
    if (loadingMoreRef.current || !hasMorePosts) return;
    const supabase = createClient();
    if (!supabase) { setPostsError("Supabase is not configured."); return; }
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setPostsError("");
    try {
      const offset = posts.length;
      const [from, to] = pageRange(offset, 12);
      const { data, error: queryError } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
      if (queryError) { setPostsError(queryError.message); return; }
      const page = (data ?? []) as Post[];
      const authorIds = [...new Set(page.map((post) => post.author_id))];
      const { data: authorRows, error: authorError } = authorIds.length
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url,is_private").in("id", authorIds)
        : { data: [], error: null };
      if (authorError) { setPostsError(authorError.message); return; }
      const authorMap = new Map(((authorRows ?? []) as Creator[]).map((profile) => [profile.id, profile]));
      const followingIds = new Set<string>();
      if (user) {
        const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
        (follows ?? []).forEach((f) => { if (f.following_id) followingIds.add(f.following_id); });
      }
      const visiblePage = page.filter((post) => {
        const prof = authorMap.get(post.author_id);
        const isPrivate = !!(prof as any)?.is_private;
        const isFollowing = followingIds.has(post.author_id);
        const isBlocked = blockedSet.has(post.author_id);
        if (isPrivate && !isFollowing && post.author_id !== user?.id) return false;
        if (isBlocked) return false;
        return true;
      }).map((post) => ({ ...post, profiles: authorMap.get(post.author_id) ?? null }));
      setPosts((current) => mergeByIdPage(current, visiblePage, true));
      setHasMorePosts(page.length === 12);
    } catch {
      setPostsError("Could not load more posts. Please retry.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <Shell>
      <PageHeader title="Explore" subtitle="Discover creators and recent posts shared by the community." />
      <div className="px-4 py-4 sm:px-6">
        <Link href="/search" className="group flex items-center gap-3 rounded-2xl border border-af-border-strong bg-af-surface/80 px-4 py-3.5 text-sm text-af-muted shadow-sm transition-all hover:border-af-brand-soft hover:bg-af-surface-2 hover:text-af-text">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-af-brand/15 text-af-brand-soft">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </span>
          <span className="min-w-0 flex-1 truncate">Search people and posts</span>
          <span className="shrink-0 text-xs font-medium text-af-brand-soft">Open search</span>
        </Link>
      </div>
      {loading ? (
        <div role="status" className="flex min-h-[40vh] items-center justify-center px-6 py-12 text-sm text-af-muted">Loading Explore…</div>
      ) : error ? (
        <div role="alert" className="m-4 rounded-2xl border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger sm:m-6">
          {error}
          <button type="button" onClick={() => { void load(); }} className="ml-3 font-semibold underline underline-offset-2">Retry</button>
        </div>
      ) : (
        <div className="space-y-4 pb-6 sm:space-y-6">
          <section aria-labelledby="creator-discovery-title" className="border-y border-af-border bg-af-surface/40">
            <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="creator-discovery-title" className="text-base font-semibold tracking-tight text-af-text">Recently joined creators</h2>
                <p className="mt-0.5 text-xs text-af-muted">New members you might want to follow.</p>
              </div>
              <Link href="/search" className="shrink-0 text-xs font-medium text-af-brand-soft hover:underline">Find someone</Link>
            </header>
            {creators.length === 0 ? (
              <div className="px-4 pb-6 sm:px-6">
                <EmptyState title="No creator profiles yet" body="Creator profiles will appear here when they join." />
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-3 px-4 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
                {creators.map((creator) => (
                  <li key={creator.id} className="group rounded-2xl border border-af-border bg-af-surface/70 p-4 transition-colors hover:border-af-border-strong hover:bg-af-surface-2">
                    <div className="flex items-start gap-3">
                      <Link href={`/${encodeURIComponent(creator.username)}`} aria-label={`View ${creator.display_name || creator.username}'s profile`} className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                        {creator.avatar_url ? <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center font-semibold text-af-brand-soft">{(creator.display_name || creator.username).slice(0, 1).toUpperCase()}</span>}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/${encodeURIComponent(creator.username)}`} className="block truncate text-sm font-semibold hover:underline">{creator.display_name || creator.username}</Link>
                        <p className="truncate text-xs text-af-muted">@{creator.username}</p>
                        <BadgeList userId={creator.id} className="mt-1.5" />
                        {creator.bio && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-af-text-2">{creator.bio}</p>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="recent-posts-title">
            <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="recent-posts-title" className="text-base font-semibold tracking-tight text-af-text">Recent posts</h2>
                <p className="mt-0.5 text-xs text-af-muted">Fresh public activity from the community.</p>
              </div>
            </header>
            {posts.length === 0 ? (
              <div className="px-4 pb-6 sm:px-6">
                <EmptyState title="Nothing to explore yet" body="New public posts will appear here." />
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-af-border bg-af-surface/40 sm:mx-6">
                <div className="divide-y divide-af-border">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} onEdit={user?.id === post.author_id ? startEdit : undefined} onDelete={user?.id === post.author_id ? deletePost : undefined} />
                  ))}
                </div>
              </div>
            )}
            {postsError && <div role="alert" className="mx-4 mt-3 rounded-xl border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger sm:mx-6">{postsError}</div>}
            {hasMorePosts && (
              <div className="px-4 pt-4 text-center sm:px-6">
                <button type="button" onClick={() => { void loadMorePosts(); }} disabled={loadingMore} className="af-action-secondary disabled:opacity-50">
                  {loadingMore ? "Loading…" : "Load more posts"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
