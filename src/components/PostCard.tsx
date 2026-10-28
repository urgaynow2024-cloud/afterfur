"use client";

import Link from "next/link";

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

export default function PostCard({
  post,
  liked,
  bookmarked,
  reposted,
  repostedBy,
  likeCount,
  repostCount,
  onLike,
  onBookmark,
  onRepost,
  onShare,
  onDelete,
}: {
  post: PostData;
  liked?: boolean;
  bookmarked?: boolean;
  reposted?: boolean;
  repostedBy?: string | null;
  likeCount?: number;
  repostCount?: number;
  onLike?: (id: string) => void;
  onBookmark?: (id: string) => void;
  onRepost?: (id: string) => void;
  onShare?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const username = post.profiles?.username || "unknown";
  const displayName = post.profiles?.display_name || username;

  return (
    <article className="border-b border-af-border px-4 py-3 transition-colors hover:bg-af-surface/40">
      {repostedBy && (
        <div className="mb-1 ml-12 text-xs text-af-muted">{repostedBy} reposted</div>
      )}
      <div className="flex gap-3">
          <Link href={`/${username}`} className="h-12 w-12 shrink-0 rounded-full bg-af-surface-2 overflow-hidden">
            {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} alt={`${displayName}'s avatar`} className="h-full w-full object-cover" loading="lazy" /> : <div className="h-full w-full bg-gradient-to-br from-af-accent to-af-accent-2" />}
          </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[15px]">
            <Link href={`/${username}`} className="font-bold hover:underline">{displayName}</Link>
            <span className="text-af-muted">@{username}</span>
            <span className="text-af-muted">·</span>
            <span className="text-af-muted">{timeAgo(post.created_at)}</span>
          </div>
          <Link href={`/${username}/status/${post.id}`} className="mt-1 block">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-normal">{post.content}</p>
          </Link>
          {post.media_urls && post.media_urls.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-af-border">
              {post.media_urls.length === 1 ? (
                <img src={post.media_urls[0]} alt="" className="max-h-[500px] w-full object-cover" />
              ) : (
                <div className="grid grid-cols-2 gap-px bg-af-border">
                  {post.media_urls.slice(0, 4).map((u, i) => (
                    <img key={u + i} src={u} alt="" className="aspect-square w-full object-cover" />
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-6 text-sm text-af-muted">
            <Link href={`/${username}/status/${post.id}`} className="hover:text-af-accent">Reply</Link>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRepost?.(post.id); }} className={reposted ? "text-af-brand" : "text-af-muted hover:text-af-brand"}>Repost{typeof repostCount === "number" ? ` ${repostCount}` : ""}</button>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLike?.(post.id); }} className={liked ? "text-af-accent" : "text-af-muted hover:text-af-accent"}>Like{typeof likeCount === "number" ? ` ${likeCount}` : ""}</button>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBookmark?.(post.id); }} className={bookmarked ? "text-af-accent" : "text-af-muted hover:text-af-accent"}>Bookmark</button>
            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare?.(post.id); }} className="text-af-muted hover:text-af-accent">Share</button>
            {onDelete && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(post.id); }} className="hover:text-af-danger">Delete</button>}
          </div>
        </div>
      </div>
    </article>
  );
}

