"use client";

import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import PostCard from "@/components/PostCard";
import Link from "next/link";

type Profile = { id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; banner_url: string | null; website: string | null; location: string | null; created_at: string };
type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };

export default function ProfileClient() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"posts" | "replies" | "media" | "likes">("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [likes, setLikes] = useState<Post[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase) { setError("Supabase not configured."); setLoading(false); return; }
      const { data: prof } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (!prof) { setError("Profile not found."); setLoading(false); return; }
      setProfile(prof as Profile);

      const { count: followers } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id);
      const { count: following } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id);
      setCounts({ followers: followers ?? 0, following: following ?? 0 });

      if (user && user.id !== prof.id) {
        const { data: existing } = await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle();
        setIsFollowing(!!existing);
      }

      const { data: ps } = await supabase.from("posts").select("*").eq("author_id", prof.id).order("created_at", { ascending: false });
      const mappedPosts = (ps ?? []).map((p: any) => ({ ...p, profiles: prof }));
      setPosts(mappedPosts as Post[]);

      const { data: rs } = await supabase.from("replies").select("*").eq("author_id", prof.id).order("created_at", { ascending: false });
      const mappedReplies = (rs ?? []).map((r: any) => ({ id: r.id, content: r.content, created_at: r.created_at, author_id: r.author_id, media_urls: null, profiles: prof }));
      setReplies(mappedReplies as Post[]);

      const { data: likedRows } = await supabase.from("likes").select("post_id").eq("user_id", prof.id);
      const likedIds = (likedRows ?? []).map((r: any) => r.post_id);
      if (likedIds.length) {
        const { data: likedPosts } = await supabase.from("posts").select("*").in("id", likedIds);
        const mappedLikes = (likedPosts ?? []).map((p: any) => ({ ...p, profiles: null }));
        setLikes(mappedLikes as Post[]);
      } else {
        setLikes([]);
      }

      setLoading(false);
    };
    run();
  }, [username, user]);

  async function toggleFollow() {
    if (!user || !profile || user.id === profile.id) return;
    const supabase = createClient();
    if (!supabase) return;
    setFollowBusy(true);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
      setIsFollowing(false);
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
      setIsFollowing(true);
      setCounts((c) => ({ ...c, followers: c.followers + 1 }));
    }
    setFollowBusy(false);
  }

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Profile" />
        <div className="p-8 text-center text-sm text-af-muted">Loading profile…</div>
      </Shell>
    );
  }

  if (error || !profile) {
    return (
      <Shell>
        <PageHeader title="Profile" />
        <EmptyState title="Profile not found" body="This user may not exist or is unavailable." />
      </Shell>
    );
  }

  const isOwn = user?.id === profile.id;
  const mediaItems = posts.flatMap((p) => (p.media_urls ?? []).map((u) => ({ url: u, post: p })));

  return (
    <Shell>
      <PageHeader title={profile.display_name || profile.username} subtitle={`@${profile.username}`} />
      <div className="relative">
        {profile.banner_url ? (
          <img src={profile.banner_url} alt="" className="h-40 w-full object-cover" />
        ) : (
          <div className="h-40 w-full bg-af-surface" />
        )}
        <div className="absolute -bottom-12 left-4">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-24 w-24 rounded-full border-4 border-af-bg object-cover" />
          ) : (
            <div className="h-24 w-24 rounded-full border-4 border-af-bg bg-af-surface-2" />
          )}
        </div>
      </div>
      <div className="px-4 pb-4 pt-16">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-af-text">{profile.display_name || profile.username}</h1>
            <p className="text-af-muted">@{profile.username}</p>
          </div>
          {isOwn ? (
            <Link href="/settings" className="rounded-full border border-af-border px-4 py-1.5 text-sm font-bold text-af-text transition-colors hover:bg-af-surface-2">
              Edit profile
            </Link>
          ) : (
            <button
              onClick={toggleFollow}
              disabled={followBusy}
              className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors disabled:opacity-50 ${isFollowing ? "border border-af-border text-af-text hover:bg-af-surface-2" : "bg-af-brand text-white hover:bg-af-brand-hover"}`}
            >
              {followBusy ? "..." : isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {profile.bio && <p className="mt-3 whitespace-pre-wrap text-[15px] text-af-text">{profile.bio}</p>}
        <div className="mt-3 flex flex-wrap gap-3 text-sm text-af-muted">
          {profile.website && <a href={profile.website} className="text-af-accent hover:underline">{profile.website.replace(/^https?:\/\//, "")}</a>}
          {profile.location && <span>{profile.location}</span>}
          <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <span><strong className="text-af-text">{counts.followers}</strong> <span className="text-af-muted">Followers</span></span>
          <span><strong className="text-af-text">{counts.following}</strong> <span className="text-af-muted">Following</span></span>
        </div>
      </div>

      <div className="flex border-b border-af-border">
        {(["posts", "replies", "media", "likes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 py-3 text-sm font-medium capitalize transition-colors hover:bg-af-surface-2 ${tab === t ? "text-af-text" : "text-af-muted"}`}
          >
            {t}
            {tab === t && <div className="absolute bottom-0 left-1/2 h-0.5 w-12 -translate-x-1/2 rounded-full bg-af-brand" />}
          </button>
        ))}
      </div>

      {tab === "media" ? (
        mediaItems.length === 0 ? (
          <EmptyState title="No media yet" body="Media this user posts will appear here." />
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {mediaItems.map((item, index) => (
              <Link key={item.url + index} href={`/${profile.username}/status/${item.post.id}`} className="aspect-square overflow-hidden bg-af-surface-2">
                {/\.(mp4|webm|mov)$/i.test(item.url) ? (
                  <div className="relative h-full w-full">
                    <video src={item.url} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center text-3xl text-white drop-shadow-lg">▶</span>
                  </div>
                ) : (
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                )}
              </Link>
            ))}
          </div>
        )
      ) : tab === "replies" ? (
        replies.length === 0 ? <EmptyState title="No replies yet" body="Replies will appear here." /> : <div>{replies.map((p) => <PostCard key={p.id} post={p} />)}</div>
      ) : tab === "likes" ? (
        likes.length === 0 ? <EmptyState title="No likes yet" body="Liked posts will appear here." /> : <div>{likes.map((p) => <PostCard key={p.id} post={p} />)}</div>
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" body="Posts will appear here." />
      ) : (
        <div>{posts.map((p) => <PostCard key={p.id} post={p} />)}</div>
      )}
    </Shell>
  );
}
