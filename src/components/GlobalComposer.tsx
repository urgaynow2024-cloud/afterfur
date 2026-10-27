"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import EmojiPicker from "@/components/EmojiPicker";

export default function GlobalComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [text, setText] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const draftKey = user ? `afterfur:draft:${user.id}` : null;

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const supabase = createClient();
    if (supabase && user) {
      supabase.from("profiles").select("username,display_name,avatar_url").eq("id", user.id).maybeSingle().then(({ data }: any) => setProfile(data));
    }
    if (draftKey) {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setText(parsed.text || "");
          // media cannot be restored from localStorage
        }
      } catch {}
    }
    setTimeout(() => textareaRef.current?.focus(), 0);
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
  }, [open, text, mediaFile]);

  function requestClose() {
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
  }

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
    if (submitting || (!text.trim() && !mediaFile)) return;
    const supabase = createClient();
    if (!supabase || !user) { setError("Sign in to post."); return; }
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
      } catch (e: any) {
        setError(e.message);
        setSubmitting(false);
        return;
      }
    }
    const { error } = await supabase.from("posts").insert({ author_id: user.id, content: text.trim(), media_urls: mediaUrls });
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    if (draftKey) localStorage.removeItem(draftKey);
    setText("");
    setMediaFile(null);
    setMediaPreview(null);
    setSubmitting(false);
    onClose();
    window.dispatchEvent(new CustomEvent("afterfur:post-created"));
    previousFocus.current?.focus();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="mt-12 w-full max-w-xl rounded-2xl border border-af-border bg-af-surface p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <button onClick={requestClose} className="rounded-full p-2 text-af-muted hover:bg-af-surface-2 hover:text-af-text" aria-label="Close composer">✕</button>
          <button onClick={saveDraft} className="rounded-full px-3 py-1.5 text-sm font-medium text-af-accent hover:bg-af-accent/10">Drafts</button>
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
              className="min-h-32 w-full resize-none bg-transparent text-[17px] outline-none placeholder:text-af-muted"
            />
            {mediaPreview && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-af-border">
                <img src={mediaPreview} alt="" className="max-h-80 w-full object-cover" />
              </div>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-af-danger">{error}</p>}
        <div className="mt-4 flex items-center justify-between border-t border-af-border pt-3">
          <EmojiPicker onPick={insertEmoji} />
          <label className="cursor-pointer rounded-full px-3 py-1.5 text-sm text-af-accent transition-colors hover:bg-af-accent/10">
            Add media
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
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
            <button onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="rounded-full px-3 py-1.5 text-sm text-af-muted hover:text-af-danger">
              Remove
            </button>
          )}
          <button
            onClick={submit}
            disabled={(!text.trim() && !mediaFile) || submitting}
            className="rounded-full bg-af-accent px-5 py-1.5 text-sm font-bold text-white transition-colors hover:bg-af-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
