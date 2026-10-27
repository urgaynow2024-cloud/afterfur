"use client";
import { useEffect, useState } from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import PostCard from "@/components/PostCard";

type Profile = { id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; banner_url: string | null; website: string | null; created_at: string };

function PublicProfileInner() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSelf, setIsSelf] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase) { setError("Supabase not configured."); setLoading(false); return; }
      const { data: p } = await supabase.from("profiles").select("*").ilike("username", username).maybeSingle();
      if (!p) { setError("User not found."); setLoading(false); return; }
      setProfile(p as Profile);
      setIsSelf(user?.id === p.id);
      const { data: ps } = await supabase.from("posts").select("*").eq("author_id", p.id).order("created_at", { ascending: false });
      const mapped = (ps ?? []).map((x: any) => ({ ...x, profiles: p }));
      setPosts(mapped);
      const { count: fc } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", p.id);
      const { count: fingc } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", p.id);
      setFollowerCount(fc ?? 0);
      setFollowingCount(fingc ?? 0);
      if (user && user.id !== p.id) {
        const { data: f } = await supabase.from("follows").select("*").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle();
        setFollowing(!!f);
      }
      setLoading(false);
    };
    run();
  }, [username, user]);

  async function toggleFollow() {
    const supabase = createClient();
    if (!supabase || !user || !profile || isSelf) return;
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
      setFollowing(false);
      setFollowerCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
      setFollowing(true);
      setFollowerCount((c) => c + 1);
    }
  }

  if (loading) return <Shell><PageHeader title="Profile" /><div className="p-8 text-center text-sm text-af-muted">Loading…</div></Shell>;
  if (error || !profile) return <Shell><PageHeader title="Profile" /><EmptyState title="User not found" body={error || "This profile may not exist."} /></Shell>;

  return (
    <Shell>
      <PageHeader title={profile.display_name || profile.username} />
      <div className="border-b border-af-border">
        {profile.banner_url ? <img src={profile.banner_url} alt="" className="h-40 w-full object-cover" /> : <div className="h-40 w-full bg-af-surface-2" />}
        <div className="px-4 pb-4">
          <div className="-mt-12 h-24 w-24 overflow-hidden rounded-full border-4 border-af-bg bg-af-surface-2">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <h2 className="mt-2 text-xl font-bold">{profile.display_name || profile.username}</h2>
          <p className="text-af-muted">@{profile.username}</p>
          {profile.bio && <p className="mt-2 text-[15px]">{profile.bio}</p>}
          {profile.website && <a href={profile.website} className="mt-1 block text-af-accent hover:underline" target="_blank" rel="noreferrer">{profile.website}</a>}
          <p className="mt-2 text-sm text-af-muted">Joined {new Date(profile.created_at).toLocaleDateString()}</p>
          <p className="mt-1 text-sm text-af-muted">{followerCount} followers · {followingCount} following</p>
          {isSelf ? (
            <Link href="/settings" className="mt-3 inline-block rounded-full border border-af-border px-4 py-1.5 text-sm font-bold hover:bg-af-surface">Edit Profile</Link>
          ) : user ? (
            <button onClick={toggleFollow} className={`mt-3 rounded-full px-4 py-1.5 text-sm font-bold ${following ? "border border-af-border hover:bg-af-surface" : "bg-af-accent text-white hover:bg-af-accent-hover"}`}>
              {following ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>
      </div>
      <div>
        {posts.length === 0 ? <EmptyState title="No posts yet" body="This user hasn't posted yet." /> : posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </Shell>
  );
}

export default function PublicProfile() {
  return (
    <Suspense fallback={<div className='p-8 text-center text-sm text-af-muted'>Loading...</div>}><PublicProfileInner /></Suspense>
  );
}
