"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseProfileCustomisation, nameStyle } from "@/lib/profileCustomisation";
import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import EmojiPicker from "@/components/EmojiPicker";
import PostCard from "@/components/PostCard";
import { BadgeList } from "@/components/BadgeList";
import { usePostInteractions } from "@/components/PostInteractionProvider";
import ReportDialog from "@/components/ReportDialog";

type Post = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null; profile_customisation?: Record<string, unknown> | null } | null;
};
type Reply = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  post_id: string;
  parent_reply_id?: string | null;
  edited_at?: string | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null; profile_customisation?: Record<string, unknown> | null } | null;
};

function ReplyThread({ reply, replies, depth, replyingTo, setReplyingTo, draft, setDraft, submitting, onSubmit, insertReplyEmoji, replyTextareaRef, currentUserProfile, currentUser, currentUserId, editingReplyId, editReplyDraft, setEditReplyDraft, editReplySubmitting, onStartEdit, onSaveEdit, onCancelEdit, onDelete, confirmDeleteId, setConfirmDeleteId }: { reply: Reply; replies: Reply[]; depth: number; replyingTo: string | null; setReplyingTo: (id: string | null) => void; draft: string; setDraft: (v: string) => void; submitting: boolean; onSubmit: () => void; insertReplyEmoji: (emoji: string) => void; replyTextareaRef: React.RefObject<HTMLTextAreaElement | null>; currentUserProfile?: { avatar_url?: string | null; display_name?: string | null } | null; currentUser?: { email?: string } | null; currentUserId: string | null; editingReplyId: string | null; editReplyDraft: string; setEditReplyDraft: (v: string) => void; editReplySubmitting: boolean; onStartEdit: (reply: Reply) => void; onSaveEdit: (replyId: string) => void; onCancelEdit: () => void; onDelete: (replyId: string) => void; confirmDeleteId: string | null; setConfirmDeleteId: (id: string | null) => void }) {
  const children = replies.filter((r) => r.parent_reply_id === reply.id);
  const [reportingReply, setReportingReply] = useState<string | null>(null);
  return (
    <>
      <article className={`px-4 py-4 transition-colors hover:bg-af-surface-2/40 sm:px-5 ${depth > 0 ? "ml-2 border-l-2 border-af-border pl-4 sm:ml-6 sm:pl-5" : ""}`}>
        <div className="flex gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
            {reply.profiles?.avatar_url ? <img src={reply.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-af-accent to-af-accent-2 text-sm font-bold text-white">{(reply.profiles?.display_name || reply.profiles?.username || "?").slice(0, 1).toUpperCase()}</div>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <span className="truncate font-bold text-af-text" style={nameStyle(parseProfileCustomisation(reply.profiles?.profile_customisation).displayNameColor, parseProfileCustomisation(reply.profiles?.profile_customisation).displayNameEffect ?? undefined)}>{reply.profiles?.display_name || reply.profiles?.username || "Unknown"}</span>
              <span className="truncate text-af-muted" style={nameStyle(parseProfileCustomisation(reply.profiles?.profile_customisation).usernameColor, parseProfileCustomisation(reply.profiles?.profile_customisation).usernameEffect ?? undefined)}>@{reply.profiles?.username || "unknown"}</span>
              <BadgeList userId={reply.author_id} />
              <span className="text-af-muted">·</span>
              <time dateTime={reply.created_at} className="text-af-muted">{new Date(reply.created_at).toLocaleString()}</time>
            </div>
            {editingReplyId === reply.id ? (
              <div className="mt-3 space-y-2 rounded-xl border border-af-border bg-af-surface/60 p-3">
                <textarea value={editReplyDraft} onChange={(e) => setEditReplyDraft(e.target.value)} maxLength={300} rows={3} className="af-field min-h-20 w-full resize-y px-3 py-2 text-sm leading-relaxed" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-af-muted">{editReplyDraft.length}/300</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={onCancelEdit} disabled={editReplySubmitting} className="af-action-secondary">Cancel</button>
                    <button type="button" onClick={() => onSaveEdit(reply.id)} disabled={editReplySubmitting || !editReplyDraft.trim() || editReplyDraft.length > 300} className="min-h-9 rounded-md bg-af-brand px-4 text-xs font-semibold text-white disabled:opacity-50">{editReplySubmitting ? "Saving…" : "Save"}</button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-af-text">{reply.content}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={() => setReplyingTo(reply.id)} className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2 hover:text-af-text">Reply</button>
              <button onClick={() => setReportingReply(reply.id)} className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2 hover:text-af-text">Report</button>
              {currentUserId && currentUserId === reply.author_id && editingReplyId !== reply.id && (
                <>
                  <button onClick={() => onStartEdit(reply)} className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2 hover:text-af-text">Edit</button>
                  {confirmDeleteId === reply.id ? (
                    <>
                      <span className="text-xs text-af-muted">Delete reply?</span>
                      <button onClick={() => onDelete(reply.id)} className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-af-danger transition-colors hover:bg-af-danger/10">Confirm</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-af-muted transition-colors hover:bg-af-surface-2">Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(reply.id)} className="inline-flex min-h-9 items-center rounded-md px-2 text-xs font-medium text-af-danger transition-colors hover:bg-af-danger/10">Delete</button>
                  )}
                </>
              )}
            </div>
            {replyingTo === reply.id && (
              <div className="mt-3 flex gap-3 rounded-xl border border-af-border bg-af-surface/60 p-3">
                <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                  {currentUserProfile?.avatar_url ? <img src={currentUserProfile.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-af-accent to-af-accent-2 text-xs font-bold text-white">{(currentUserProfile?.display_name || currentUser?.email || "?").slice(0, 1).toUpperCase()}</div>}
                </div>
                <div className="flex-1">
                  <p className="mb-2 text-xs text-af-muted">Replying to @{reply.profiles?.username || "unknown"} <button type="button" onClick={() => { setReplyingTo(null); setDraft(""); }} className="ml-2 text-af-brand-soft hover:underline">Cancel</button></p>
                  <textarea ref={replyTextareaRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Post your reply" className="w-full resize-none bg-transparent text-[15px] leading-6 text-af-text outline-none placeholder:text-af-muted" rows={2} />
                  <div className="mt-2 flex items-center justify-between border-t border-af-border pt-2">
                    <EmojiPicker onPick={insertReplyEmoji} />
                    <button onClick={onSubmit} disabled={!draft.trim() || submitting} className="min-h-9 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
                      {submitting ? "Replying…" : "Reply"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {depth < 4 && children.length > 0 && (
              <div className="mt-3 space-y-1">
                {children.map((child) => (
                  <ReplyThread key={child.id} reply={child} replies={replies} depth={depth + 1} replyingTo={replyingTo} setReplyingTo={setReplyingTo} draft={draft} setDraft={setDraft} submitting={submitting} onSubmit={onSubmit} insertReplyEmoji={insertReplyEmoji} replyTextareaRef={replyTextareaRef} currentUserProfile={currentUserProfile} currentUser={currentUser} currentUserId={currentUserId} editingReplyId={editingReplyId} editReplyDraft={editReplyDraft} setEditReplyDraft={setEditReplyDraft} editReplySubmitting={editReplySubmitting} onStartEdit={onStartEdit} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} onDelete={onDelete} confirmDeleteId={confirmDeleteId} setConfirmDeleteId={setConfirmDeleteId} />
                ))}
              </div>
            )}
          </div>
        </div>
      </article>
      <ReportDialog open={reportingReply === reply.id} onClose={() => setReportingReply(null)} targetType="reply" targetId={reply.id} targetLabel="this reply" onSuccess={() => setReportingReply(null)} />
    </>
  );
}

function PostPageInner() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
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
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const editSubmittingRef = useRef(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editReplyDraft, setEditReplyDraft] = useState("");
  const [editReplySubmitting, setEditReplySubmitting] = useState(false);
  const [deleteReplyId, setDeleteReplyId] = useState<string | null>(null);

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

  async function deletePost(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) return;
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Could not delete post.");
      return;
    }
    router.push(post?.profiles?.username ? `/${post.profiles.username}` : "/");
  }

  function startEdit(postId: string) {
    if (!post || post.author_id !== user?.id) return;
    setEditingPost(post);
    setEditDraft(post.content);
    setEditError("");
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    const content = editDraft.trim();
    if (!editingPost || !user || !content || content.length > 600 || editSubmittingRef.current) return;
    editSubmittingRef.current = true;
    setEditSubmitting(true); setEditError("");
    const res = await fetch(`/api/posts/${encodeURIComponent(editingPost.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setEditError(json?.error || "The post was not updated. Your changes are still here.");
      editSubmittingRef.current = false;
      setEditSubmitting(false);
      return;
    }
    const json = await res.json();
    const data = json?.post || json;
    setPost({ ...editingPost, ...(data as Post) });
    setEditingPost(null);
    setEditDraft("");
    editSubmittingRef.current = false;
    setEditSubmitting(false);
  }

  function startEditReply(reply: Reply) {
    if (reply.author_id !== user?.id) return;
    setEditingReplyId(reply.id);
    setEditReplyDraft(reply.content);
    setError("");
  }

  function cancelEditReply() {
    setEditingReplyId(null);
    setEditReplyDraft("");
  }

  async function saveEditReply(replyId: string) {
    const content = editReplyDraft.trim();
    if (!user || !content || content.length > 300 || editReplySubmitting) return;
    setEditReplySubmitting(true);
    const res = await fetch(`/api/replies/${encodeURIComponent(replyId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Reply not updated. Your changes are still here.");
      setEditReplySubmitting(false);
      return;
    }
    const json = await res.json();
    const data = json?.reply || json;
    setReplies((current) => current.map((r) => r.id === replyId ? { ...r, content: (data as Reply).content, edited_at: (data as { edited_at?: string | null }).edited_at ?? r.edited_at } : r));
    setEditingReplyId(null);
    setEditReplyDraft("");
    setEditReplySubmitting(false);
  }

  async function deleteReply(replyId: string) {
    const supabase = createClient();
    if (!supabase || !user) return;
    const res = await fetch(`/api/replies/${encodeURIComponent(replyId)}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Could not delete reply.");
      setDeleteReplyId(null);
      return;
    }
    setReplies((current) => current.filter((r) => r.id !== replyId));
    setDeleteReplyId(null);
    interactions?.requestReplyCount(id, true);
  }

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
      const res = await fetch(`/api/posts/${encodeURIComponent(id)}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, parent_reply_id: replyingTo }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error || "Could not publish the reply.");
        return;
      }
      inserted = true;
      setDraft("");
      setReplyingTo(null);
      try {
        const { createMentionNotifications } = await import("@/lib/mentions.server");
        await createMentionNotifications({ authorId: user.id, postId: id, content: text });
      } catch {}
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
        <div role="status" className="flex min-h-[30vh] items-center justify-center px-6 py-12 text-sm text-af-muted">Loading…</div>
      ) : error && !post ? (
        <div role="alert" className="m-4 rounded-2xl border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger sm:m-6">{error}<button type="button" onClick={() => { void load(); }} className="ml-3 font-semibold underline underline-offset-2">Retry</button></div>
      ) : !post ? (
        <EmptyState title="Post not found" body="This post may have been removed or is unavailable." />
      ) : (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
          <section className="overflow-hidden rounded-2xl border border-af-border bg-af-surface/70 shadow-sm">
            <PostCard post={post} onEdit={user?.id === post.author_id ? startEdit : undefined} onDelete={user?.id === post.author_id ? deletePost : undefined} />
          </section>
          {editingPost && (
            <section className="rounded-2xl border border-af-border bg-af-surface/70 p-4 shadow-sm sm:p-5">
              <form onSubmit={saveEdit} className="space-y-3">
                <h3 className="text-sm font-semibold text-af-text">Edit post</h3>
                {editError && <p role="alert" className="rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{editError}</p>}
                <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} maxLength={600} rows={4} className="af-field min-h-24 w-full resize-y px-3 py-2 text-sm leading-relaxed" />
                <div className="flex items-center justify-between"><span className="text-xs text-af-muted">{editDraft.length}/600</span><div className="flex gap-2">
                  <button type="button" onClick={() => { setEditingPost(null); setEditDraft(""); }} disabled={editSubmitting} className="af-action-secondary">Cancel</button>
                  <button type="submit" disabled={editSubmitting || !editDraft.trim() || editDraft.length > 600} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{editSubmitting ? "Saving…" : "Save changes"}</button>
                </div></div>
              </form>
            </section>
          )}
          {user ? (
            <section className="rounded-2xl border border-af-border bg-af-surface/70 p-4 shadow-sm sm:p-5">
              <div className="flex gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                  {currentUserProfile?.avatar_url ? <img src={currentUserProfile.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-af-accent to-af-accent-2 text-sm font-bold text-white">{(currentUserProfile?.display_name || user.email || "?").slice(0, 1).toUpperCase()}</div>}
                </div>
                <div className="flex-1">
                  {replyingTo && (
                    <p className="mb-2 text-xs text-af-muted">
                      Replying to @{replies.find((r) => r.id === replyingTo)?.profiles?.username || "comment"}
                      <button type="button" onClick={() => { setReplyingTo(null); setDraft(""); }} className="ml-2 text-af-brand-soft hover:underline">Cancel</button>
                    </p>
                  )}
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
                      {submitting ? "Replying…" : "Reply"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-2xl border border-af-border bg-af-surface/70 p-6 text-center shadow-sm">
              <Link href="/signin" className="text-af-brand-soft hover:underline">Sign in to reply</Link>
            </section>
          )}

          {error && <div role="alert" className="rounded-2xl border border-af-danger/40 bg-af-danger/10 px-4 py-3 text-sm text-af-danger">{error}<button type="button" onClick={() => { void load(); }} className="ml-3 font-semibold underline underline-offset-2">Retry</button></div>}

          {replies.length === 0 ? (
            <div className="rounded-2xl border border-af-border bg-af-surface/70 px-6 py-8 shadow-sm">
              <EmptyState title="No replies yet" body="Be the first to reply." />
            </div>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-af-border bg-af-surface/70 shadow-sm">
              <header className="border-b border-af-border px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold tracking-tight text-af-text">Replies</h2>
                <p className="mt-0.5 text-xs text-af-muted">{replies.length} {replies.length === 1 ? "reply" : "replies"}</p>
              </header>
              <div className="divide-y divide-af-border">
                {replies.filter((r) => !r.parent_reply_id).map((r) => (
                  <ReplyThread key={r.id} reply={r} replies={replies} depth={0} replyingTo={replyingTo} setReplyingTo={setReplyingTo} draft={draft} setDraft={setDraft} submitting={submitting} onSubmit={submit} insertReplyEmoji={insertReplyEmoji} replyTextareaRef={replyTextareaRef} currentUserProfile={currentUserProfile} currentUser={user} currentUserId={user?.id ?? null} editingReplyId={editingReplyId} editReplyDraft={editReplyDraft} setEditReplyDraft={setEditReplyDraft} editReplySubmitting={editReplySubmitting} onStartEdit={startEditReply} onSaveEdit={saveEditReply} onCancelEdit={cancelEditReply} onDelete={deleteReply} confirmDeleteId={deleteReplyId} setConfirmDeleteId={setDeleteReplyId} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}

export default function PostPage() {
  return (
    <Suspense fallback={<div role="status" className="p-8 text-center text-sm text-af-muted">Loading…</div>}>
      <PostPageInner />
    </Suspense>
  );
}
