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
      const { data: ps } = await supabase.from("posts").select("*").eq("author_id", prof.id).order("created_at", { ascending: false });
      const mapped = (ps ?? []).map((p: any) => ({ ...p, profiles: prof }));
      setPosts(mapped as Post[]);
      setLoading(false);
    };
    run();
  }, [username]);

  if (loading) return <Shell><PageHeader title="Profile" /><div className="p-8 text-center text-sm text-af-muted">Loading…</div></Shell>;
  if (error || !profile) return <Shell><PageHeader title="Profile" /><EmptyState title="Profile not found" body="This user may not exist or is unavailable." /></Shell>;

  return (
    <Shell>
      <PageHeader title={profile.display_name || profile.username} subtitle={`@${profile.username}`} />
      <div className="p-4">
        <h1 className="text-xl font-extrabold">{profile.display_name || profile.username}</h1>
        <p className="text-af-muted">@{profile.username}</p>
        {profile.bio && <p className="mt-3 whitespace-pre-wrap text-[15px]">{profile.bio}</p>}
      </div>
      <div>
        {posts.length === 0 ? <EmptyState title="No posts yet" body="This user has not posted yet." /> : posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </Shell>
  );
}
