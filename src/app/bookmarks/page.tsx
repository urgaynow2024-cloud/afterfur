"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import { usePostInteractions } from "@/components/PostInteractionProvider";

type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };
type BookmarkRow = { post_id: string };
type BookmarkAuthor = NonNullable<Post["profiles"]> & { id: string };

export default function Bookmarks() {
  const { user } = useAuth();
  const interactions = usePostInteractions();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    if (!user) return;
    const timer = window.setTimeout(() => {
      const load = async () => {
        if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
        const { data, error } = await supabase.from("bookmarks").select("post_id").eq("user_id", user.id);
        if (error) { setError(error.message); setLoading(false); return; }
        const ids = ((data ?? []) as BookmarkRow[]).map((row) => row.post_id);
        if (ids.length === 0) { setPosts([]); setLoading(false); return; }
        const { data: rows, error: postsError } = await supabase.from("posts").select("*").in("id", ids);
        if (postsError) { setError(postsError.message); setLoading(false); return; }
        const savedPosts = (rows ?? []) as Post[];
        const authorIds = [...new Set(savedPosts.map((post) => post.author_id))];
        let profileMap = new Map<string, BookmarkAuthor>();
        if (authorIds.length) {
          const { data: authors, error: authorsError } = await supabase.from("profiles").select("*").in("id", authorIds);
          if (authorsError) { setError(authorsError.message); setLoading(false); return; }
          profileMap = new Map(((authors ?? []) as BookmarkAuthor[]).map((author) => [author.id, author]));
        }
        setPosts(savedPosts.map((post) => ({ ...post, profiles: profileMap.get(post.author_id) ?? null })));
        setLoading(false);
      };
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  if (!user) return <Shell><PageHeader title="Bookmarks" /><EmptyState title="Sign in to view bookmarks" body="Saved posts appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  const visiblePosts = posts.filter((post) => !interactions?.available || interactions.bookmarked(post.id));

  return (
    <Shell>
      <PageHeader title="Bookmarks" />
      {loading || !interactions?.ready ? <div className="p-8 text-center text-sm text-af-muted">Loading</div> :
       error ? <div className="p-8 text-center text-sm text-af-danger">{error}</div> :
       visiblePosts.length === 0 ? <EmptyState title="Keep the good stuff close" body="Bookmark posts you want to find again." /> :
       <div className="divide-y divide-af-border">
         {visiblePosts.map((p) => (
           <PostCard key={p.id} post={p} />
         ))}
       </div>}
    </Shell>
  );
}

export const dynamic = 'force-dynamic';

