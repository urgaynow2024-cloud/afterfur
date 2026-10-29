"use client";
import { useRef, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import Link from "next/link";
import { mergeByIdPage, pageRange } from "@/lib/search";
import { BadgeList } from "@/components/BadgeList";

type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };
type ProfileSummary = { id: string; username: string; display_name: string | null; avatar_url: string | null };

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Post[]>([]);
  const [people, setPeople] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const searchRequest = useRef(0);

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
      const { data: profiles, error: profilesError } = authorIds.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", authorIds) : { data: [], error: null };
      if (requestId !== searchRequest.current) return;
      if (profilesError) {
        setError(profilesError.message);
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const profileMap = new Map<string, ProfileSummary>(((profiles ?? []) as ProfileSummary[]).map((profile) => [profile.id, profile]));
      const nextPosts = posts.map((post) => ({ ...post, profiles: profileMap.get(post.author_id) || null }));
      setResults((current) => mergeByIdPage(current, nextPosts, loadMore));
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
      <PageHeader title="Search" />
      <div className="border-b border-af-border p-4 sm:p-5">
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="post-search" className="sr-only">Search posts</label>
          <input id="post-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" className="af-field min-w-0 flex-1 px-3 text-sm" />
          <button type="submit" disabled={loading || !q.trim()} className="min-h-11 rounded-md bg-af-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
        </form>
      </div>
      {loading ? <div className="p-8 text-center text-sm text-af-muted">Loading…</div> :
       error && results.length === 0 && people.length === 0 ? <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger">{error}</div> :
       !searched ? <EmptyState title="What are you looking for?" body="Search for people, posts and hashtags." /> :
       results.length === 0 && people.length === 0 ? <EmptyState title="No results" body="Try a different search." /> : <>
         {error && <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger">{error}</div>}
         {people.length > 0 && <section aria-labelledby="people-results-title" className="border-b border-af-border">
           <h2 id="people-results-title" className="px-4 py-3 text-sm font-semibold text-af-text">People</h2>
           <ul className="divide-y divide-af-border">{people.map((person) => <li key={person.id} className="flex items-center gap-3 px-4 py-3">
             <Link href={`/${encodeURIComponent(person.username)}`} aria-label={`View ${person.display_name || person.username}'s profile`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
               {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-sm font-semibold text-af-brand-soft">{(person.display_name || person.username).slice(0, 1).toUpperCase()}</span>}
             </Link>
             <div className="min-w-0"><Link href={`/${encodeURIComponent(person.username)}`} className="block truncate text-sm font-semibold hover:underline">{person.display_name || person.username}</Link><p className="truncate text-xs text-af-muted">@{person.username}</p><BadgeList userId={person.id} className="mt-1" /></div>
           </li>)}</ul>
         </section>}
         {results.length > 0 && <section aria-labelledby="post-results-title"><h2 id="post-results-title" className="px-4 py-3 text-sm font-semibold text-af-text">Posts</h2><div className="divide-y divide-af-border">{results.map((post) => <PostCard key={post.id} post={post} />)}</div>{hasMorePosts && <div className="p-4 text-center"><button type="button" onClick={() => { void run(true); }} disabled={loadingMore || loading} className="af-action-secondary disabled:opacity-50">{loadingMore ? "Loading…" : "Load more posts"}</button></div>}</section>}
       </>}
    </Shell>
  );
}
