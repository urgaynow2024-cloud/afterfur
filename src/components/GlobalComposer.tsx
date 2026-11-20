"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import EmojiPicker from "@/components/EmojiPicker";
import { clearTransientAccountState, ACCOUNT_SWITCH_EVENT } from "@/lib/accountSessions";
import { submitAndPublishPost } from "@/lib/feed";

type CreatedPost = {
  id: string;
  content: string;
  classification: string | null;
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
  const [audience, setAudience] = useState<"everyone" | "after_dark">("everyone");
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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !open) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text, open]);

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
        const upsertEnabled = false; // controlled diagnostic test
        const supabaseUser = await supabase.auth.getUser();
        const authUserId = supabaseUser.data?.user?.id ?? null;
        const pathSegments = path.split("/");
        const firstSegment = pathSegments[0] ?? null;
        const segmentMatchesUser = firstSegment === authUserId;
        const authError = supabaseUser.error?.message ?? null;
        const userFromAuthContext = user.id;

        // Check session for JWT role claim
        const sessionData = await supabase.auth.getSession();
        const session = sessionData.data?.session;
        const accessToken = session?.access_token ?? null;
        let jwtRole: string | null = null;
        if (accessToken) {
          try {
            const parts = accessToken.split(".");
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
              jwtRole = payload?.role ?? null;
            }
          } catch { /* ignore */ }
        }

        console.warn("[MEDIA_UPLOAD_DEBUG]", {
          bucketId: "media_private",
          uploadPath: path,
          authUserId,
          firstSegment,
          segmentMatchesUser,
          authError,
          userFromAuthContext,
          upsertEnabled,
          hasSession: !!session,
          hasAccessToken: !!accessToken,
          jwtRole,
          supabaseUrl: (supabase as unknown as Record<string, unknown>).supabaseUrl ?? null,
          storageKey: (supabase as unknown as { auth?: { storageKey?: string } }).auth?.storageKey ?? null,
        });

        const { error: upErr, data } = await supabase.storage.from("media_private").upload(path, mediaFile, { upsert: upsertEnabled });
        if (upErr) {
          console.warn("[MEDIA_UPLOAD_ERROR]", {
            status: (upErr as unknown as Record<string, unknown>).statusCode ?? (upErr as unknown as Record<string, unknown>).status ?? null,
            code: (upErr as unknown as Record<string, unknown>).code ?? null,
            message: upErr.message,
            name: upErr.name,
            details: (upErr as unknown as Record<string, unknown>).details ?? null,
            hint: (upErr as unknown as Record<string, unknown>).hint ?? null,
          });
          const msg = typeof upErr === "object" && upErr !== null && "message" in upErr ? String((upErr as unknown as Record<string, unknown>).message) : String(upErr);
          throw new Error(msg);
        }
        if (!data?.path) {
          throw new Error("Upload succeeded but no path returned.");
        }
        mediaUrls = [path];
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : typeof e === "object" && e !== null && "message" in e ? String((e as Record<string, unknown>).message) : "Could not upload media.";
        setError(msg);
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
    }
    const result = await submitAndPublishPost<CreatedPost>(
      async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token ?? null;
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            content: text.trim(),
            media_urls: mediaUrls,
            classification: audience === "after_dark" ? "AFTER_DARK" : "SFW",
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          return { data: null, error: err.error || "Could not create post." };
        }
        const json = await res.json();
        return { data: json.post ?? null, error: null };
      },
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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [text]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="composer-title">
      <div className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl border border-af-border bg-af-surface p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:max-w-xl sm:rounded-2xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="composer-title" className="text-base font-semibold text-af-text">Create a post</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={saveDraft} className="min-h-10 rounded-md px-3 text-sm font-medium text-af-brand-soft hover:bg-af-surface-2">Save draft</button>
            <button type="button" onClick={requestClose} className="flex h-10 w-10 items-center justify-center rounded-md text-af-muted hover:bg-af-surface-2 hover:text-af-text" aria-label="Close composer">×</button>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-af-border" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-af-brand text-sm font-bold text-white ring-1 ring-af-border">
              {(profile?.display_name || profile?.username || user?.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={300}
              placeholder="What's on your mind?"
              style={{ resize: "none" }}
              rows={1}
              className="min-h-[40px] max-h-48 w-full resize-none overflow-y-auto bg-transparent py-2 text-[16px] leading-6 text-af-text outline-none placeholder:text-af-muted"
            />
            {mediaPreview && (
              <div className="relative mt-3 overflow-hidden rounded-2xl border border-af-border bg-black/30">
                {mediaFile?.type.startsWith("video/") ? (
                  <video src={mediaPreview} controls playsInline className="max-h-72 w-full bg-black object-contain" />
                ) : (
                  <img src={mediaPreview} alt="Selected post media preview" className="max-h-72 w-full object-contain" />
                )}
                <button
                  type="button"
                  onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-sm text-white transition-colors hover:bg-black/90"
                  aria-label="Remove media"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-af-danger">{error}</p>}
        {submitting && mediaFile && <p className="mt-2 text-xs text-af-muted">Uploading media…</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-af-border/70 bg-af-surface/60 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1">
            <EmojiPicker onPick={insertEmoji} />
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2 focus-within:ring-2 focus-within:ring-af-focus">
              <span aria-hidden="true" className="h-4 w-4 shrink-0 bg-current" style={{ maskImage: "url(/icons/afterfur/image.svg)", maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain" }} />
              <span>Media</span>
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
              <button type="button" onClick={() => { setMediaFile(null); setMediaPreview(null); }} className="min-h-9 rounded-full px-3 text-sm text-af-muted transition-colors hover:bg-af-surface-2 hover:text-af-danger">
                Remove
              </button>
            )}
            <span aria-live="polite" className={`px-2 text-xs ${text.length > 270 ? "text-af-brand-soft" : "text-af-muted"}`}>{text.length}/300</span>
          </div>
          <select value={audience} onChange={(e) => setAudience(e.target.value as "everyone" | "after_dark")} className="min-h-9 rounded-full border border-af-border bg-af-surface px-3 text-sm">
            <option value="everyone">Everyone</option>
            <option value="after_dark">🔒 After Dark</option>
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={(!text.trim() && !mediaFile) || submitting}
            className="min-h-9 rounded-full bg-af-brand px-5 text-sm font-semibold text-white transition-all hover:bg-af-brand-hover hover:shadow-md hover:shadow-af-brand/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
