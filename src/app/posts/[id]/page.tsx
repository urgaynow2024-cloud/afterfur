"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import EmojiPicker from "@/components/EmojiPicker";
import PostCard from "@/components/PostCard";
import { BadgeList } from "@/components/BadgeList";
import { usePostInteractions } from "@/components/PostInteractionProvider";

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
  parent_reply_id?: string | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function ReplyThread({ reply, replies, depth, replyingTo, setReplyingTo, draft, setDraft, submitting, onSubmit, insertReplyEmoji, replyTextareaRef, currentUserProfile, currentUser }: { reply: Reply; replies: Reply[]; depth: number; replyingTo: string | null; setReplyingTo: (id: string | null) => void; draft: string; setDraft: (v: string) => void; submitting: boolean; onSubmit: () => void; insertReplyEmoji: (emoji: string) => void; replyTextareaRef: React.RefObject<HTMLTextAreaElement | null>; currentUserProfile?: { avatar_url?: string | null; display_name?: string | null } | null; currentUser?: { email?: string } | null }) {
  const children = replies.filter((r) => r.parent_reply_id === reply.id);
  return (
    <article className={`border-b border-af-border px-4 py-4 transition-colors hover:bg-af-surface/40 sm:px-5 ${depth > 0 ? "ml-4 border-l border-af-border pl-4 sm:ml-8" : ""}`}>
      <div className="flex gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
          {reply.profiles?.avatar_url ? <img src={reply.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-af-accent to-af-accent-2 text-sm font-bold text-white">{(reply.profiles?.display_name || reply.profiles?.username || "?").slice(0, 1).toUpperCase()}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[15px]">
            <span className="truncate font-bold text-af-text">{reply.profiles?.display_name || reply.profiles?.username || "Unknown"}</span>
            <span className="truncate text-af-muted">@{reply.profiles?.username || "unknown"}</span>
            <BadgeList userId={reply.author_id} />
            <span className="text-af-muted">·</span>
            <span className="text-af-muted">{new Date(reply.created_at).toLocaleString()}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-normal text-af-text">{reply.content}</p>
          <button onClick={() => setReplyingTo(reply.id)} className="mt-2 text-xs font-medium text-af-accent hover:underline">Reply</button>
              {replyingTo === reply.id && (
                <div className="mt-3 flex gap-3">
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                    {currentUserProfile?.avatar_url ? <img src={currentUserProfile.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-af-accent to-af-accent-2 text-xs font-bold text-white">{(currentUserProfile?.display_name || currentUser?.email || "?").slice(0, 1).toUpperCase()}</div>}
                  </div>
                  <div className="flex-1">
                <textarea ref={replyTextareaRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Post your reply" className="w-full resize-none bg-transparent text-[15px] outline-none placeholder:text-af-muted" rows={2} />
                <div className="mt-2 flex items-center justify-between border-t border-af-border pt-2">
                  <EmojiPicker onPick={insertReplyEmoji} />
                  <button onClick={onSubmit} disabled={!draft.trim() || submitting} className="rounded-full bg-af-accent px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-af-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
                    {submitting ? "Replying..." : "Reply"}
                  </button>
                </div>
              </div>
            </div>
          )}
          {depth < 4 && children.map((child) => (
            <ReplyThread key={child.id} reply={child} replies={replies} depth={depth + 1} replyingTo={replyingTo} setReplyingTo={setReplyingTo} draft={draft} setDraft={setDraft} submitting={submitting} onSubmit={onSubmit} insertReplyEmoji={insertReplyEmoji} replyTextareaRef={replyTextareaRef} currentUserProfile={currentUserProfile} currentUser={currentUser} />
          ))}
        </div>
      </div>
    </article>
  );
}

function PostPageInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const interactions = usePostInteractions();
  const [post, setPost] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ avatar_url?: string | null; display_name?: string | null } | null>(null);
  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    supabase.from("profiles").select("avatar_url,display_name").eq("id", user.id).maybeSingle().then((result: { data: { avatar_url: string | null; display_name: string | null } | null }) => setCurrentUserProfile(result.data));
  }, [user]);
  function insertReplyEmoji(emoji: string) {
    const textarea = replyTextareaRef.current;
    if (!textarea) { setDraft((d) => d + emoji); return; }
    const start = textarea.selectionStart ?? draft.length;
    const end = textarea.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + emoji.length;
      textarea.setSelectionRange(pos, pos);
    });
  }
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase not configured.");
      setLoading(false);
      return;
    }
    const { data: p, error: pe } = await supabase.from("posts").select("*").eq("id", id).single();
    if (pe || !p.created_at) {
      setError(pe?.message ?? "This post has incomplete data.");
      setLoading(false);
      return;
    }
    const authorIds = [p.author_id];
    let profMap = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null }>();
    const { data: profs, error: profileError } = await supabase.from("profiles").select("*").in("id", authorIds);
    if (profileError) { setError(profileError.message); setLoading(false); return; }
    profMap = new Map((profs ?? []).map((x: { id: string; username: string; display_name: string | null; avatar_url: string | null }) => [x.id, x]));
    setPost({ ...p, profiles: profMap.get(p.author_id) || null } as Post);

    const { data: r, error: replyError } = await supabase.from("replies").select("*").eq("post_id", id).order("created_at", { ascending: true }).limit(500);
    if (replyError) { setError(replyError.message); setLoading(false); return; }
    const validReplies = (r ?? []).filter((reply) => reply.author_id && reply.post_id && reply.created_at);
    const rIds = [...new Set(validReplies.flatMap((reply) => reply.author_id ? [reply.author_id] : []))];
    let rProfMap = new Map();
    if (rIds.length) {
      const { data: rprofs, error: replyProfilesError } = await supabase.from("profiles").select("*").in("id", rIds);
      if (replyProfilesError) { setError(replyProfilesError.message); setLoading(false); return; }
      rProfMap = new Map((rprofs ?? []).map((x: { id: string; username: string; display_name: string | null; avatar_url: string | null }) => [x.id, x]));
    }
    setReplies(
      (validReplies.map((x) => ({ ...x, author_id: x.author_id!, post_id: x.post_id!, created_at: x.created_at!, parent_reply_id: x.parent_reply_id ?? null, profiles: rProfMap.get(x.author_id!) || null })) as Reply[])
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit() {
    if (submitting || submittingRef.current) return;
    const text = draft.trim();
    if (!text) return;
    const supabase = createClient();
    if (!supabase || !user) {
      setError("Sign in to reply.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    let inserted = false;
    try {
      const { error: insertError } = await supabase.from("replies").insert({ post_id: id, author_id: user.id, content: text, parent_reply_id: replyingTo });
      if (insertError) { setError(insertError.message); return; }
      inserted = true;
      setDraft("");
      setReplyingTo(null);
      if (post?.author_id && post.author_id !== user.id) {
        try {
          const { error: notificationError } = await supabase.rpc("create_post_notification", { p_recipient_id: post.author_id, p_post_id: id, p_type: "reply" });
          if (notificationError) console.error("Could not create reply notification:", notificationError.message);
        } catch (notificationError) {
          console.error("Could not create reply notification:", notificationError);
        }
      }
      interactions?.requestReplyCount(id, true);
      try {
        await load();
      } catch {
        setError("Reply was published, but the thread could not be refreshed. Try again.");
      }
    } catch {
      setError(inserted ? "Reply was published, but the thread could not be refreshed." : "Could not publish the reply. Your draft is still here.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <PageHeader title="Post" subtitle="Conversation" />
      {loading ? (
        <div className="p-8 text-center text-sm text-af-muted">Loading…</div>
      ) : error && !post ? (
        <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger">{error}<button type="button" onClick={() => { void load(); }} className="ml-3 underline">Retry</button></div>
      ) : !post ? (
        <EmptyState title="Post not found" body="This post may have been removed or is unavailable." />
      ) : (
        <div>
          <PostCard post={post} />
          {user ? (
            <div className="border-b border-af-border px-4 py-4 sm:px-5">
              <div className="flex gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                  {currentUserProfile?.avatar_url ? <img src={currentUserProfile.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-af-accent to-af-accent-2 text-sm font-bold text-white">{(currentUserProfile?.display_name || user.email || "?").slice(0, 1).toUpperCase()}</div>}
                </div>
                <div className="flex-1">
                  <textarea
                    ref={replyTextareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Post your reply"
                    aria-label="Write a reply"
                    className="min-h-24 w-full resize-y bg-transparent py-1 text-[15px] leading-6 text-af-text outline-none placeholder:text-af-muted"
                    rows={3}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-af-border pt-3">
                    <EmojiPicker onPick={insertReplyEmoji} />
                    <button
                      onClick={submit}
                      disabled={!draft.trim() || submitting}
                      className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
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

          {error && <div role="alert" className="border-b border-af-border px-4 py-3 text-sm text-af-danger">{error}<button type="button" onClick={() => { void load(); }} className="ml-3 underline">Retry</button></div>}

          {replies.length === 0 ? (
            <EmptyState title="No replies yet" body="Be the first to reply." />
          ) : (
            <div>
              {replies.filter((r) => !r.parent_reply_id).map((r) => (
                <ReplyThread key={r.id} reply={r} replies={replies} depth={0} replyingTo={replyingTo} setReplyingTo={setReplyingTo} draft={draft} setDraft={setDraft} submitting={submitting} onSubmit={submit} insertReplyEmoji={insertReplyEmoji} replyTextareaRef={replyTextareaRef} currentUserProfile={currentUserProfile} currentUser={user} />
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

export default function PostPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-af-muted">Loading…</div>}>
      <PostPageInner />
    </Suspense>
  );
}
