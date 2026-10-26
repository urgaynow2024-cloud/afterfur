"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";

type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };

export default function Bookmarks() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) { setLoading(false); return; }
    supabase.from("bookmarks").select("post_id").eq("user_id", user.id).then(async ({ data, error }: any) => {
      if (error) { setError(error.message); setLoading(false); return; }
      const ids = (data ?? []).map((r: any) => r.post_id);
      if (ids.length === 0) { setPosts([]); setLoading(false); return; }
      const { data: p, error: pe } = await supabase.from("posts").select("*").in("id", ids);
      if (pe) { setError(pe.message); setLoading(false); return; }
      const authorIds = [...new Set((p ?? []).map((x: any) => x.author_id))];
      let profMap = new Map();
      if (authorIds.length) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", authorIds);
        profMap = new Map((profs ?? []).map((x: any) => [x.id, x]));
      }
      const mapped = (p ?? []).map((x: any) => ({ ...x, profiles: profMap.get(x.author_id) || null }));
      setPosts(mapped as Post[]);
      setLoading(false);
    });
  }, [user]);

  if (!user) return <Shell><PageHeader title="Bookmarks" /><EmptyState title="Sign in to view bookmarks" body="Saved posts appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Bookmarks" />
      {loading ? <div className="p-8 text-center text-sm text-af-muted">Loading…</div> :
       error ? <div className="p-8 text-center text-sm text-af-danger">{error}</div> :
       posts.length === 0 ? <EmptyState title="Keep the good stuff close" body="Bookmark posts you want to find again." /> :
       <div className="divide-y divide-af-border">
         {posts.map((p) => (
           <PostCard key={p.id} post={p} bookmarked />
         ))}
       </div>}
    </Shell>
  );
}
