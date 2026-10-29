"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import EmojiPicker from "@/components/EmojiPicker";
import { submitAndPublishPost } from "@/lib/feed";

type CreatedPost = {
  id: string;
  content: string;
  classification: string;
  created_at: string;
  author_id: string;
  media_urls: string[] | null;
};
type ComposerProfile = { username: string; display_name: string | null; avatar_url: string | null };

export default function GlobalComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ComposerProfile | null>(null);
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const draftKey = user ? `afterfur:draft:${user.id}` : null;

  const requestClose = useCallback(() => {
    if ((text.trim() || mediaFile) && !window.confirm("Discard this post?")) return;
    if (draftKey && (text.trim() || mediaFile)) {
      try { localStorage.setItem(draftKey, JSON.stringify({ text })); } catch {}
    }
    setText("");
    setMediaFile(null);
    setMediaPreview(null);
    setError("");
    onClose();
    previousFocus.current?.focus();
  }, [text, mediaFile, draftKey, onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const supabase = createClient();
    if (supabase && user) {
      supabase.from("profiles").select("username,display_name,avatar_url").eq("id", user.id).maybeSingle().then(({ data }: { data: ComposerProfile | null }) => setProfile(data));
    }
    const draftTimer = window.setTimeout(() => {
      if (!draftKey) return;
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) setText((JSON.parse(saved) as { text?: string }).text || "");
      } catch {}
    }, 0);
    const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(draftTimer);
      window.clearTimeout(focusTimer);
    };
  }, [open, user, draftKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  function saveDraft() {
    if (!draftKey) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ text })); } catch {}
    setText("");
    setMediaFile(null);
    setMediaPreview(null);
    onClose();
    previousFocus.current?.focus();
  }

  function insertEmoji(emoji: string) {
    const textarea = textareaRef.current;
    if (!textarea) { setText((t) => t + emoji); return; }
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + emoji.length;
      textarea.setSelectionRange(pos, pos);
    });
  }

  async function submit() {
    if (submittingRef.current || (!text.trim() && !mediaFile)) return;
    const supabase = createClient();
    if (!supabase || !user) { setError("Sign in to post."); return; }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    let mediaUrls: string[] = [];
    if (mediaFile) {
      try {
        const ext = mediaFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, mediaFile, { upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        mediaUrls = [data.publicUrl];
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Could not upload media.");
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
    }
    const result = await submitAndPublishPost<CreatedPost>(
      () => supabase.from("posts").insert({ author_id: user.id, content: text.trim(), media_urls: mediaUrls }).select("*").single(),
      (post) => window.dispatchEvent(new CustomEvent("afterfur:post-created", { detail: {
        ...post,
        profiles: profile ? {
          username: profile.username || "unknown",
          display_name: profile.display_name || null,
          avatar_url: profile.avatar_url || null,
        } : null,
      } })),
    );
    if (result.error) {
      setError(result.error);
      submittingRef.current = false;
      setSubmitting(false);
      return;
    }
    if (draftKey) localStorage.removeItem(draftKey);
    setText("");
    setMediaFile(null);
    setMediaPreview(null);
    submittingRef.current = false;
    setSubmitting(false);
    onClose();
    previousFocus.current?.focus();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="composer-title">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-af-border bg-af-surface p-4 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between">
          <h2 id="composer-title" className="text-sm font-semibold text-af-text">Create a post</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={saveDraft} className="min-h-10 rounded-md px-3 text-sm font-medium text-af-brand-soft hover:bg-af-surface-2">Save draft</button>
            <button type="button" onClick={requestClose} className="flex h-10 w-10 items-center justify-center rounded-md text-af-muted hover:bg-af-surface-2 hover:text-af-text" aria-label="Close composer">�</button>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-af-brand text-sm font-bold text-white">
              {(profile?.display_name || profile?.username || user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder="What's happening?"
              className="min-h-32 w-full resize-y bg-transparent py-1 text-[16px] leading-6 text-af-text outline-none placeholder:text-af-muted"
            />
            {mediaPreview && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-af-border">
                {mediaFile?.type.startsWith("video/") ? <video src={mediaPreview} controls playsInline className="max-h-72 w-full bg-black object-contain" /> : <img src={mediaPreview} alt="Selected post media preview" className="max-h-72 w-full object-contain" />}
              </div>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-af-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-af-border pt-3">
          <EmojiPicker onPick={insertEmoji} />
          <label className="inline-flex min-h-10 cursor-pointer items-center rounded-md px-3 text-sm font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2 focus-within:ring-2 focus-within:ring-af-focus">
            Add media
            <input
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              aria-label="Attach image or video"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setMediaFile(f);
                  setMediaPreview(URL.createObjectURL(f));
                }
              }}
            />
          </label>
          {mediaFile && (
            <button type="button" onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="min-h-10 rounded-md px-3 text-sm text-af-muted hover:bg-af-surface-2 hover:text-af-danger">
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={(!text.trim() && !mediaFile) || submitting}
            className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
