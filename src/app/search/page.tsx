"use client";
import { useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";

type Post = { id: string; content: string; created_at: string };

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    const term = q.trim();
    if (!term) return;
    const supabase = createClient();
    if (!supabase) { setError("Supabase not configured."); return; }
    setLoading(true); setError(""); setSearched(true);
    const { data, error } = await supabase.from("posts").select("*").ilike("content", `%${term}%`).limit(20);
    if (error) setError(error.message);
    else setResults((data as Post[]) ?? []);
    setLoading(false);
  }

  return (
    <Shell>
      <PageHeader title="Search" />
      <div className="p-4 border-b border-af-border">
        <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts…" className="flex-1 rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
          <button type="submit" className="rounded-full bg-af-accent px-4 py-2 text-sm font-semibold text-black">Search</button>
        </form>
      </div>
      {loading ? <div className="p-8 text-center text-sm text-af-muted">Loading…</div> :
       error ? <div className="p-8 text-center text-sm text-af-danger">{error}</div> :
       !searched ? <EmptyState title="What are you looking for?" body="Search for people, posts and hashtags." /> :
       results.length === 0 ? <EmptyState title="No results" body="Try a different search." /> :
       <div className="divide-y divide-af-border">
         {results.map((p) => (
           <article key={p.id} className="p-4">
             <p className="text-sm">{p.content}</p>
             <p className="mt-1 text-xs text-af-muted">{new Date(p.created_at).toLocaleString()}</p>
           </article>
         ))}
       </div>}
    </Shell>
  );
}
