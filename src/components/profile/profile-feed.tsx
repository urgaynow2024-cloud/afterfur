"use client";
import Link from "next/link";
import PostCard from "@/components/PostCard";
import { EmptyState } from "@/components/Shell";
import type { ProfileTab, ProfileMediaFilter } from "./profile-types";
import { PrivateMediaGrid } from "@/components/post/private-media-grid";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Post = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

type ProfileFeedProps = {
  tab: ProfileTab;
  posts: Post[];
  replies: Post[];
  reposts: Post[];
  likes: Post[];
  profile: Profile;
  mediaFilter: ProfileMediaFilter;
  setMediaFilter: (filter: ProfileMediaFilter) => void;
  onEdit?: (postId: string) => void;
  onDelete?: (postId: string) => void;
  repostedByLabel?: string;
};

export function ProfileFeed({ tab, posts, replies, reposts, likes, profile, mediaFilter, setMediaFilter, onEdit, onDelete, repostedByLabel }: ProfileFeedProps) {
  const renderPostCard = (p: Post) => (
    <PostCard
      key={p.id}
      post={p}
      onEdit={p.author_id && onEdit ? () => void onEdit(p.id) : undefined}
      onDelete={p.author_id && onDelete ? () => void onDelete(p.id) : undefined}
    />
  );

  if (tab === "media") {
    const items = Array.from(
      new Map<string, { url: string; post: Post }>(posts.flatMap((p) => (p.media_urls ?? []).map((u) => [u, { url: u, post: p }]))).values(),
    );
    const filtered = items.filter((it) => {
      const isGif = it.url.toLowerCase().endsWith(".gif");
      const isVideo = /\.(mp4|webm|mov)$/i.test(it.url);
      if (mediaFilter === "photos") return !isGif && !isVideo;
      if (mediaFilter === "gifs") return isGif;
      if (mediaFilter === "videos") return isVideo;
      return true;
    });
    if (filtered.length === 0) return <EmptyState title="No media yet" body="Media posted by this user will appear here." />;
    return (
      <div className="mt-4">
        <div className="mb-4 flex gap-2 text-[13px]">
          {(["all", "photos", "gifs", "videos"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setMediaFilter(f)}
              className={`rounded-full px-3 py-1 transition-colors ${
                mediaFilter === f ? "bg-af-brand text-white" : "bg-af-surface-2 text-af-text hover:bg-af-surface-3"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <PrivateMediaGrid
          items={filtered.map((it) => ({ url: it.url, postId: it.post.id }))}
          username={profile.username}
          gridClassName="grid grid-cols-2 gap-1 sm:grid-cols-3"
          itemClassName="aspect-square overflow-hidden rounded-md bg-af-surface-2"
        />
      </div>
    );
  }

  if (tab === "posts") {
    if (posts.length === 0) return <EmptyState title="No posts yet" body="This user hasn't posted yet." />;
    return <div>{posts.map(renderPostCard)}</div>;
  }
  if (tab === "replies") {
    if (replies.length === 0) return <EmptyState title="No replies yet" body="This user hasn't replied yet." />;
    return <div>{replies.map(renderPostCard)}</div>;
  }
  if (tab === "reposts") {
    if (reposts.length === 0) return <EmptyState title="No reposts yet" body="This user hasn't reposted yet." />;
    return (
      <div>
        {reposts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            repostedBy={repostedByLabel ?? (p.profiles?.username ? `${p.profiles.username} reposted` : undefined)}
            onEdit={p.author_id && onEdit ? () => void onEdit(p.id) : undefined}
            onDelete={p.author_id && onDelete ? () => void onDelete(p.id) : undefined}
          />
        ))}
      </div>
    );
  }
  if (tab === "likes") {
    if (likes.length === 0) return <EmptyState title="No likes yet" body="Liked posts will appear here." />;
    return <div>{likes.map(renderPostCard)}</div>;
  }
  return null;
}
