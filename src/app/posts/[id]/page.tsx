"use client";
import { useEffect, useState } from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import PostCard from "@/components/PostCard";

type Post = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};
type Reply = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  post_id: string;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function PostPageInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase not configured.");
      setLoading(false);
      return;
    }
    const { data: p, error: pe } = await supabase.from("posts").select("*").eq("id", id).single();
    if (pe) {
      setError(pe.message);
      setLoading(false);
      return;
    }
    const authorIds = [p.author_id];
    let profMap = new Map();
    const { data: profs } = await supabase.from("profiles").select("*").in("id", authorIds);
    profMap = new Map((profs ?? []).map((x: any) => [x.id, x]));
    setPost({ ...p, profiles: profMap.get(p.author_id) || null } as Post);

    const { data: r } = await supabase.from("replies").select("*").eq("post_id", id).order("created_at", { ascending: true });
    const rIds = [...new Set((r ?? []).map((x: any) => x.author_id))];
    let rProfMap = new Map();
    if (rIds.length) {
      const { data: rprofs } = await supabase.from("profiles").select("*").in("id", rIds);
      rProfMap = new Map((rprofs ?? []).map((x: any) => [x.id, x]));
    }
    setReplies(
      ((r ?? []).map((x: any) => ({ ...x, profiles: rProfMap.get(x.author_id) || null })) as Reply[])
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function submit() {
    const text = draft.trim();
    if (!text) return;
    const supabase = createClient();
    if (!supabase || !user) {
      setError("Sign in to reply.");
      return;
    }
    setSubmitting(true);
    setError("");
    const { error } = await supabase.from("replies").insert({ post_id: id, author_id: user.id, content: text });
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    setDraft("");
    setSubmitting(false);
    load();
  }

  return (
    <Shell>
      <PageHeader title="Post" />
      {loading ? (
        <div className="p-8 text-center text-sm text-af-muted">Loading…</div>
      ) : !post ? (
        <EmptyState title="Post not found" body="This post may have been removed or is unavailable." />
      ) : (
        <div>
          <article className="border-b border-af-border px-4 py-3">
            <div className="flex gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                {post.profiles?.avatar_url ? (
                  <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-af-accent to-af-accent-2" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[15px]">
                  <span className="truncate font-bold text-af-text">{post.profiles?.display_name || post.profiles?.username || "Unknown"}</span>
                  <span className="truncate text-af-muted">@{post.profiles?.username || "unknown"}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-[17px] leading-normal text-af-text">{post.content}</p>
                {post.media_urls && post.media_urls.length > 0 && (
                  <div className="mt-3 overflow-hidden rounded-2xl border border-af-border">
                    {post.media_urls.map((u) => (
                      <img key={u} src={u} alt="" className="max-h-[510px] w-full object-cover" />
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[15px] text-af-muted">{new Date(post.created_at).toLocaleString()}</p>
              </div>
            </div>
          </article>

          {user ? (
            <div className="border-b border-af-border px-4 py-3">
              <div className="flex gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                  <div className="h-full w-full bg-gradient-to-br from-af-accent to-af-accent-2" />
                </div>
                <div className="flex-1">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Post your reply"
                    className="w-full resize-none bg-transparent text-[17px] outline-none placeholder:text-af-muted"
                    rows={3}
                  />
                  <div className="mt-2 flex justify-end border-t border-af-border pt-2">
                    <button
                      onClick={submit}
                      disabled={!draft.trim() || submitting}
                      className="rounded-full bg-af-accent px-5 py-1.5 text-[15px] font-bold text-white transition-colors hover:bg-af-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitting ? "Replying..." : "Reply"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b border-af-border p-4 text-center">
              <Link href="/signin" className="text-af-accent hover:underline">
                Sign in to reply
              </Link>
            </div>
          )}

          {error && <div className="border-b border-af-border px-4 py-3 text-sm text-af-danger">{error}</div>}

          {replies.length === 0 ? (
            <EmptyState title="No replies yet" body="Be the first to reply." />
          ) : (
            <div>
              {replies.map((r) => (
                <article key={r.id} className="border-b border-af-border px-4 py-3 transition-colors hover:bg-af-surface/40">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                      {r.profiles?.avatar_url ? (
                        <img src={r.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-af-accent to-af-accent-2" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[15px]">
                        <span className="truncate font-bold text-af-text">{r.profiles?.display_name || r.profiles?.username || "Unknown"}</span>
                        <span className="truncate text-af-muted">@{r.profiles?.username || "unknown"}</span>
                        <span className="text-af-muted">·</span>
                        <span className="text-af-muted">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-normal text-af-text">{r.content}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
}

export default function PostPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-af-muted">Loading…</div>}>
      <PostPageInner />
    </Suspense>
  );
}
