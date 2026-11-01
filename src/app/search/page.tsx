"use client";
import { useRef, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import { mergeByIdPage, pageRange } from "@/lib/search";
import { BadgeList } from "@/components/BadgeList";

type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };
type ProfileSummary = { id: string; username: string; display_name: string | null; avatar_url: string | null };

export default function Search() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Post[]>([]);
  const [people, setPeople] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const searchRequest = useRef(0);

  async function deletePost(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) return;
    const { error: deleteError } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", user.id);
    if (deleteError) return;
    setResults((rs) => rs.filter((r) => r.id !== postId));
  }

  function startEdit(postId: string) {
    const post = results.find((p) => p.id === postId);
    if (!post || post.author_id !== user?.id) return;
    if (post.profiles?.username) {
      window.location.href = `/${post.profiles.username}/status/${postId}`;
    }
  }
  async function run(loadMore = false) {
    const term = q.trim();
    if (!term) return;
    if (loading || loadingMore) return;
    const supabase = createClient();
    if (!supabase) { setError("Supabase not configured."); return; }
    const requestId = ++searchRequest.current;
    const offset = loadMore ? results.length : 0;
    const [from, to] = pageRange(offset, 20);
    if (loadMore) setLoadingMore(true);
    else { setLoading(true); setResults([]); setPeople([]); setHasMorePosts(false); }
    setError(""); setSearched(true);
    const escapedTerm = term.replace(/[\\%_]/g, "\\$&");
    const pattern = `%${escapedTerm}%`;
    try {
    const [{ data, error }, { data: usernames, error: usernameError }, { data: displayNames, error: displayError }] = await Promise.all([
      supabase.from("posts").select("*").ilike("content", pattern).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to),
      loadMore ? Promise.resolve({ data: [], error: null }) : supabase.from("profiles").select("id,username,display_name,avatar_url").ilike("username", pattern).limit(20),
      loadMore ? Promise.resolve({ data: [], error: null }) : supabase.from("profiles").select("id,username,display_name,avatar_url").ilike("display_name", pattern).limit(20),
    ]);
    if (requestId !== searchRequest.current) return;
    if (error || usernameError || displayError) setError((error || usernameError || displayError)?.message ?? "Search failed.");
    else {
      const foundPeople = new Map<string, ProfileSummary>();
      for (const profile of [...(usernames ?? []), ...(displayNames ?? [])] as ProfileSummary[]) foundPeople.set(profile.id, profile);
      if (!loadMore) setPeople([...foundPeople.values()].slice(0, 20));
      const posts = (data ?? []) as Post[];
      setHasMorePosts(posts.length === 20);
      const authorIds = [...new Set(posts.map((post) => post.author_id))];
      const { data: profiles, error: profilesError } = authorIds.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url,is_private").in("id", authorIds) : { data: [], error: null };
      if (requestId !== searchRequest.current) return;
      if (profilesError) {
        setError(profilesError.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const profileMap = new Map<string, ProfileSummary>(((profiles ?? []) as ProfileSummary[]).map((profile: { id: string; username: string; display_name: string | null; avatar_url: string | null }) => [profile.id, profile]));
      const visiblePosts = posts.filter((post) => {
        const prof = profileMap.get(post.author_id);
        const isPrivate = !!(prof as any)?.is_private;
        const isBlocked = false;
        if (isPrivate && post.author_id !== user?.id) return false;
        if (isBlocked) return false;
        return true;
      }).map((post) => ({ ...post, profiles: profileMap.get(post.author_id) || null }));
      setResults((current) => mergeByIdPage(current, visiblePosts, loadMore));
    }
    } catch {
      if (requestId === searchRequest.current) setError("Search could not reach the server. Please try again.");
    } finally {
      if (requestId === searchRequest.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  return (
    <Shell>
      <PageHeader title="Search" subtitle="Find people and posts across AfterFur." />
      <div className="px-4 py-4 sm:px-6">
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex flex-col gap-3 rounded-2xl border border-af-border-strong bg-af-surface/80 p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
          <label htmlFor="post-search" className="sr-only">Search posts</label>
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-af-border bg-af-bg/60 px-3 focus-within:border-af-brand-soft">
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-af-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="post-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" className="min-h-11 w-full bg-transparent text-sm text-af-text placeholder:text-af-muted focus:outline-none" />
          </div>
          <button type="submit" disabled={loading || !q.trim()} className="min-h-11 rounded-xl bg-af-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
        </form>
      </div>
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center px-6 py-12 text-sm text-af-muted">Loading…</div>
      ) : error && results.length === 0 && people.length === 0 ? (
        <div role="alert" className="m-4 rounded-2xl border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger sm:m-6">{error}</div>
      ) : !searched ? (
        <div className="px-4 py-6 sm:px-6">
          <EmptyState title="What are you looking for?" body="Search for people, posts and hashtags." />
        </div>
      ) : results.length === 0 && people.length === 0 ? (
        <div className="px-4 py-6 sm:px-6">
          <EmptyState title="No results" body="Try a different search." />
        </div>
      ) : (
        <div className="space-y-4 pb-6 sm:space-y-6">
          {error && <div role="alert" className="mx-4 rounded-2xl border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger sm:mx-6">{error}</div>}
          {people.length > 0 && (
            <section aria-labelledby="people-results-title" className="overflow-hidden rounded-2xl border border-af-border bg-af-surface/40 sm:mx-6">
              <header className="border-b border-af-border px-4 py-3 sm:px-5">
                <h2 id="people-results-title" className="text-base font-semibold tracking-tight text-af-text">People</h2>
                <p className="mt-0.5 text-xs text-af-muted">{people.length} match{people.length === 1 ? "" : "es"}.</p>
              </header>
              <ul className="divide-y divide-af-border">{people.map((person) => (
                <li key={person.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Link href={`/${encodeURIComponent(person.username)}`} aria-label={`View ${person.display_name || person.username}'s profile`} className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                    {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-sm font-semibold text-af-brand-soft">{(person.display_name || person.username).slice(0, 1).toUpperCase()}</span>}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link href={`/${encodeURIComponent(person.username)}`} className="block truncate text-sm font-semibold hover:underline">{person.display_name || person.username}</Link>
                    <p className="truncate text-xs text-af-muted">@{person.username}</p>
                    <BadgeList userId={person.id} className="mt-1" />
                  </div>
                </li>
              ))}</ul>
            </section>
          )}
          {results.length > 0 && (
            <section aria-labelledby="post-results-title" className="overflow-hidden rounded-2xl border border-af-border bg-af-surface/40 sm:mx-6">
              <header className="border-b border-af-border px-4 py-3 sm:px-5">
                <h2 id="post-results-title" className="text-base font-semibold tracking-tight text-af-text">Posts</h2>
                <p className="mt-0.5 text-xs text-af-muted">{results.length} result{results.length === 1 ? "" : "s"}.</p>
              </header>
              <div className="divide-y divide-af-border">{results.map((post) => (
                <PostCard key={post.id} post={post} onEdit={user?.id === post.author_id ? startEdit : undefined} onDelete={user?.id === post.author_id ? deletePost : undefined} />
              ))}</div>
              {hasMorePosts && (
                <div className="border-t border-af-border p-4 text-center">
                  <button type="button" onClick={() => { void run(true); }} disabled={loadingMore || loading} className="af-action-secondary disabled:opacity-50">{loadingMore ? "Loading…" : "Load more posts"}</button>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}
