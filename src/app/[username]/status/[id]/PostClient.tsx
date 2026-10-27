"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";

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
      if (pe || !p) { setError("Post not found."); setLoading(false); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", p.author_id).maybeSingle();
      if (!prof || prof.username !== username) { setError("Post not found."); setLoading(false); return; }
      setPost({ ...p, profiles: prof });
      setLoading(false);
    };
    run();
  }, [username, id]);

  if (loading) return <Shell><PageHeader title="Post" /><div className="p-8 text-center text-sm text-af-muted">Loading…</div></Shell>;
  if (error || !post) return <Shell><PageHeader title="Post" /><EmptyState title="Post not found" body="This post may have been removed or is unavailable." /></Shell>;

  return (
    <Shell>
      <PageHeader title="Post" />
      <article className="border-b border-af-border px-4 py-3">
        <div className="flex gap-3">
          <Link href={`/${post.profiles?.username}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
            {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[15px]">
              <Link href={`/${post.profiles?.username}`} className="font-bold hover:underline">{post.profiles?.display_name || post.profiles?.username}</Link>
              <span className="text-af-muted">@{post.profiles?.username}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-[17px]">{post.content}</p>
          </div>
        </div>
      </article>
    </Shell>
  );
}
