"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePostInteractions } from "@/components/PostInteractionProvider";
import { optimisticLikeCount, reconcileLikeCount } from "@/lib/likes";
import { BadgeList } from "@/components/BadgeList";

export type PostData = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
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
  const [countOptimism, setCountOptimism] = useState<{ postId: string; base: number; value: number } | null>(null);
  const [repostCountOptimism, setRepostCountOptimism] = useState<{ postId: string; base: number; value: number } | null>(null);
  const activationTimer = useRef<number | null>(null);
  useEffect(() => () => { if (activationTimer.current !== null) window.clearTimeout(activationTimer.current); }, []);
  const username = post.profiles?.username || "unknown";
  const displayName = post.profiles?.display_name || username;
  const authorHref = post.profiles?.username ? `/${encodeURIComponent(post.profiles.username)}` : null;
  const postHref = post.profiles?.username
    ? `/${encodeURIComponent(post.profiles.username)}/status/${encodeURIComponent(post.id)}`
    : `/posts/${encodeURIComponent(post.id)}`;
  const avatar = post.profiles?.avatar_url
    ? <img src={post.profiles.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
    : <div className="flex h-full w-full items-center justify-center bg-af-surface-raised text-sm font-semibold text-af-brand-soft">{displayName.slice(0, 1).toUpperCase()}</div>;
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
    <article className="border-b border-af-border px-4 py-4 transition-colors hover:bg-af-surface/40 sm:px-5">
      {repostedBy && (
        <div className="mb-1 ml-12 text-xs text-af-muted">{repostedBy} reposted</div>
      )}
      <div className="flex min-w-0 gap-3">
          {authorHref ? <Link href={authorHref} aria-label={`View ${displayName}'s profile`} className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">{avatar}</Link> : <div aria-hidden="true" className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">{avatar}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
            {authorHref ? <Link href={authorHref} className="max-w-full truncate font-semibold text-af-text hover:underline">{displayName}</Link> : <span className="max-w-full truncate font-semibold text-af-text">{displayName}</span>}
            <span className="truncate text-af-muted">@{username}</span>
            <BadgeList userId={post.author_id} />
            <span className="text-af-muted">Â·</span>
            <time dateTime={post.created_at} className="shrink-0 text-xs text-af-muted">{timeAgo(post.created_at)}</time>
          </div>
          <Link href={postHref} className="mt-2 block rounded-sm">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-af-text-2">{post.content}</p>
          </Link>
          {post.media_urls && post.media_urls.length > 0 && (
            <div className={`mt-3 overflow-hidden rounded-lg border border-af-border bg-black/30 ${post.media_urls.length > 1 ? "grid grid-cols-2 gap-px" : ""}`}>
              {post.media_urls.length === 1 ? (
                isVideo(post.media_urls[0]) ? <video src={post.media_urls[0]} controls playsInline preload="metadata" className="max-h-[min(70vh,640px)] w-full object-contain" /> : <img src={post.media_urls[0]} alt="Post attachment" loading="lazy" className="max-h-[min(70vh,640px)] w-full object-contain" />
              ) : (
                post.media_urls.slice(0, 4).map((u, i) => isVideo(u) ? <video key={u + i} src={u} controls playsInline preload="metadata" aria-label={`Post video ${i + 1}`} className="aspect-square w-full bg-black object-contain" /> : <img key={u + i} src={u} alt={`Post attachment ${i + 1}`} loading="lazy" className="aspect-square w-full bg-black/20 object-contain" />)
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-af-muted sm:gap-x-3">
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
            {bookmarkError && <span role="status" className="basis-full text-xs text-af-danger">Bookmark update failed: {bookmarkError}</span>}
            {repostError && <span role="status" className="basis-full text-xs text-af-danger">Repost update failed: {repostError}</span>}
            {onShare && <button type="button" onClick={() => onShare(post.id)} className="inline-flex min-h-9 items-center rounded-md px-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Share</button>}
            {onEdit && <button type="button" onClick={() => onEdit(post.id)} className="inline-flex min-h-9 items-center rounded-md px-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Edit</button>}
            {onDelete && <button type="button" onClick={() => onDelete(post.id)} className="inline-flex min-h-9 items-center rounded-md px-2 text-af-danger/80 transition-colors hover:bg-af-danger/10 hover:text-af-danger">Delete</button>}
          </div>
        </div>
      </div>
    </article>
  );
}

