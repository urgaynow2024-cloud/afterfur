"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import PostCard from "@/components/PostCard";

type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };

export default function PostClient() {
  const { username, id } = useParams<{ username: string; id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase) { setError("Supabase not configured."); setLoading(false); return; }
      const { data: p, error: pe } = await supabase.from("posts").select("*").eq("id", id).single();
      if (pe) { setError("Post not found."); setLoading(false); return; }
      if (typeof p.created_at !== "string") { setError("Post not found."); setLoading(false); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", p.author_id).maybeSingle();
      if (!prof || prof.username !== username) { setError("Post not found."); setLoading(false); return; }
      setPost({ ...p, created_at: p.created_at, profiles: prof });
      setLoading(false);
    };
    run();
  }, [username, id]);

  if (loading) return <Shell><PageHeader title="Post" /><div className="p-8 text-center text-sm text-af-muted">Loading…</div></Shell>;
  if (error || !post) return <Shell><PageHeader title="Post" /><EmptyState title="Post not found" body="This post may have been removed or is unavailable." /></Shell>;

  return (
    <Shell>
      <PageHeader title="Post" subtitle={`@${post.profiles?.username || username}`} />
      <PostCard post={post} />
      <div className="border-b border-af-border px-4 py-4 sm:px-5">
        <Link href={`/posts/${encodeURIComponent(post.id)}`} className="inline-flex min-h-10 items-center rounded-md border border-af-border-strong px-3 text-sm font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2">
          Open discussion and replies <span aria-hidden="true" className="ml-2">→</span>
        </Link>
        <p className="mt-2 text-xs text-af-muted"><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time></p>
      </div>
    </Shell>
  );
}
