"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import PostCard from "@/components/PostCard";

type Profile = { id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; banner_url: string | null; website: string | null; created_at: string };

export default function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSelf, setIsSelf] = useState(false);

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
      setLoading(false);
    };
    run();
  }, [username, user]);

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
          {isSelf && <Link href="/profile" className="mt-3 inline-block rounded-full border border-af-border px-4 py-1.5 text-sm font-bold hover:bg-af-surface">Edit Profile</Link>}
        </div>
      </div>
      <div>
        {posts.length === 0 ? <EmptyState title="No posts yet" body="This user hasn't posted yet." /> : posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </Shell>
  );
}
