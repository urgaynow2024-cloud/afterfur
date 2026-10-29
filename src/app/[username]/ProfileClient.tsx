"use client";

import { useEffect, useRef, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canFollow } from "@/lib/follow";
import { useParams } from "next/navigation";
import PostCard from "@/components/PostCard";
import Link from "next/link";
import { BadgeList } from "@/components/BadgeList";

type Profile = { id: string; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; banner_url: string | null; website: string | null; location: string | null; created_at: string };
type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };
type ProfileSummary = { id: string; username: string; display_name: string | null; avatar_url: string | null };

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
  const followBusyRef = useRef(false);
  const [followError, setFollowError] = useState("");
  const [listType, setListType] = useState<'followers' | 'following' | null>(null);
  const [listProfiles, setListProfiles] = useState<ProfileSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");
  const editSubmittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const supabase = createClient();
      if (!supabase) { setError("Supabase not configured."); setLoading(false); return; }
      try {
      const { data: prof, error: profileError } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
      if (cancelled) return;
      if (profileError) { setError(profileError.message); setLoading(false); return; }
      if (!prof) { setError("Profile not found."); setLoading(false); return; }
      setProfile(prof as Profile);

      const { count: followers, error: followersError } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id);
      const { count: following, error: followingError } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id);
      if (cancelled) return;
      if (followersError || followingError) setError((followersError || followingError)?.message || "Could not load follow counts.");
      setCounts({ followers: followers ?? 0, following: following ?? 0 });

      if (user && user.id !== prof.id) {
        const { data: existing } = await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle();
        if (cancelled) return;
        setIsFollowing(!!existing);
      }

      const { data: ps, error: postsError } = await supabase.from("posts").select("*").eq("author_id", prof.id).order("created_at", { ascending: false });
      if (cancelled) return;
      if (postsError) { setError(postsError.message); setLoading(false); return; }
      const mappedPosts = ((ps ?? []) as Omit<Post, "profiles">[]).map((p) => ({ ...p, profiles: prof }));
      setPosts(mappedPosts as Post[]);

      const { data: rs, error: repliesError } = await supabase.from("replies").select("*").eq("author_id", prof.id).order("created_at", { ascending: false });
      if (cancelled) return;
      if (repliesError) { setError(repliesError.message); setLoading(false); return; }
      const mappedReplies = ((rs ?? []) as { id: string; content: string; created_at: string; author_id: string }[]).map((r) => ({ id: r.id, content: r.content, created_at: r.created_at, author_id: r.author_id, media_urls: null, profiles: prof }));
      setReplies(mappedReplies as Post[]);

      const { data: likedRows, error: likesError } = await supabase.from("likes").select("post_id").eq("user_id", prof.id);
      if (cancelled) return;
      if (likesError && user?.id === prof.id) { setError(likesError.message); setLoading(false); return; }
      const likedIds = ((likedRows ?? []) as { post_id: string }[]).map((r) => r.post_id);
      if (likedIds.length) {
        const { data: likedPosts, error: likedPostsError } = await supabase.from("posts").select("*").in("id", likedIds);
        if (cancelled) return;
        if (likedPostsError && user?.id === prof.id) { setError(likedPostsError.message); setLoading(false); return; }
        const mappedLikes = ((likedPosts ?? []) as Omit<Post, "profiles">[]).map((p) => ({ ...p, profiles: null }));
        setLikes(mappedLikes as Post[]);
      } else {
        setLikes([]);
      }

      setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Could not load this profile. Check your connection and retry.");
        setLoading(false);
      }
    };
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void run();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [username, user]);

  async function openList(type: 'followers' | 'following') {
    if (!profile) return;
    const supabase = createClient();
    if (!supabase) return;
    setListType(type);
    setListLoading(true);
    setListError('');
    setListProfiles([]);
    const column = type === 'followers' ? 'follower_id' : 'following_id';
    const filterColumn = type === 'followers' ? 'following_id' : 'follower_id';
    const { data: rows, error } = await supabase.from('follows').select(column).eq(filterColumn, profile.id);
    if (error) { setListError(error.message); setListLoading(false); return; }
    const ids = ((rows ?? []) as Record<string, string>[]).map((r) => r[column]).filter(Boolean);
    if (ids.length === 0) { setListLoading(false); return; }
    const { data: profs, error: pError } = await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id', ids);
    if (pError) { setListError(pError.message); setListLoading(false); return; }
    setListProfiles(profs ?? []);
    setListLoading(false);
  }

  async function toggleFollow() {
    if (followBusyRef.current || !user || !profile || !canFollow(user.id, profile.id)) return;
    const supabase = createClient();
    if (!supabase) return;
    followBusyRef.current = true;
    setFollowBusy(true);
    setFollowError("");
    try {
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
      if (error) { setFollowError(error.message); return; }
      setIsFollowing(false);
      setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }));
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
      if (error) { setFollowError(error.message); return; }
      setIsFollowing(true);
      setCounts((c) => ({ ...c, followers: c.followers + 1 }));
    }
    } catch {
      setFollowError("Could not update your follow. Check your connection and try again.");
    } finally {
      followBusyRef.current = false;
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Profile" />
        <div className="p-8 text-center text-sm text-af-muted">Loading profile…</div>
      </Shell>
    );
  }

  if (error) {
    return <Shell><PageHeader title="Profile" /><div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger">Could not load this profile: {error}</div></Shell>;
  }

  if (!profile) {
    return (
      <Shell>
        <PageHeader title="Profile" />
        <EmptyState title="Profile not found" body="This user may not exist or is unavailable." />
      </Shell>
    );
  }

  async function deletePost(postId: string) {
    const supabase = createClient();
    if (!supabase || !user) return;
    const { error } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", user.id);
    if (error) { setError(error.message); return; }
    setPosts((ps) => ps.filter((p) => p.id !== postId));
    setReplies((rs) => rs.filter((r) => r.id !== postId));
    setLikes((ls) => ls.filter((l) => l.id !== postId));
  }

  function startEdit(postId: string) {
    const post = [...posts, ...replies, ...likes].find((p) => p.id === postId);
    if (!post || post.author_id !== user?.id) return;
    setEditingPost(post);
    setEditDraft(post.content);
    setEditError("");
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    const content = editDraft.trim();
    const supabase = createClient();
    if (!editingPost || !user || !supabase || !content || content.length > 300 || editSubmittingRef.current) return;
    editSubmittingRef.current = true;
    setEditSubmitting(true); setEditError("");
    const { data, error: updateError } = await supabase.from("posts").update({ content, edited_at: new Date().toISOString() }).eq("id", editingPost.id).eq("author_id", user.id).select("*").single();
    if (updateError || !data) {
      setEditError(updateError?.message ?? "The post was not updated. Your changes are still here.");
      editSubmittingRef.current = false;
      setEditSubmitting(false);
      return;
    }
    const updated = { ...editingPost, ...(data as Post) };
    setPosts((current) => current.map((p) => p.id === editingPost.id ? updated : p));
    setReplies((current) => current.map((p) => p.id === editingPost.id ? updated : p));
    setLikes((current) => current.map((p) => p.id === editingPost.id ? updated : p));
    setEditingPost(null);
    setEditDraft("");
    editSubmittingRef.current = false;
    setEditSubmitting(false);
  }
  const isOwn = user?.id === profile.id;
  const mediaItems = posts.flatMap((p) => (p.media_urls ?? []).map((u) => ({ url: u, post: p })));

  return (
    <Shell>
      <PageHeader title={profile.display_name || profile.username} subtitle={`@${profile.username}`} />
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
          <div className="min-w-0">
            <h1 className="break-words text-xl font-semibold tracking-tight text-af-text">{profile.display_name || profile.username}</h1>
            <p className="text-sm text-af-muted">@{profile.username}</p>
            <BadgeList userId={profile.id} className="mt-2" />
          </div>
          {isOwn ? (
            <Link href="/settings" className="af-action-secondary">
              Edit profile
            </Link>
          ) : (
            <button
              onClick={toggleFollow}
              aria-pressed={isFollowing}
              aria-label={`${isFollowing ? "Unfollow" : "Follow"} ${profile.display_name || profile.username}`}
              disabled={followBusy}
              className={`min-h-10 rounded-md px-4 text-sm font-semibold transition-colors disabled:opacity-50 ${isFollowing ? "border border-af-border-strong text-af-text hover:bg-af-surface-2" : "bg-af-brand text-white hover:bg-af-brand-hover"}`}
            >
              {followBusy ? "..." : isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {followError && <p role="alert" className="mt-3 text-sm text-af-danger">Follow update failed: {followError}</p>}
        {profile.bio && <p className="mt-3 max-w-prose whitespace-pre-wrap text-[15px] leading-6 text-af-text-2">{profile.bio}</p>}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-af-muted">
          {profile.website && <a href={profile.website} className="text-af-accent hover:underline">{profile.website.replace(/^https?:\/\//, "")}</a>}
          {profile.location && <span>{profile.location}</span>}
          <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          <button type="button" onClick={() => openList('followers')} className="text-left hover:underline"><strong className="text-af-text">{counts.followers}</strong> <span className="text-af-muted">Followers</span></button>
          <button type="button" onClick={() => openList('following')} className="text-left hover:underline"><strong className="text-af-text">{counts.following}</strong> <span className="text-af-muted">Following</span></button>
        </div>
      </div>

      <div role="tablist" aria-label="Profile posts" className="flex border-b border-af-border px-2">
        {(isOwn ? ["posts", "replies", "media", "likes"] as const : ["posts", "replies", "media"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative min-h-12 flex-1 px-1 text-xs font-medium capitalize transition-colors hover:text-af-text sm:text-sm ${tab === t ? "text-af-text" : "text-af-muted"}`}
          >
            {t}
            {tab === t && <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-af-brand" />}
          </button>
        ))}
      </div>

      {tab === "media" ? (
        mediaItems.length === 0 ? (
          <EmptyState title="No media yet" body="Media this user posts will appear here." />
        ) : (
          <div className="grid grid-cols-2 gap-1 p-2 sm:grid-cols-3">
            {mediaItems.map((item, index) => (
              <Link key={item.url + index} href={`/${encodeURIComponent(profile.username)}/status/${encodeURIComponent(item.post.id)}`} aria-label={`Open media post by ${profile.display_name || profile.username}`} className="aspect-square overflow-hidden rounded-md bg-af-surface-2">
                {/\.(mp4|webm|mov)$/i.test(item.url) ? (
                  <div className="relative h-full w-full">
                    <video src={item.url} aria-label="Video thumbnail" className="h-full w-full object-contain" />
                    <span className="absolute inset-0 flex items-center justify-center text-3xl text-white drop-shadow-lg">▶</span>
                  </div>
                ) : (
                  <img src={item.url} alt="Profile media" loading="lazy" className="h-full w-full object-contain" />
                )}
              </Link>
            ))}
          </div>
        )
      ) : tab === "replies" ? (
        replies.length === 0 ? <EmptyState title="No replies yet" body="Replies will appear here." /> : <div>{replies.map((p) => <PostCard key={p.id} post={p} onEdit={user?.id === p.author_id ? startEdit : undefined} onDelete={user?.id === p.author_id ? deletePost : undefined} />)}</div>
      ) : tab === "likes" && isOwn ? (
        likes.length === 0 ? <EmptyState title="No likes yet" body="Liked posts will appear here." /> : <div>{likes.map((p) => <PostCard key={p.id} post={p} onEdit={user?.id === p.author_id ? startEdit : undefined} onDelete={user?.id === p.author_id ? deletePost : undefined} />)}</div>
      ) : posts.length === 0 ? (
        <EmptyState title="No posts yet" body="Posts will appear here." />
      ) : (
        <div>{posts.map((p) => <PostCard key={p.id} post={p} onEdit={user?.id === p.author_id ? startEdit : undefined} onDelete={user?.id === p.author_id ? deletePost : undefined} />)}</div>
      )}
      {listType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="profile-list-title" onClick={() => setListType(null)}>
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-xl border border-af-border bg-af-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 id="profile-list-title" className="text-base font-semibold capitalize text-af-text">{listType}</h2>
              <button type="button" onClick={() => setListType(null)} className="min-h-10 rounded-md px-3 text-sm text-af-muted hover:bg-af-surface-2 hover:text-af-text">Close</button>
            </div>
            {listLoading ? <p className="mt-4 text-sm text-af-muted">Loading…</p> : listError ? <p className="mt-4 text-sm text-af-danger">{listError}</p> : listProfiles.length === 0 ? <p className="mt-4 text-sm text-af-muted">No accounts found.</p> : (
              <div className="mt-4 space-y-3">
                {listProfiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <Link href={`/${p.username}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                      {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/${p.username}`} className="block truncate text-sm font-bold hover:underline">{p.display_name || p.username}</Link>
                      <p className="truncate text-xs text-af-muted">@{p.username}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-post-title">
          <form onSubmit={saveEdit} className="w-full max-w-xl rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl">
            <h2 id="edit-post-title" className="text-lg font-semibold">Edit post</h2>
            {editError && <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{editError}</p>}
            <label htmlFor="edit-post-content" className="sr-only">Post content</label>
            <textarea id="edit-post-content" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} maxLength={300} rows={6} className="af-field mt-4 min-h-36 w-full resize-y px-3 py-2 text-sm leading-relaxed" />
            <div className="mt-2 flex items-center justify-between"><span className="text-xs text-af-muted">{editDraft.length}/300</span><div className="flex gap-2">
              <button type="button" onClick={() => { setEditingPost(null); setEditDraft(""); }} disabled={editSubmitting} className="af-action-secondary">Cancel</button>
              <button type="submit" disabled={editSubmitting || !editDraft.trim() || editDraft.length > 300} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{editSubmitting ? "Saving…" : "Save changes"}</button>
            </div></div>
          </form>
        </div>
      )}
    </Shell>
  );
}
