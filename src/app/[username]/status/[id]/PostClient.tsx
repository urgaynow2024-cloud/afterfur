"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import { useAuth } from "@/components/AuthProvider";
import { loadMyMembershipStatus } from "@/lib/pawpass";

type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };

export default function PostClient() {
  const { username, id } = useParams<{ username: string; id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPawPass, setIsPawPass] = useState(false);
  const [boostMsg, setBoostMsg] = useState("");

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase) { setError("Supabase not configured."); setLoading(false); return; }
      const res = await fetch(`/api/post/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (res.status === 403) {
        setError("Post not found.");
        setLoading(false);
        return;
      }
      if (res.status === 404) {
        setError("Post not found.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Post not found.");
        setLoading(false);
        return;
      }
      const json = await res.json();
      const p = json?.post;
      if (!p) {
        setError("Post not found.");
        setLoading(false);
        return;
      }
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", p.author_id).maybeSingle();
      if (!prof || prof.username !== username) { setError("Post not found."); setLoading(false); return; }

      setPost({ ...p, created_at: p.created_at, profiles: prof });
      setLoading(false);
    };
    run();
  }, [username, id, user]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    let cancelled = false;
    void loadMyMembershipStatus(supabase).then(({ status }) => {
      if (cancelled) return;
      const active = !!status && (status.status === "active" || status.status === "cancel_at_period_end") && !!status.currentPeriodEnd && new Date(status.currentPeriodEnd).getTime() > Date.now();
      setIsPawPass(active);
    });
    return () => { cancelled = true; };
  }, [user]);

  if (loading) return <Shell><PageHeader title="Post" /><div className="p-8 text-center text-sm text-af-muted">Loading…</div></Shell>;
  if (error || !post) return <Shell><PageHeader title="Post" /><EmptyState title="Post not found" body="This post may have been removed or is unavailable." /></Shell>;

  return (
    <Shell>
      <PageHeader title="Post" subtitle={`@${post.profiles?.username || username}`} />
      <PostCard post={post} />
      {post.author_id === user?.id && isPawPass && (
        <div className="border-b border-af-border px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={async () => {
              const supabase = createClient();
              if (!supabase || !user) return;
              const { data, error } = await (supabase as any).rpc("consume_post_boost", { p_post_id: post.id });
              if (error) setBoostMsg(error.message); else setBoostMsg(`Boosted. Remaining: ${data?.remaining ?? 0}`);
            }}
            className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white"
          >
            Boost post (PawPass)
          </button>
          {boostMsg && <p className="mt-2 text-xs text-af-muted">{boostMsg}</p>}
        </div>
      )}
      <div className="border-b border-af-border px-4 py-4 sm:px-5">
        <Link href={`/posts/${encodeURIComponent(post.id)}`} className="inline-flex min-h-10 items-center rounded-md border border-af-border-strong px-3 text-sm font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2">
          Open discussion and replies <span aria-hidden="true" className="ml-2">→</span>
        </Link>
        <p className="mt-2 text-xs text-af-muted"><time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time></p>
      </div>
    </Shell>
  );
}
