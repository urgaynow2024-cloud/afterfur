"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePostInteractions } from "@/components/PostInteractionProvider";
import { createClient } from "@/lib/supabase/client";
import { loadMyMembershipStatus } from "@/lib/pawpass";
import ReportDialog from "@/components/ReportDialog";
import { optimisticLikeCount, reconcileLikeCount } from "@/lib/likes";
import { BadgeList } from "@/components/BadgeList";
import PostText from "@/components/PostText";
import PostMedia from "@/components/post/post-media";
import { parseProfileCustomisation, displayNameStyle as computeDisplayNameStyle, usernameStyle as computeUsernameStyle } from "@/lib/profileCustomisation";

export type PostData = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  classification?: string | null;
  media_urls?: string[] | null;
  edited_at?: string | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null; profile_customisation?: Record<string, unknown> | null } | null;
};

export function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (!Number.isFinite(diff)) return "";
  if (diff < 0) return "now";
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fullTimestamp(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ActionIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`h-[18px] w-[18px] shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url(/icons/afterfur/${name}.svg)`,
        WebkitMaskImage: `url(/icons/afterfur/${name}.svg)`,
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

function PostOptionsMenu({
  post,
  displayName,
  onEdit,
  onDelete,
  onReport,
  onCopyLink,
}: {
  post: PostData;
  displayName: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReport: () => void;
  onCopyLink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Post options for ${displayName}'s post`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`af-post-action -mr-1.5 ${open ? "is-active" : ""}`}
      >
        <ActionIcon name="more-horizontal" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Post options"
          className="absolute right-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-xl border border-af-border-strong bg-af-surface-2 p-1.5 shadow-2xl shadow-black/50"
        >
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onCopyLink();
            }}
          >
            <ActionIcon name="share" className="h-4 w-4" />
            Copy link
          </button>
          {onEdit && (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                setOpen(false);
                onEdit(post.id);
              }}
            >
              <ActionIcon name="file-pen" className="h-4 w-4" />
              Edit post
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} text-af-danger/90 hover:bg-af-danger/10 hover:text-af-danger`}
              onClick={() => {
                setOpen(false);
                onDelete(post.id);
              }}
            >
              <ActionIcon name="trash" className="h-4 w-4" />
              Delete post
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              onReport();
            }}
          >
            <ActionIcon name="flag" className="h-4 w-4" />
            Report post
          </button>
        </div>
      )}
    </div>
  );
}

export default function PostCard({
  post,
  repostedBy,
  onShare,
  onEdit,
  onDelete,
}: {
  post: PostData;
  repostedBy?: string | null;
  onShare?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const interactions = usePostInteractions();
  const [activating, setActivating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [countOptimism, setCountOptimism] = useState<{ postId: string; base: number; value: number } | null>(null);
  const [repostCountOptimism, setRepostCountOptimism] = useState<{ postId: string; base: number; value: number } | null>(null);
  const [isPawPass, setIsPawPass] = useState(false);
  const [boostStatus, setBoostStatus] = useState<"idle" | "processing" | "boosted" | "none" | "ineligible">("idle");
  const [boostMsg, setBoostMsg] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared" | "cancelled" | "error">("idle");
  const shareTimer = useRef<number | null>(null);
  const activationTimer = useRef<number | null>(null);

  useEffect(() => () => { if (shareTimer.current !== null) window.clearTimeout(shareTimer.current); }, []);
  useEffect(() => () => { if (activationTimer.current !== null) window.clearTimeout(activationTimer.current); }, []);

  const username = post.profiles?.username || "unknown";
  const displayName = post.profiles?.display_name || username;
  const custom = parseProfileCustomisation(post.profiles?.profile_customisation);
  const { className: displayNameFxClass, style: displayNameStyle } = computeDisplayNameStyle(custom);
  const { className: usernameFxClass, style: usernameStyle } = computeUsernameStyle(custom);
  const authorHref = post.profiles?.username ? `/${encodeURIComponent(post.profiles.username)}` : null;
  const postHref = post.profiles?.username
    ? `/${encodeURIComponent(post.profiles.username)}/status/${encodeURIComponent(post.id)}`
    : `/posts/${encodeURIComponent(post.id)}`;

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !interactions?.userId) return;
    let cancelled = false;
    void loadMyMembershipStatus(supabase).then(({ status }) => {
      if (cancelled) return;
      const active = !!status && (status.status === "active" || status.status === "cancel_at_period_end") && !!status.currentPeriodEnd && new Date(status.currentPeriodEnd).getTime() > Date.now();
      setIsPawPass(active);
      if (!active) setBoostStatus("ineligible");
    });
    return () => { cancelled = true; };
  }, [interactions?.userId]);

  const isLiked = interactions?.liked(post.id) ?? false;
  const isBookmarked = interactions?.bookmarked(post.id) ?? false;
  const isReposted = interactions?.reposted(post.id) ?? false;
  const likeCount = interactions?.likeCount(post.id) ?? null;
  const repostCount = interactions?.repostCount(post.id) ?? null;
  const replyCount = interactions?.replyCount(post.id) ?? null;
  const isLikePending = interactions?.pending("likes", post.id) ?? false;
  const isBookmarkPending = interactions?.pending("bookmarks", post.id) ?? false;
  const isRepostPending = interactions?.pending("reposts", post.id) ?? false;
  const likeError = interactions?.errorFor("likes", post.id);
  const bookmarkError = interactions?.errorFor("bookmarks", post.id);
  const repostError = interactions?.errorFor("reposts", post.id);

  const visibleLikeCount = likeCount !== null
    ? countOptimism?.postId === post.id && countOptimism.base === likeCount ? countOptimism.value : likeCount
    : null;
  const visibleRepostCount = repostCount !== null
    ? repostCountOptimism?.postId === post.id && repostCountOptimism.base === repostCount ? repostCountOptimism.value : repostCount
    : null;

  const requestLikeCount = interactions?.requestLikeCount;
  const requestRepostCount = interactions?.requestRepostCount;
  const requestReplyCount = interactions?.requestReplyCount;

  useEffect(() => {
    requestLikeCount?.(post.id);
    requestRepostCount?.(post.id);
    requestReplyCount?.(post.id);
  }, [post.id, requestLikeCount, requestRepostCount, requestReplyCount]);

  async function activateLike() {
    const previousLiked = isLiked;
    const previousCount = visibleLikeCount;
    if (!isLiked) {
      setActivating(true);
      if (activationTimer.current !== null) window.clearTimeout(activationTimer.current);
      activationTimer.current = window.setTimeout(() => setActivating(false), 300);
    }
    if (previousCount !== null && likeCount !== null) setCountOptimism({ postId: post.id, base: likeCount, value: optimisticLikeCount(previousCount, previousLiked)! });
    const result = await interactions?.toggle("likes", post.id, post.author_id);
    if (previousCount !== null && result) {
      setCountOptimism({ postId: post.id, base: likeCount!, value: reconcileLikeCount(previousCount, previousLiked, result.active)! });
    }
  }

  function copyPostLink() {
    if (onShare) {
      onShare(post.id);
      if (shareTimer.current !== null) window.clearTimeout(shareTimer.current);
      setShareStatus("copied");
      shareTimer.current = window.setTimeout(() => setShareStatus("idle"), 2000);
      return;
    }
    const url = typeof window !== "undefined" ? `${window.location.origin}${postHref}` : postHref;
    void handleShare(url);
  }

  async function handleShare(explicitUrl?: string) {
    const url = explicitUrl ?? (typeof window !== "undefined" ? `${window.location.origin}${postHref}` : postHref);
    const title = `${displayName} on AfterFur`;
    const text = post.content?.slice(0, 120) || "";
    if (shareTimer.current !== null) window.clearTimeout(shareTimer.current);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function" && !explicitUrl) {
        await navigator.share({ title, text, url });
        setShareStatus("shared");
      } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareStatus("copied");
      } else {
        setShareStatus("error");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setShareStatus("cancelled");
      } else {
        setShareStatus("error");
      }
    }
    shareTimer.current = window.setTimeout(() => setShareStatus("idle"), 2000);
  }

  function activateBookmark() { void interactions?.toggle("bookmarks", post.id, post.author_id); }

  async function activateRepost() {
    const previousReposted = isReposted;
    const previousCount = visibleRepostCount;
    if (previousCount !== null && repostCount !== null) {
      setRepostCountOptimism({ postId: post.id, base: repostCount, value: optimisticLikeCount(previousCount, previousReposted)! });
    }
    const result = await interactions?.toggle("reposts", post.id, post.author_id);
    if (previousCount !== null && repostCount !== null && result) {
      setRepostCountOptimism({ postId: post.id, base: repostCount, value: reconcileLikeCount(previousCount, previousReposted, result.active)! });
    }
  }

  const avatar = post.profiles?.avatar_url
    ? <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
    : <div className="flex h-full w-full items-center justify-center bg-af-surface-raised text-sm font-semibold text-af-brand-soft">{displayName.slice(0, 1).toUpperCase()}</div>;

  return (
    <>
      <article className="relative border-b border-af-border/80 px-3.5 py-3 transition-colors hover:bg-af-surface/40">
        {repostedBy && (
          <div className="mb-1 ml-[3.25rem] flex items-center gap-1.5 text-[11px] font-medium text-af-muted">
            <ActionIcon name="repeat-2" className="h-3.5 w-3.5" />
            <span className="truncate">{repostedBy} reposted</span>
          </div>
        )}
        <div className="flex min-w-0 gap-3">
          {authorHref ? (
            <Link href={authorHref} aria-label={`View ${displayName}'s profile`} className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border transition-opacity hover:opacity-90">
              {avatar}
            </Link>
          ) : (
            <div aria-hidden="true" className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">{avatar}</div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-1.5">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] leading-5">
                {authorHref ? (
                  <Link href={authorHref} className={`max-w-full truncate font-bold text-af-text hover:underline ${displayNameFxClass}`} style={displayNameStyle}>{displayName}</Link>
                ) : (
                  <span className={`max-w-full truncate font-bold text-af-text ${displayNameFxClass}`} style={displayNameStyle}>{displayName}</span>
                )}
                <BadgeList userId={post.author_id} />
                <span className={`truncate text-[13px] text-af-muted ${usernameFxClass}`} style={usernameStyle}>@{username}</span>
                <span aria-hidden="true" className="text-[13px] text-af-muted">·</span>
                <time dateTime={post.created_at} title={fullTimestamp(post.created_at)} className="shrink-0 text-[13px] text-af-muted hover:underline">
                  <Link href={postHref} className="hover:text-af-text">{timeAgo(post.created_at)}</Link>
                </time>
                {post.edited_at && <span className="text-[11px] text-af-muted">(edited)</span>}
              </div>
              <PostOptionsMenu
                post={post}
                displayName={displayName}
                onEdit={onEdit}
                onDelete={onDelete}
                onReport={() => setReportOpen(true)}
                onCopyLink={copyPostLink}
              />
            </div>

            {post.content?.trim() && (
              <div className="mt-0.5">
                <PostText content={post.content} />
              </div>
            )}

            <PostMedia urls={post.media_urls} nsfw={(post.classification ?? "SFW") === "NSFW"} alt={`${displayName}'s post attachment`} />

            <div className="mt-1.5 flex flex-wrap items-center gap-x-0.5 gap-y-0.5 pr-0.5 sm:flex-nowrap sm:justify-between sm:pr-1">
              <Link
                href={postHref}
                aria-label={`Reply to ${displayName}'s post${replyCount !== null ? `, ${replyCount} replies` : ""}`}
                className="af-post-action af-post-action--reply"
              >
                <ActionIcon name="message-circle" />
                {replyCount !== null && <span className="text-xs tabular-nums">{replyCount}</span>}
              </Link>

              {!interactions?.userId ? (
                <Link href="/signin" aria-label={`Sign in to repost ${displayName}'s post`} title="Repost" className="af-post-action af-post-action--repost">
                  <Image src="/images/reactions/Repost.png" alt="" aria-hidden="true" width={27} height={27} className="h-[18px] w-[18px] object-contain" />
                  {visibleRepostCount !== null && <span className="text-xs tabular-nums">{visibleRepostCount}</span>}
                </Link>
              ) : (
                <button
                  type="button"
                  data-tooltip={isReposted ? "Undo repost" : "Repost"}
                  title={isReposted ? "Undo repost" : "Repost"}
                  aria-label={`${isReposted ? "Undo repost of" : "Repost"} ${displayName}'s post${visibleRepostCount !== null ? `, ${visibleRepostCount} reposts` : ""}`}
                  aria-pressed={isReposted}
                  disabled={!interactions.available || isRepostPending}
                  onClick={() => { void activateRepost(); }}
                  className={`af-post-action af-post-action--repost ${isReposted ? "is-active" : ""}`}
                >
                  <Image src="/images/reactions/Repost.png" alt="" aria-hidden="true" width={27} height={27} className="h-[18px] w-[18px] object-contain" />
                  {visibleRepostCount !== null && <span className="text-xs tabular-nums">{visibleRepostCount}</span>}
                </button>
              )}

              {!interactions?.userId ? (
                <Link href="/signin" aria-label={`Sign in to like ${displayName}'s post`} title="Like" className="af-post-action af-post-action--like">
                  <Image src="/images/reactions/default_like.png" alt="" width={28} height={28} className="h-[18px] w-[18px] object-contain" />
                </Link>
              ) : (
                <button
                  type="button"
                  data-tooltip={isLiked ? "Unlike" : "Like"}
                  title={isLiked ? "Unlike" : "Like"}
                  aria-label={`${isLiked ? "Unlike" : "Like"} ${displayName}'s post${visibleLikeCount !== null ? `, ${visibleLikeCount} likes` : ""}`}
                  aria-pressed={isLiked}
                  disabled={!interactions.available || isLikePending}
                  onClick={() => { void activateLike(); }}
                  className={`af-post-action af-post-action--like ${isLiked ? "is-active" : ""}`}
                >
                  <Image key={isLiked ? "liked" : "default"} src={isLiked ? "/images/reactions/liked.png" : "/images/reactions/default_like.png"} alt="" aria-hidden="true" width={28} height={28} className={`af-reaction-art h-[18px] w-[18px] ${activating ? "is-activating" : ""}`} />
                  {visibleLikeCount !== null && <span className="text-xs tabular-nums">{visibleLikeCount}</span>}
                </button>
              )}

              {!interactions?.userId ? (
                <Link href="/signin" aria-label={`Sign in to bookmark ${displayName}'s post`} title="Bookmark" className="af-post-action af-post-action--bookmark">
                  <Image src="/images/reactions/default_bookmark.png" alt="" width={26} height={26} className="h-[18px] w-[18px] object-contain" />
                </Link>
              ) : (
                <button
                  type="button"
                  data-tooltip={isBookmarked ? "Remove bookmark" : "Bookmark"}
                  title={isBookmarked ? "Remove bookmark" : "Bookmark"}
                  aria-label={`${isBookmarked ? "Remove bookmark from" : "Bookmark"} ${displayName}'s post`}
                  aria-pressed={isBookmarked}
                  disabled={!interactions.available || isBookmarkPending}
                  onClick={activateBookmark}
                  className={`af-post-action af-post-action--bookmark ${isBookmarked ? "is-active" : ""}`}
                >
                  <Image src={isBookmarked ? "/images/reactions/active_bookmark.png" : "/images/reactions/default_bookmark.png"} alt="" aria-hidden="true" width={26} height={26} className="h-[18px] w-[18px] object-contain" />
                </button>
              )}

              <button
                type="button"
                onClick={() => { void handleShare(); }}
                aria-label={`Share ${displayName}'s post`}
                data-tooltip={shareStatus === "copied" ? "Copied!" : "Share"}
                title="Share"
                className="af-post-action af-post-action--share"
              >
                <ActionIcon name="share" />
              </button>

              {interactions?.userId === post.author_id && (
                <button
                  type="button"
                  disabled={boostStatus === "processing" || boostStatus === "boosted" || boostStatus === "none" || boostStatus === "ineligible" || !interactions.available}
                  onClick={async () => {
                    if (!window.confirm("Consume one Monthly Discovery Boost for this post?")) return;
                    const supabase = createClient();
                    if (!supabase) return;
                    setBoostStatus("processing");
                    setBoostMsg("");
                    const { data, error } = await (supabase as any).rpc("consume_post_boost", { p_post_id: post.id });
                    if (error) {
                      setBoostMsg(error.message);
                      if (error.message.toLowerCase().includes("no boosts")) setBoostStatus("none");
                      else if (error.message.toLowerCase().includes("membership")) setBoostStatus("ineligible");
                      else setBoostStatus("idle");
                      return;
                    }
                    setBoostStatus("boosted");
                    setBoostMsg(`Boosted. Remaining: ${data?.remaining ?? 0}.`);
                  }}
                  aria-label={`Boost ${displayName}'s post`}
                  title="Boost post"
                  className="af-post-action af-post-action--boost"
                >
                  <ActionIcon name="sparkles" />
                </button>
              )}
            </div>

            {shareStatus === "copied" && <p role="status" className="mt-1 text-xs text-af-brand-soft">Link copied</p>}
            {shareStatus === "error" && <p role="status" className="mt-1 text-xs text-af-danger">Could not share this post</p>}
            {isPawPass && boostMsg && <p role="status" className="mt-1 text-xs text-af-muted">{boostMsg}</p>}
            {likeError && <p role="status" className="mt-1 text-xs text-af-danger">Like update failed: {likeError}</p>}
            {bookmarkError && <p role="status" className="mt-1 text-xs text-af-danger">Bookmark update failed: {bookmarkError}</p>}
            {repostError && <p role="status" className="mt-1 text-xs text-af-danger">Repost update failed: {repostError}</p>}
          </div>
        </div>
      </article>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="post" targetId={post.id} targetLabel="this post" />
    </>
  );
}