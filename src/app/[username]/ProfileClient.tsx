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
  const [profile, setProfile] = useState<Profile | null>(null);
  const { user } = useAuth();
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      const mapped = (ps ?? []).map((p: any) => ({ ...p, profiles: prof }));
      setPosts(mapped as Post[]);
      setLoading(false);
    };
    run();
  }, [username]);

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

  if (loading) return <Shell><PageHeader title="Profile" /><div className="p-8 text-center text-sm text-af-muted">Loading…</div></Shell>;
  if (error || !profile) return <Shell><PageHeader title="Profile" /><EmptyState title="Profile not found" body="This user may not exist or is unavailable." /></Shell>;

  return (
    <Shell>
      <PageHeader title={profile.display_name || profile.username} subtitle={`@${profile.username}`} />
      <div className="p-4">
        <h1 className="text-xl font-extrabold">{profile.display_name || profile.username}</h1>
        <p className="text-af-muted">@{profile.username}</p>
        {profile.bio && <p className="mt-3 whitespace-pre-wrap text-[15px]">{profile.bio}</p>}
        <div className="mt-3 flex gap-4 text-[15px] text-af-muted">
          <span><strong className="text-af-text">{counts.followers}</strong> Followers</span>
          <span><strong className="text-af-text">{counts.following}</strong> Following</span>
        </div>
        {user && user.id !== profile.id && (
          <button onClick={toggleFollow} disabled={followBusy} className={`mt-4 rounded-full px-4 py-1.5 text-sm font-bold transition-colors disabled:opacity-50 ${isFollowing ? "border border-af-border text-af-text hover:bg-af-surface-2" : "bg-af-brand text-white hover:bg-af-brand-hover"}`}>
            {followBusy ? "..." : isFollowing ? "Following" : "Follow"}
          </button>
        )}
      </div>
      <div>
        {posts.length === 0 ? <EmptyState title="No posts yet" body="This user has not posted yet." /> : posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </Shell>
  );
}
