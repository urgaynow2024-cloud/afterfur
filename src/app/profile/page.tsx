"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import Link from "next/link";
import { BadgeList } from "@/components/BadgeList";

type Profile = { id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; banner_url: string | null; website: string | null; location: string | null; created_at: string };
type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };
type ProfileSummary = { id: string; username: string; display_name: string | null; avatar_url: string | null };
type RepostRow = { post_id: string };
type ReplyRow = { id: string; content: string; created_at: string; author_id: string };

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reposts, setReposts] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"posts" | "replies" | "reposts" | "media">("posts");
  const [mediaFilter, setMediaFilter] = useState<"all" | "photos" | "gifs" | "videos">("all");

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      if (!supabase || !user) {
        setLoading(false);
        return;
      }
      const { data: ps } = await supabase.from("posts").select("*").eq("author_id", user.id).order("created_at", { ascending: false });
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      let profileData = prof;
      if (!profileData) {
        const { data: np } = await supabase.from("profiles").upsert({ id: user.id, username: user.email?.split("@")[0] || `user_${user.id.slice(0, 6)}` }).select().single();
        profileData = np;
      }
      setProfile(profileData as Profile);
      const mapped = ((ps ?? []) as Post[]).map((p) => ({ ...p, profiles: profileData as Profile }));
      setPosts(mapped as Post[]);

      const { data: r } = await supabase.from("reposts").select("post_id").eq("user_id", user.id);
      const repostIds = ((r ?? []) as RepostRow[]).map((x) => x.post_id);
      if (repostIds.length) {
        const { data: rp } = await supabase.from("posts").select("*").in("id", repostIds);
        const aIds = [...new Set(((rp ?? []) as Post[]).map((x) => x.author_id))];
        let pm = new Map<string, ProfileSummary>();
        if (aIds.length) {
          const { data: profs } = await supabase.from("profiles").select("*").in("id", aIds);
          pm = new Map(((profs ?? []) as ProfileSummary[]).map((x) => [x.id, x]));
        }
        const mappedR = ((rp ?? []) as Post[]).map((x) => ({ ...x, profiles: pm.get(x.author_id) || null }));
        setReposts(mappedR as Post[]);
      } else {
        setReposts([]);
      }

      const { data: rp } = await supabase.from("replies").select("*").eq("author_id", user.id).order("created_at", { ascending: false });
      const mappedReplies = ((rp ?? []) as ReplyRow[]).map((r) => ({ id: r.id, content: r.content, created_at: r.created_at, author_id: r.author_id, profiles: profileData as Profile }));
      setReplies(mappedReplies as Post[]);
      const { count: f1 } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id);
      const { count: f2 } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id);
      setCounts({ followers: f1 ?? 0, following: f2 ?? 0 });
      setLoading(false);
    };
    run();
  }, [user]);

  if (!user) {
    return (
      <Shell>
        <PageHeader title="Profile" />
        <EmptyState title="Sign in to view your profile" body="Create an account or sign in to manage your profile." action={{ label: "Sign in", href: "/signin" }} />
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHeader title="Profile" />
      {loading ? (
        <div className="p-8 text-center text-sm text-af-muted">Loading…</div>
      ) : !profile ? (
        <EmptyState title="Complete your profile" body="Add your details to help the community find you." action={{ label: "Edit profile", href: "/edit-profile" }} />
      ) : (
        <div>
          <div className="relative">
            {profile.banner_url ? (
              <img src={profile.banner_url} alt={`${profile.display_name || profile.username}'s banner`} className="h-32 w-full object-cover sm:h-48" />
            ) : (
              <div aria-hidden="true" className="h-32 w-full border-b border-af-border bg-af-surface sm:h-48" />
            )}
            <div className="absolute -bottom-10 left-4 sm:-bottom-12">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={`${profile.display_name || profile.username}'s avatar`} className="h-20 w-20 rounded-full border-4 border-af-bg object-cover sm:h-24 sm:w-24" />
              ) : (
                <div aria-hidden="true" className="h-20 w-20 rounded-full border-4 border-af-bg bg-af-surface-raised sm:h-24 sm:w-24" />
              )}
            </div>
          </div>
          <div className="px-4 pb-5 pt-14 sm:px-5 sm:pt-16">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="break-words text-xl font-semibold tracking-tight">{profile.display_name || profile.username}</h2>
                <p className="text-sm text-af-muted">@{profile.username}</p>
                <BadgeList userId={profile.id} className="mt-2" />
              </div>
              <Link href="/edit-profile" className="af-action-secondary">
                Edit profile
              </Link>
            </div>
            {profile.bio && <p className="mt-3 max-w-prose whitespace-pre-wrap text-[15px] leading-6 text-af-text-2">{profile.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-af-muted">
              {profile.location && <span>📍 {profile.location}</span>}
              {profile.website && (
                <a href={profile.website} className="text-af-accent hover:underline">
                  🔗 {profile.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              <span>📅 Joined {new Date(profile.created_at).toLocaleDateString()}</span>
            </div>
            <div className="mt-4 flex gap-5 text-sm">
              <span>
                <strong>{counts.following}</strong> <span className="text-af-muted">Following</span>
              </span>
              <span>
                <strong>{counts.followers}</strong> <span className="text-af-muted">Followers</span>
              </span>
            </div>
          </div>
          <div role="tablist" aria-label="Your profile posts" className="flex border-b border-af-border px-2">
            {(["posts", "replies", "reposts", "media"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`relative min-h-12 flex-1 px-1 text-xs font-medium capitalize transition-colors hover:text-af-text sm:text-sm ${
                  tab === t ? "font-bold text-af-text" : "text-af-muted"
                }`}
              >
                {t}
                {tab === t && <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-af-brand" />}
              </button>
            ))}
          </div>
          {tab === "media"
            ? (() => {
                const items = Array.from(new Map<string, { url: string; post: Post }>(posts.flatMap((p) => (p.media_urls ?? []).map((u) => [u, { url: u, post: p }]))).values());
                const filtered = items.filter((it) => {
                  const isGif = it.url.toLowerCase().endsWith(".gif");
                  const isVideo = /\.(mp4|webm|mov)$/i.test(it.url);
                  if (mediaFilter === "photos") return !isGif && !isVideo;
                  if (mediaFilter === "gifs") return isGif;
                  if (mediaFilter === "videos") return isVideo;
                  return true;
                });
                return (
                  <div className="p-4">
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
                    {filtered.length === 0 ? (
                      <EmptyState title="No media yet" body="Media you post will appear here." />
                    ) : (
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                        {filtered.map((it, i) => (
                          <Link key={it.url + i} href={`/${encodeURIComponent(profile.username)}/status/${encodeURIComponent(it.post.id)}`} aria-label="Open media post" className="aspect-square overflow-hidden rounded-md bg-af-surface-2">
                            {/\.(mp4|webm|mov)$/i.test(it.url) ? (
                              <div className="relative h-full w-full">
                                <video src={it.url} aria-label="Video thumbnail" className="h-full w-full object-contain" />
                                <span className="absolute inset-0 flex items-center justify-center text-4xl text-white drop-shadow-lg">▶</span>
                              </div>
                            ) : (
                              <img src={it.url} alt="Profile media" loading="lazy" className="h-full w-full object-contain" />
                            )}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()
            : tab === "replies"
            ? replies.length === 0 ? (
                <EmptyState title="No replies yet" body="Your replies will appear here." />
              ) : (
                <div>
                  {replies.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </div>
              )
            : tab === "reposts"
            ? reposts.length === 0 ? (
                <EmptyState title="No reposts yet" body="Posts you repost will appear here." />
              ) : (
                <div>
                  {reposts.map((p) => (
                    <PostCard key={p.id} post={p} repostedBy="You" />
                  ))}
                </div>
              )
            : tab !== "posts"
            ? <EmptyState title="Nothing here yet" body="This tab will populate as features connect to real data." />
            : posts.length === 0 ? (
                <EmptyState title="No posts yet" body="Your posts will appear here." />
              ) : (
                <div>
                  {posts.map((p) => (
                    <PostCard key={p.id} post={p} />
                  ))}
                </div>
              )}
        </div>
      )}
    </Shell>
  );
}



