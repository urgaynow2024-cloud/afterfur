"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { usePostInteractions } from "@/components/PostInteractionProvider";
import { createClient } from "@/lib/supabase/client";
import { loadMyMembershipStatus } from "@/lib/pawpass";
import ReportDialog from "@/components/ReportDialog";
import { optimisticLikeCount, reconcileLikeCount } from "@/lib/likes";
import { BadgeList } from "@/components/BadgeList";
import PostText from "@/components/PostText";
import { parseProfileCustomisation, displayNameStyle as computeDisplayNameStyle, usernameStyle as computeUsernameStyle } from "@/lib/profileCustomisation";
import { RevealableMedia } from "@/components/RevealableMedia";
import { useResolvedMediaUrls } from "@/lib/media-url-state";

export type PostData = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  classification?: string | null;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null; profile_customisation?: Record<string, unknown> | null } | null;
};

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return diff + "s";
  if (diff < 3600) return Math.floor(diff / 60) + "m";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  if (diff < 604800) return Math.floor(diff / 86400) + "d";
  return date.toLocaleDateString();
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov)(?:$|\?)/i.test(url);
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
  const shareTimer = useRef<number | null>(null);
  useEffect(() => () => { if (shareTimer.current !== null) window.clearTimeout(shareTimer.current); }, []);
  const activationTimer = useRef<number | null>(null);
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
  const avatar = post.profiles?.avatar_url
    ? <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
    : <div className="flex h-full w-full items-center justify-center bg-af-surface-raised text-sm font-semibold text-af-brand-soft">{displayName.slice(0, 1).toUpperCase()}</div>;
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
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared" | "cancelled" | "error">("idle");
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

  // Resolve private storage paths through the authorized signed-URL route.
  // Public URLs (legacy public bucket) pass through unchanged.
  const mediaUrls = post.media_urls ?? [];
  const { items: resolvedMediaItems, loading: mediaLoading } = useResolvedMediaUrls(mediaUrls);
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

  async function handleShare() {
    const url = typeof window !== "undefined" ? `${window.location.origin}${postHref}` : postHref;
    const title = `${displayName} on AfterFur`;
    const text = post.content?.slice(0, 120) || "";
    if (shareTimer.current !== null) window.clearTimeout(shareTimer.current);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
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

  return (
    <>
    <article className="border-b border-af-border px-4 py-4 transition-colors hover:bg-af-surface/50 sm:px-5">
      {repostedBy && (
        <div className="mb-2 ml-14 text-xs font-medium text-af-muted">{repostedBy} reposted</div>
      )}
      <div className="flex min-w-0 gap-3">
          {authorHref ? <Link href={authorHref} aria-label={`View ${displayName}'s profile`} className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">{avatar}</Link> : <div aria-hidden="true" className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">{avatar}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            {authorHref ? <Link href={authorHref} className={`max-w-full truncate font-bold text-af-text hover:underline ${displayNameFxClass}`} style={displayNameStyle}>{displayName}</Link> : <span className={`max-w-full truncate font-bold text-af-text ${displayNameFxClass}`} style={displayNameStyle}>{displayName}</span>}
            <span className={`truncate text-af-muted ${usernameFxClass}`} style={usernameStyle}>@{username}</span>
            <BadgeList userId={post.author_id} />
            <span className="text-af-muted">·</span>
            <time dateTime={post.created_at} className="shrink-0 text-xs text-af-muted">{timeAgo(post.created_at)}</time>
          </div>
          <Link href={postHref} className="mt-2 block rounded-sm">
            <PostText content={post.content} />
          </Link>
          {mediaUrls.length > 0 && (
            <div className={`mt-3 overflow-hidden rounded-2xl border border-af-border bg-black/30 ${mediaUrls.length > 1 ? "grid grid-cols-2 gap-px" : ""}`}>
              {mediaUrls.length === 1 ? (
                <RevealableMedia
                  url={resolvedMediaItems[0]?.resolved ?? resolvedMediaItems[0]?.original ?? mediaUrls[0]}
                  isNsfw={(post.classification ?? "SFW") === "NSFW"}
                  alt="Post attachment"
                  className="max-h-[min(70vh,640px)] w-full object-contain"
                  videoClassName="max-h-[min(70vh,640px)] w-full object-contain"
                />
              ) : (
                resolvedMediaItems.slice(0, 4).map((item, i) => (
                  <RevealableMedia
                    key={item.original + i}
                    url={item.resolved ?? item.original}
                    isNsfw={(post.classification ?? "SFW") === "NSFW"}
                    alt={`Post attachment ${i + 1}`}
                    className="aspect-square w-full object-contain"
                    videoClassName="aspect-square w-full bg-black object-contain"
                  />
                ))
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-af-muted sm:gap-x-2">
            <Link href={postHref} aria-label={`Open ${displayName}'s post${replyCount !== null ? `, ${replyCount} replies` : ""}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 transition-colors hover:bg-af-surface-2 hover:text-af-accent"><span>Reply</span>{replyCount !== null && <span className="text-xs tabular-nums text-af-text-2">{replyCount}</span>}</Link>
            {!interactions?.userId ? <Link href="/signin" aria-label="Sign in to like this post" title="Like" className="af-post-action"><Image src="/images/reactions/default_like.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" /></Link> : <button type="button" data-tooltip={isLiked ? "Unlike" : "Like"} title={isLiked ? "Unlike" : "Like"} aria-label={`${isLiked ? "Unlike" : "Like"} ${displayName}'s post${visibleLikeCount !== null ? `, ${visibleLikeCount} likes` : ""}`} aria-pressed={isLiked} disabled={!interactions.available || isLikePending} onClick={() => { void activateLike(); }} className={`af-post-action ${isLiked ? "is-active" : ""}`}>
              <Image key={isLiked ? "liked" : "default"} src={isLiked ? "/images/reactions/liked.png" : "/images/reactions/default_like.png"} alt="" aria-hidden="true" width={28} height={28} className={`af-reaction-art ${activating ? "is-activating" : ""}`} />
              {visibleLikeCount !== null && <span className="text-xs tabular-nums text-af-text-2">{visibleLikeCount}</span>}
            </button>}
            {likeError && <span role="status" className="basis-full text-xs text-af-danger">Like update failed: {likeError}</span>}
            {!interactions?.userId ? <Link href="/signin" aria-label="Sign in to bookmark this post" title="Bookmark" className="af-post-action"><Image src="/images/reactions/default_bookmark.png" alt="" width={26} height={26} className="h-6 w-6 object-contain" /></Link> : <button type="button" data-tooltip={isBookmarked ? "Remove bookmark" : "Bookmark"} title={isBookmarked ? "Remove bookmark" : "Bookmark"} aria-label={`${isBookmarked ? "Remove bookmark from" : "Bookmark"} ${displayName}'s post`} aria-pressed={isBookmarked} disabled={!interactions.available || isBookmarkPending} onClick={activateBookmark} className={`af-post-action ${isBookmarked ? "is-active" : ""}`}>
              <Image src={isBookmarked ? "/images/reactions/active_bookmark.png" : "/images/reactions/default_bookmark.png"} alt="" aria-hidden="true" width={26} height={26} className="h-6 w-6 object-contain" />
            </button>}
            {!interactions?.userId ? <Link href="/signin" data-tooltip="Repost" aria-label={`Sign in to repost this post${visibleRepostCount !== null ? `, ${visibleRepostCount} reposts` : ""}`} title="Repost" className="af-post-action"><Image src="/images/reactions/Repost.png" alt="" width={27} height={27} className="h-6 w-6 object-contain" />{visibleRepostCount !== null && <span className="text-xs tabular-nums text-af-text-2">{visibleRepostCount}</span>}</Link> : <button type="button" data-tooltip={isReposted ? "Undo repost" : "Repost"} title={isReposted ? "Undo repost" : "Repost"} aria-label={`${isReposted ? "Undo repost of" : "Repost"} ${displayName}'s post${visibleRepostCount !== null ? `, ${visibleRepostCount} reposts` : ""}`} aria-pressed={isReposted} disabled={!interactions.available || isRepostPending} onClick={activateRepost} className={`af-post-action ${isReposted ? "is-active" : ""}`}>
              <Image src="/images/reactions/Repost.png" alt="" aria-hidden="true" width={27} height={27} className="h-6 w-6 object-contain" />
              {visibleRepostCount !== null && <span className="text-xs tabular-nums text-af-text-2">{visibleRepostCount}</span>}
            </button>}
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
                className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-af-brand-soft transition-colors hover:bg-af-surface-2 hover:text-af-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                <span>
                  {boostStatus === "processing" ? "Boosting…" : boostStatus === "boosted" ? "Boosted" : boostStatus === "none" ? "No Boosts remaining" : boostStatus === "ineligible" ? "PawPass required" : "Boost"}
                </span>
              </button>
            )}
            {boostMsg && <span role="status" className="basis-full text-xs text-af-muted">{boostMsg}</span>}
            {repostError && <span role="status" className="basis-full text-xs text-af-danger">Repost update failed: {repostError}</span>}
            <button type="button" onClick={() => { void handleShare(); }} aria-label={`Share ${displayName}'s post`} className="inline-flex min-h-9 items-center rounded-md px-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">
              {shareStatus === "copied" ? "Copied!" : shareStatus === "shared" ? "Shared" : shareStatus === "cancelled" ? "Cancelled" : shareStatus === "error" ? "Failed" : "Share"}
            </button>
            {onEdit && <button type="button" onClick={() => onEdit(post.id)} className="inline-flex min-h-9 items-center rounded-md px-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Edit</button>}
            {onDelete && <button type="button" onClick={() => onDelete(post.id)} className="inline-flex min-h-9 items-center rounded-md px-2 text-af-danger/80 transition-colors hover:bg-af-danger/10 hover:text-af-danger">Delete</button>}
            <button type="button" onClick={() => setReportOpen(true)} aria-label={`Report ${displayName}'s post`} className="inline-flex min-h-9 items-center rounded-md px-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Report</button>
          </div>
        </div>
      </div>
    </article>
    <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="post" targetId={post.id} targetLabel="this post" />
    </>
  );
}

