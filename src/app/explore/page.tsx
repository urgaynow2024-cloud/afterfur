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
      ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", authorIds)
      : { data: [], error: null };
    if (authorError) { setError(authorError.message); setLoading(false); return; }
    const authorMap = new Map(((authorRows ?? []) as Creator[]).map((profile) => [profile.id, profile]));
    setCreators((creatorRows ?? []) as Creator[]);
    setPosts(foundPosts.map((post) => ({ ...post, profiles: authorMap.get(post.author_id) ?? null })));
    setHasMorePosts(foundPosts.length === 12);
    setLoading(false);
    } catch {
      setError("Explore could not reach the server. Please retry.");
      setLoading(false);
    }
  }, []);

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
        ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", authorIds)
        : { data: [], error: null };
      if (authorError) { setPostsError(authorError.message); return; }
      const authorMap = new Map(((authorRows ?? []) as Creator[]).map((profile) => [profile.id, profile]));
      setPosts((current) => mergeByIdPage(current, page.map((post) => ({ ...post, profiles: authorMap.get(post.author_id) ?? null })), true));
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
      <div className="border-b border-af-border p-4 sm:p-5">
        <Link href="/search" className="af-field flex items-center px-3 text-sm text-af-muted hover:border-af-brand-soft">Search people and posts</Link>
      </div>
      {loading ? <div role="status" className="p-8 text-center text-sm text-af-muted">Loading Explore…</div> : error ? <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger">{error}<button type="button" onClick={() => { void load(); }} className="ml-3 underline">Retry</button></div> : <>
        <section aria-labelledby="creator-discovery-title" className="border-b border-af-border">
          <header className="flex items-center justify-between px-4 py-3"><h2 id="creator-discovery-title" className="text-sm font-semibold">Recently joined creators</h2><Link href="/search" className="text-xs text-af-brand-soft hover:underline">Find someone</Link></header>
          {creators.length === 0 ? <EmptyState title="No creator profiles yet" body="Creator profiles will appear here when they join." /> : <ul className="divide-y divide-af-border">{creators.map((creator) => <li key={creator.id} className="flex items-center gap-3 px-4 py-3">
            <Link href={`/${encodeURIComponent(creator.username)}`} aria-label={`View ${creator.display_name || creator.username}'s profile`} className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
              {creator.avatar_url ? <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center font-semibold text-af-brand-soft">{(creator.display_name || creator.username).slice(0, 1).toUpperCase()}</span>}
            </Link>
            <div className="min-w-0"><Link href={`/${encodeURIComponent(creator.username)}`} className="block truncate text-sm font-semibold hover:underline">{creator.display_name || creator.username}</Link><p className="truncate text-xs text-af-muted">@{creator.username}</p><BadgeList userId={creator.id} className="mt-1" />{creator.bio && <p className="mt-1 line-clamp-2 text-xs text-af-text-2">{creator.bio}</p>}</div>
          </li>)}</ul>}
        </section>
        <section aria-labelledby="recent-posts-title"><h2 id="recent-posts-title" className="px-4 py-3 text-sm font-semibold">Recent posts</h2>{posts.length === 0 ? <EmptyState title="Nothing to explore yet" body="New public posts will appear here." /> : <div className="divide-y divide-af-border">{posts.map((post) => <PostCard key={post.id} post={post} onEdit={user?.id === post.author_id ? startEdit : undefined} onDelete={user?.id === post.author_id ? deletePost : undefined} />)}</div>}{postsError && <div role="alert" className="m-4 text-sm text-af-danger">{postsError}</div>}{hasMorePosts && <div className="p-4 text-center"><button type="button" onClick={() => { void loadMorePosts(); }} disabled={loadingMore} className="af-action-secondary disabled:opacity-50">{loadingMore ? "Loading…" : "Load more posts"}</button></div>}</section>
      </>}
    </Shell>
  );
}
