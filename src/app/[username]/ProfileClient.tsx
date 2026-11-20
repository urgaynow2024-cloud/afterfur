"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { canFollow } from "@/lib/follow";
import { useParams } from "next/navigation";
import PostCard from "@/components/PostCard";
import PostText from "@/components/PostText";
import Link from "next/link";
import { BadgeList } from "@/components/BadgeList";
import ReportDialog from "@/components/ReportDialog";
import { PrivateMediaGrid } from "@/components/post/private-media-grid";
import { BadgeCollection } from "@/components/BadgeCollection";
import { StyledDisplayName, StyledUsername } from "@/components/profile/styled-name";
import { LinkChip } from "@/components/profile/profile-links";
import { ProfileHeader } from "@/components/profile/profile-header";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  website: string | null;
  location: string | null;
  pronouns: string | null;
  profile_customisation?: Record<string, unknown> | null;
  created_at: string;
  is_private?: boolean | null;
  [key: string]: unknown;
};
type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };
type ProfileSummary = { id: string; username: string; display_name: string | null; avatar_url: string | null };

// Global refresh mutex to prevent concurrent refresh attempts across components
const globalRefreshMutex = new Map<string, Promise<{ ok: boolean; token: string | null; userId: string | null }>>();

function profileDiag(event: string, fields: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") return;
  try {
    console.info(`[profile-client] ${event}`, fields);
  } catch {}
}

export default function ProfileClient() {
  const { username } = useParams<{ username: string }>();
  const { user, session, loading: authLoading, activeUserId } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"posts" | "replies" | "media" | "likes">("posts");
  const [mediaFilter, setMediaFilter] = useState<"all" | "photos" | "gifs" | "videos">("all");
  const [posts, setPosts] = useState<Post[]>([]);
  const [replies, setReplies] = useState<Post[]>([]);
  const [likes, setLikes] = useState<Post[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followStatus, setFollowStatus] = useState<"none" | "pending" | "accepted">("none");
  const [followBusy, setFollowBusy] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
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
  const [reportUserOpen, setReportUserOpen] = useState(false);

  const fetchControllerRef = useRef<AbortController | null>(null);
  const fetchKeyRef = useRef<string>("");
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  // Track if we've already attempted a refresh for this fetch
  const refreshAttemptedRef = useRef(false);
  // Track if fetch has reached a terminal state
  const terminalStateRef = useRef(false);

  // Keep active client ref in sync (account switches change the active client/session)
  useEffect(() => {
    supabaseRef.current = createClient();
  }, [activeUserId, session?.access_token]);

  const fetchProfile = useCallback(async () => {
    profileDiag("fetch_started", {
      username,
      hasUsername: Boolean(username),
      authLoading,
      activeUserId,
      hasSession: Boolean(session),
      sessionUserId: session?.user?.id ?? null,
      sessionUserMatchesActive: session?.user?.id === activeUserId || null,
      hasAccessToken: Boolean(session?.access_token),
      activeClientPresent: Boolean(supabaseRef.current ?? createClient()),
    });
    try { console.info("[profile-diag] fetch_profile_start", { requestedUsername: username, authLoading, activeUserId: activeUserId ?? null, hasSession: Boolean(session), sessionUserId: session?.user?.id ?? null }); } catch {}

    // Wait for auth to finish loading instead of returning early
    if (authLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (authLoading) return;
    }

    if (!username) return;

    // Always re-read the session from the active Supabase client rather than
    // trusting a potentially stale closure value. This handles the case where
    // AuthProvider finishes session restoration after this component mounted.
    let currentSession = session;
    if (activeUserId && !currentSession) {
      // First wait for session restoration
      await new Promise(resolve => setTimeout(resolve, 150));
      const activeClient = supabaseRef.current ?? createClient();
      if (activeClient) {
        const { data } = await activeClient.auth.getSession();
        currentSession = data.session ?? null;
      }
    }

    // Second attempt: if there is an active user but still no session, wait once more.
    // Do not proceed without a Bearer token for a signed-in user.
    if (activeUserId && !currentSession) {
      await new Promise(resolve => setTimeout(resolve, 250));
      const activeClient = supabaseRef.current ?? createClient();
      if (activeClient) {
        const { data } = await activeClient.auth.getSession();
        currentSession = data.session ?? null;
      }
    }

    profileDiag("session_resolved", {
      username,
      activeUserId,
      hasSession: Boolean(currentSession),
      sessionUserId: currentSession?.user?.id ?? null,
      sessionUserMatchesActive: currentSession?.user?.id === activeUserId || null,
      hasAccessToken: Boolean(currentSession?.access_token),
    });

    const key = `${username}:${user?.id ?? "anon"}:${currentSession?.access_token ?? "none"}`;
    if (fetchKeyRef.current === key && terminalStateRef.current) return;
    fetchKeyRef.current = key;
    terminalStateRef.current = false;
    refreshAttemptedRef.current = false;

    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoading(true);
    setError("");

    const supabase = supabaseRef.current;
    if (!supabase) {
      if (!controller.signal.aborted) {
        setError("Supabase not configured.");
        setLoading(false);
        terminalStateRef.current = true;
      }
      return;
    }

    let doFetch: ((accessToken: string | null, retryAfterRefresh?: boolean) => Promise<{ ok: boolean; terminalError?: string }>) | null = null;

    try {
      doFetch = async (accessToken: string | null, retryAfterRefresh = false): Promise<{ ok: boolean; terminalError?: string }> => {
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const res = await fetch(`/api/profile/${encodeURIComponent(username)}`, { cache: "no-store", headers, signal: controller.signal });
        if (controller.signal.aborted) return { ok: false };

        if (res.status === 429) return { ok: false, terminalError: "This profile is temporarily rate-limited. Please wait a moment and try again." };
        if (res.status === 403) {
          try { console.info("[profile-diag] api_response", { requestedUsername: username, status: 403, hasBearer: Boolean(accessToken) }); } catch {}
          return { ok: false, terminalError: "private" };
        }
        if (res.status === 404) {
          try { console.info("[profile-diag] api_response", { requestedUsername: username, status: 404, hasBearer: Boolean(accessToken) }); } catch {}
          return { ok: false, terminalError: "Profile not found." };
        }
        if (res.status === 503) {
          try { console.info("[profile-diag] api_response", { requestedUsername: username, status: 503, hasBearer: Boolean(accessToken) }); } catch {}
          return { ok: false, terminalError: "Authentication is temporarily unavailable. Please try again shortly." };
        }
        if (res.status === 401) {
          const body = await res.json().catch(() => ({} as any));
          const authCode = typeof body?.authCode === "string" ? body.authCode : null;
          const authError = typeof body?.authError === "string" ? body.authError : null;
          try { console.info("[profile-diag] api_response", { requestedUsername: username, status: 401, hasBearer: Boolean(accessToken), authCode, authError }); } catch {}
          const recoverable = authError === "AuthSessionMissingError" || authCode === "session_not_found" || authCode === "bad_jwt" || authError === "AuthApiError";
          if (!retryAfterRefresh && accessToken && recoverable && !refreshAttemptedRef.current) {
            refreshAttemptedRef.current = true;
            try {
              const activeClient = createClient();
              if (activeClient) {
                // Use global mutex to prevent concurrent refreshes
                const mutexKey = activeUserId ?? "global";
                let refreshPromise = globalRefreshMutex.get(mutexKey);
                if (!refreshPromise) {
                  refreshPromise = (async () => {
                    try {
                      const refreshed = await activeClient.auth.refreshSession();
                      const nextToken = refreshed.data?.session?.access_token ?? null;
                      const nextUserId = refreshed.data?.session?.user?.id ?? null;
                      return { ok: !refreshed.error && !!nextToken, token: nextToken, userId: nextUserId };
                    } catch {
                      return { ok: false, token: null, userId: null };
                    }
                  })();
                  globalRefreshMutex.set(mutexKey, refreshPromise);
                }
                const result = await refreshPromise;
                globalRefreshMutex.delete(mutexKey);
                
                // Never switch accounts; retry at most once only if refreshed session matches active account context.
                if (result.ok && result.token && (!activeUserId || !result.userId || result.userId === activeUserId)) {
                  supabaseRef.current = activeClient;
                  return await doFetch!(result.token, true);
                }
              }
            } catch {
              // fall through to sign-in-again message
            }
          }
          // If we could not verify a bearer token after a safe refresh attempt,
          // retry anonymously so public profiles still load without destroying the session.
          // Never redirect or sign out from profile fetch failures.
          if (accessToken) {
            return await doFetch!(null, true);
          }
          return { ok: false, terminalError: "Authentication is temporarily unavailable. Please try again shortly." };
        }
        if (!res.ok) return { ok: false, terminalError: `Could not load this profile (HTTP ${res.status}).` };

        const json = await res.json().catch(() => null);
        const prof = json?.profile as Profile | null | undefined;
        if (controller.signal.aborted) return { ok: false };
        if (!prof?.id) return { ok: false, terminalError: "Profile not found." };
        try { console.info("[profile-diag] api_response", { requestedUsername: username, status: 200, hasBearer: Boolean(accessToken), profileIdPresent: Boolean(prof?.id), ownerId: prof?.id ?? null, is_private: (prof as any)?.is_private ?? null, is_private_type: typeof (prof as any)?.is_private }); } catch {}
        setProfile(prof);

        const { count: followers, error: followersError } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id);
        const { count: following, error: followingError } = await supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id);
        if (controller.signal.aborted) return { ok: false };
        if (followersError || followingError) setFollowError((followersError || followingError)?.message || "Could not load follow counts.");
        setCounts({ followers: followers ?? 0, following: following ?? 0 });

        if (user && user.id !== prof.id) {
          const { data: existing } = await supabase.from("follows").select("follower_id,status").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle();
          if (controller.signal.aborted) return { ok: false };
          setIsFollowing(!!existing);
          setFollowStatus(existing?.status === "accepted" ? "accepted" : existing ? "pending" : "none");
          const { data: blk } = await (supabase as any).from("blocks").select("blocker_id").eq("blocker_id", user.id).eq("blocked_id", prof.id).maybeSingle();
          if (controller.signal.aborted) return { ok: false };
          setIsBlocked(!!blk);
        } else {
          setIsFollowing(false);
          setIsBlocked(false);
        }

        let pq = supabase
          .from("posts")
          .select("*")
          .eq("author_id", prof.id)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false });
        if (user?.id !== prof.id) pq = pq.or("moderation_status.is.null,moderation_status.eq.visible");
        const { data: ps, error: postsError } = await pq;
        if (controller.signal.aborted) return { ok: false };
        if (postsError) { setFollowError(postsError.message); } else {
          const mappedPosts = ((ps ?? []) as Omit<Post, "profiles">[]).map((p) => ({ ...p, profiles: { username: prof.username, display_name: prof.display_name, avatar_url: prof.avatar_url } }));
          setPosts(mappedPosts as Post[]);
        }

        let rq = supabase.from("replies").select("*").eq("author_id", prof.id).order("created_at", { ascending: false });
        if (user?.id !== prof.id) rq = rq.or("moderation_status.is.null,moderation_status.eq.visible");
        const { data: rs, error: repliesError } = await rq;
        if (controller.signal.aborted) return { ok: false };
        if (repliesError) { setFollowError(repliesError.message); } else {
          const mappedReplies = ((rs ?? []) as { id: string; content: string; created_at: string; author_id: string }[]).map((r) => ({ id: r.id, content: r.content, created_at: r.created_at, author_id: r.author_id, media_urls: null, profiles: { username: prof.username, display_name: prof.display_name, avatar_url: prof.avatar_url } }));
          setReplies(mappedReplies as Post[]);
        }

        const { data: likedRows, error: likesError } = await supabase.from("likes").select("post_id").eq("user_id", prof.id);
        if (controller.signal.aborted) return { ok: false };
        if (likesError) {
          if (user?.id === prof.id) setFollowError(likesError.message);
          setLikes([]);
        } else {
          const likedIds = ((likedRows ?? []) as { post_id: string }[]).map((r) => r.post_id);
          if (likedIds.length) {
            const { data: likedPosts, error: likedPostsError } = await supabase.from("posts").select("*").in("id", likedIds);
            if (controller.signal.aborted) return { ok: false };
            if (likedPostsError) {
              if (user?.id === prof.id) setFollowError(likedPostsError.message);
              setLikes([]);
            } else {
              const likedPostsArr = (likedPosts ?? []) as Omit<Post, "profiles">[];
              const likeAuthorIds = [...new Set(likedPostsArr.map((p) => p.author_id).filter(Boolean))];
              let likeAuthorMap = new Map<string, { username: string; display_name: string | null; avatar_url: string | null }>();
              if (likeAuthorIds.length) {
                const { data: likeAuthors } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", likeAuthorIds);
                if (likeAuthors) {
                  likeAuthorMap = new Map((likeAuthors as { id: string; username: string; display_name: string | null; avatar_url: string | null }[]).map((a) => [a.id, { username: a.username, display_name: a.display_name, avatar_url: a.avatar_url }]));
                }
              }
              const mappedLikes = likedPostsArr.map((p) => ({
                ...p,
                profiles: likeAuthorMap.get(p.author_id) ?? null,
              }));
              setLikes(mappedLikes as Post[]);
            }
          } else {
            setLikes([]);
          }
        }
        return { ok: true };
      };

      const initialToken = currentSession?.access_token ?? null;
      const result = await doFetch(initialToken, false);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        if (result.terminalError) setError(result.terminalError);
        setLoading(false);
        terminalStateRef.current = true;
        return;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
        terminalStateRef.current = true;
      }
    } catch (e) {
      // For signed-in users, retry anonymously once if initial bearer fetch failed
      // due to a transient client/network issue. Never clear auth state.
      if (!controller.signal.aborted && currentSession?.access_token) {
        try {
          const anonRetry = await doFetch!(null, true);
          if (!controller.signal.aborted && anonRetry.ok) {
            setLoading(false);
            terminalStateRef.current = true;
            return;
          }
        } catch {}
      }
      if (controller.signal.aborted) return;
      setError("Could not load this profile. Check your connection and retry.");
      setLoading(false);
      terminalStateRef.current = true;
    }
  }, [username, user?.id, authLoading, activeUserId, session]);

  useEffect(() => {
    void fetchProfile();
    return () => {
      fetchControllerRef.current?.abort();
    };
  }, [fetchProfile]);

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
        setFollowStatus("none");
        setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }));
      } else {
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
        if (error) { setFollowError(error.message); return; }
        setIsFollowing(true);
        setFollowStatus("accepted");
        setCounts((c) => ({ ...c, followers: c.followers + 1 }));
      try {
        const prof = profile as any;
        const isPrivate = !!prof.is_private;
        const { createFollowNotification } = await import("@/lib/notifications.server");
        await createFollowNotification({ followerId: user.id, followingId: profile.id, isRequest: isPrivate });
      } catch {}
    }
    } catch {
      setFollowError("Could not update your follow. Check your connection and try again.");
    } finally {
      followBusyRef.current = false;
      setFollowBusy(false);
    }
  }
  async function doBlock() {
    if (!user || !profile || user.id === profile.id || blockBusy) return;
    if (!window.confirm("Block this user? They won't be able to interact with you.")) return;
    const supabase = createClient();
    if (!supabase) return;
    setBlockBusy(true);
    try {
      const { error } = await (supabase as any).from("blocks").insert({ blocker_id: user.id, blocked_id: profile.id });
      if (error) { setFollowError(error.message); return; }
      setIsBlocked(true);
    } finally { setBlockBusy(false); }
  }
  async function doUnblock() {
    if (!user || !profile || blockBusy) return;
    const supabase = createClient();
    if (!supabase) return;
    setBlockBusy(true);
    try {
      const { error } = await (supabase as any).from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", profile.id);
      if (error) { setFollowError(error.message); return; }
      setIsBlocked(false);
    } finally { setBlockBusy(false); }
  }

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Profile" />
        <div aria-label="Loading profile" className="animate-pulse">
          <div className="h-40 w-full bg-af-surface-2 sm:h-52" />
          <div className="px-4 pb-6 pt-12 sm:px-5 sm:pt-14">
            <div className="h-7 w-2/5 rounded bg-af-surface-2" />
            <div className="mt-2 h-3.5 w-1/4 rounded bg-af-surface-2" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-af-surface-2" />
              <div className="h-3 w-4/5 rounded bg-af-surface-2" />
            </div>
            <div className="mt-5 flex gap-4">
              <div className="h-3 w-20 rounded bg-af-surface-2" />
              <div className="h-3 w-20 rounded bg-af-surface-2" />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  if (error === "private") {
    return <Shell><PageHeader title="Profile" /><EmptyState title="Private profile" body="This account is private. Follow them to request access to their posts." action={{ label: "Find creators", href: "/explore" }} /></Shell>;
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
    const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Could not delete post.");
      return;
    }
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
    if (!editingPost || !user || !content || content.length > 600 || editSubmittingRef.current) return;
    editSubmittingRef.current = true;
    setEditSubmitting(true); setEditError("");
    const res = await fetch(`/api/posts/${encodeURIComponent(editingPost.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setEditError(json?.error || "The post was not updated. Your changes are still here.");
      editSubmittingRef.current = false;
      setEditSubmitting(false);
      return;
    }
    const json = await res.json();
    const data = json?.post || json;
    const updated = { ...editingPost, ...(data as Post) };
    setPosts((current) => current.map((p) => p.id === editingPost.id ? updated : p));
    setReplies((current) => current.map((p) => p.id === editingPost.id ? updated : p));
    setLikes((current) => current.map((p) => p.id === editingPost.id ? updated : p));
    setEditingPost(null);
    setEditDraft("");
    editSubmittingRef.current = false;
    setEditSubmitting(false);
  }
  const mediaItems = posts.flatMap((p) => (p.media_urls ?? []).map((u) => ({ url: u, post: p })));
  const filteredMediaItems = mediaItems.filter((item) => {
    const lower = item.url.toLowerCase();
    const isGif = lower.endsWith(".gif");
    const isVideo = /\.(mp4|webm|mov)$/i.test(lower);
    if (mediaFilter === "photos") return !isGif && !isVideo;
    if (mediaFilter === "gifs") return isGif;
    if (mediaFilter === "videos") return isVideo;
    return true;
  });
  const isOwn = user?.id === profile.id;
  return (
    <Shell>
      <ProfileHeader
        profile={profile}
        isSelf={isOwn}
        isFollowing={isFollowing}
        followerCount={counts.followers}
        followingCount={counts.following}
        onFollow={toggleFollow}
        user={user}
        followStatus={followStatus}
        followBusy={followBusy}
      />
      {followError && <p role="alert" className="mt-3 text-sm text-af-danger px-4 sm:px-5">Follow update failed: {followError}</p>}

      <div role="tablist" aria-label="Profile posts" className="sticky top-14 z-20 flex border-b border-af-border bg-af-bg/95 px-2 backdrop-blur-md md:top-0 sm:px-4">
        {(isOwn ? ["posts", "replies", "media", "likes"] as const : ["posts", "replies", "media"] as const).map((t) => (
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

      {tab === "media" ? (
        filteredMediaItems.length === 0 ? (
          <EmptyState title="No media yet" body="Photos, GIFs and videos this user posts will appear here." />
        ) : (
          <div className="p-2 sm:p-3">
            <div className="mb-3 flex flex-wrap gap-2 text-[13px]">
              {(["all", "photos", "gifs", "videos"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setMediaFilter(f)}
                  className={`min-h-8 rounded-full px-3 font-medium capitalize transition-colors ${
                    mediaFilter === f ? "bg-af-brand text-white" : "bg-af-surface-2 text-af-text-2 hover:bg-af-surface-raised hover:text-af-text"
                  }`}
                  aria-pressed={mediaFilter === f}
                >
                  {f}
                </button>
              ))}
            </div>
            <PrivateMediaGrid
              items={filteredMediaItems.map((it) => ({ url: it.url, postId: it.post.id }))}
              username={profile.username}
              gridClassName="grid grid-cols-2 gap-1 sm:grid-cols-3"
              itemClassName="aspect-square overflow-hidden rounded-lg bg-af-surface-2"
            />
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
            <div className="flex items-center justify-between border-b border-af-border pb-3">
              <h2 id="profile-list-title" className="text-base font-semibold capitalize text-af-text">{listType}</h2>
              <button type="button" onClick={() => setListType(null)} aria-label="Close list" className="flex h-9 w-9 items-center justify-center rounded-full text-af-muted hover:bg-af-surface-2 hover:text-af-text">
                <span aria-hidden="true" className="text-xl leading-none">×</span>
              </button>
            </div>
            {listLoading ? <p className="mt-4 text-sm text-af-muted">Loading…</p> : listError ? <p className="mt-4 text-sm text-af-danger">{listError}</p> : listProfiles.length === 0 ? <p className="mt-4 text-sm text-af-muted">No accounts found.</p> : (
              <div className="mt-2">
                {listProfiles.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 border-b border-af-border/60 py-3 last:border-0">
                    <Link href={`/${p.username}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                      {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-af-brand-soft">{(p.display_name || p.username).slice(0, 1).toUpperCase()}</span>}
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
            <textarea id="edit-post-content" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} maxLength={600} rows={6} className="af-field mt-4 min-h-36 w-full resize-y px-3 py-2 text-sm leading-relaxed" />
            <div className="mt-2 flex items-center justify-between"><span className="text-xs text-af-muted">{editDraft.length}/600</span><div className="flex gap-2">
              <button type="button" onClick={() => { setEditingPost(null); setEditDraft(""); }} disabled={editSubmitting} className="af-action-secondary">Cancel</button>
              <button type="submit" disabled={editSubmitting || !editDraft.trim() || editDraft.length > 600} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{editSubmitting ? "Saving…" : "Save changes"}</button>
            </div></div>
          </form>
        </div>
      )}
      <ReportDialog open={reportUserOpen} onClose={() => setReportUserOpen(false)} targetType="user" targetId={profile.id} targetLabel="this account" onSuccess={() => setReportUserOpen(false)} />
    </Shell>
  );
}
