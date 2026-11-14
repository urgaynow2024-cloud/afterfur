"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { callRpc } from "@/lib/rpc";
import PostCard from "@/components/PostCard";
import Link from "next/link";
import { BadgeList } from "@/components/BadgeList";
import { BadgeCollection } from "@/components/BadgeCollection";
import { PrivateMediaGrid } from "@/components/post/private-media-grid";
import { StyledDisplayName, StyledUsername } from "@/components/profile/styled-name";
import { LinkChip } from "@/components/profile/profile-links";

type Profile = { id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; banner_url: string | null; website: string | null; location: string | null; pronouns: string | null; created_at: string; profile_customisation?: Record<string, unknown> | null; profile_links?: Array<{ id: string; url: string; label: string | null; display_order: number }> | null };
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
      const { data: ps } = await supabase.from("posts").select("*").eq("author_id", user.id).or("moderation_status.is.null,moderation_status.eq.visible").order("created_at", { ascending: false });
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      let profileData = prof;
      if (!profileData) {
        const { data: np } = await supabase.from("profiles").upsert({ id: user.id, username: user.email?.split("@")[0] || `user_${user.id.slice(0, 6)}` }).select().single();
        profileData = np;
      }
      setProfile(profileData as Profile);
      // Fetch the owner's saved external links and attach them to the profile.
      try {
        const { data: linksData, error: linksError } = await callRpc(supabase, "get_my_profile_links", undefined);
        if (!linksError && linksData) {
          const arr = Array.isArray(linksData) ? linksData : [];
          setProfile({ ...(profileData as Profile), profile_links: arr as Profile["profile_links"] } as Profile);
        }
      } catch {}
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

      const { data: rp } = await supabase.from("replies").select("*").eq("author_id", user.id).or("moderation_status.is.null,moderation_status.eq.visible").order("created_at", { ascending: false });
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
      <Shell compact={true}>
        <PageHeader title="Profile" />
        <EmptyState title="Sign in to view your profile" body="Create an account or sign in to manage your profile." action={{ label: "Sign in", href: "/signin" }} />
      </Shell>
    );
  }

  return (
    <Shell compact={true}>
      <PageHeader title="Profile" />
      {loading ? (
        <div aria-label="Loading your profile" className="animate-pulse">
          <div className="h-40 w-full bg-af-surface-2 sm:h-52" />
          <div className="px-4 pb-6 pt-12 sm:px-5 sm:pt-14">
            <div className="h-7 w-2/5 rounded bg-af-surface-2" />
            <div className="mt-2 h-3.5 w-1/4 rounded bg-af-surface-2" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-af-surface-2" />
              <div className="h-3 w-4/5 rounded bg-af-surface-2" />
            </div>
          </div>
        </div>
      ) : !profile ? (
        <EmptyState title="Complete your profile" body="Add your details to help the community find you." action={{ label: "Edit profile", href: "/edit-profile" }} />
      ) : (
        <div>
          <div className="relative">
            {profile.banner_url ? (
              <img src={profile.banner_url} alt={`${profile.display_name || profile.username}'s banner`} className="h-40 w-full object-cover sm:h-52" />
            ) : (
              <div aria-hidden="true" className="h-40 w-full border-b border-af-border bg-gradient-to-br from-af-surface via-af-surface-2 to-af-surface sm:h-52" />
            )}
            <div className="absolute -bottom-10 left-4 sm:-bottom-12 sm:left-5">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={`${profile.display_name || profile.username}'s avatar`} className="h-24 w-24 rounded-full border-4 border-af-bg bg-af-surface object-cover shadow-xl sm:h-28 sm:w-28" />
              ) : (
                <div aria-hidden="true" className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-af-bg bg-af-surface-raised text-2xl font-bold text-af-brand-soft shadow-xl sm:h-28 sm:w-28">
                  {(profile.display_name || profile.username).slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div className="px-4 pb-5 pt-12 sm:px-5 sm:pt-14">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <StyledDisplayName profile={{ display_name: profile.display_name, username: profile.username, profile_customisation: profile.profile_customisation }} size="lg" />
<div className="mt-0.5"><StyledUsername profile={{ display_name: profile.display_name, username: profile.username, profile_customisation: profile.profile_customisation }} /></div>
            {profile.pronouns && <span className="ml-1 text-xs text-af-text-2">{profile.pronouns}</span>}
            <BadgeList userId={profile.id} className="mt-2" />
              </div>
              <Link href="/edit-profile" className="af-action-secondary shrink-0">Edit profile</Link>
            </div>
            {profile.bio && <p className="mt-3 max-w-prose whitespace-pre-wrap text-[15px] leading-6 text-af-text-2">{profile.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-af-muted">
              {profile.location && <span>{profile.location}</span>}
              {profile.website && (
                <a href={profile.website} className="text-af-brand-soft hover:underline">
                  {profile.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {profile.profile_links && profile.profile_links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profile.profile_links
                    .slice()
                    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
                    .map((link) => (
                      <LinkChip key={link.id} link={link} />
                    ))}
                </div>
              )}
              <span>Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span><strong className="text-af-text">{counts.following}</strong> <span className="text-af-muted">Following</span></span>
              <span><strong className="text-af-text">{counts.followers}</strong> <span className="text-af-muted">Followers</span></span>
              <BadgeCollection userId={profile.id} username={profile.username} />
            </div>
          </div>
          <div role="tablist" aria-label="Your profile posts" className="sticky top-14 z-20 flex border-b border-af-border bg-af-bg/95 px-2 backdrop-blur-md md:top-0 sm:px-4">
            {(["posts", "replies", "reposts", "media"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`af-feed-tab min-h-12 flex-1 px-1 text-xs capitalize sm:text-sm ${tab === t ? "" : "text-af-muted"}`}
              >
                {t}
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
                  <div className="p-2 sm:p-3">
                    <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
                      {(["all", "photos", "gifs", "videos"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setMediaFilter(f)}
                          aria-pressed={mediaFilter === f}
                          className={`min-h-8 rounded-full px-3 font-medium capitalize transition-colors ${
                            mediaFilter === f ? "bg-af-brand text-white" : "bg-af-surface-2 text-af-text-2 hover:bg-af-surface-raised hover:text-af-text"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    {filtered.length === 0 ? (
                      <EmptyState title="No media yet" body="Photos, GIFs and videos you post will appear here." />
                    ) : (
                      <PrivateMediaGrid
                        items={filtered.map((it) => ({ url: it.url, postId: it.post.id }))}
                        username={profile.username}
                        gridClassName="grid grid-cols-2 gap-1 sm:grid-cols-3"
                        itemClassName="aspect-square overflow-hidden rounded-lg bg-af-surface-2"
                      />
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



