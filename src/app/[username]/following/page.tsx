"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type ProfileSummary = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  followStatus: "pending" | "accepted" | "none";
};

export default function FollowingPage() {
  const { username } = useParams<{ username: string }>();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<{ id: string; username: string; display_name: string | null; avatar_url: string | null } | null>(null);
  const [list, setList] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const followBusyRef = useRef(false);
  const [followsViewer, setFollowsViewer] = useState(false);

  const fetchControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!username) return;
    if (authLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (authLoading) return;
    }
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(username)}`, { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.status === 403) { setError("private"); setLoading(false); return; }
      if (res.status === 404) { setError("not_found"); setLoading(false); return; }
      if (!res.ok) { setError("Could not load this profile."); setLoading(false); return; }
      const json = await res.json();
      const prof = json?.profile;
      if (controller.signal.aborted) return;
      if (!prof?.id) { setError("Profile not found."); setLoading(false); return; }
      setProfile({ id: prof.id, username: prof.username, display_name: prof.display_name, avatar_url: prof.avatar_url });

      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }

      if (user && user.id !== prof.id) {
        // RLS: accepted rows readable by all; pending rows only by recipient
        // (following_id = auth.uid()), which is exactly this query.
        supabase.from("follows" as any).select("follower_id").eq("follower_id", prof.id).eq("following_id", user.id).maybeSingle().then(({ data }) => setFollowsViewer(!!data));
      }

      const { data: rows, error: followsError } = await supabase
        .from("follows")
        .select("following_id, status")
        .eq("follower_id", prof.id)
        .order("created_at", { ascending: false });
      if (controller.signal.aborted) return;
      if (followsError) { setError(followsError.message); setLoading(false); return; }
      const followById = new Map<string, string>();
      ((rows ?? []) as { following_id: string; status: string }[]).forEach((r) => {
        if (r.following_id) followById.set(r.following_id, r.status);
      });
      const ids = Array.from(followById.keys()).filter(Boolean);
      if (ids.length === 0) { setList([]); setLoading(false); return; }
      const { data: profs, error: profsError } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);
      if (controller.signal.aborted) return;
      if (profsError) { setError(profsError.message); setLoading(false); return; }
      setList((profs ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        followStatus: (followById.get(p.id) ?? "none") as "pending" | "accepted" | "none",
      })));
    } catch {
      setError("Could not load following. Check your connection and retry.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [username, authLoading]);

  useEffect(() => {
    void load();
    return () => { fetchControllerRef.current?.abort(); };
  }, [load]);

  async function toggleFollow(targetId: string) {
    if (followBusyRef.current || !user || !profile) return;
    const supabase = createClient();
    if (!supabase) return;
    followBusyRef.current = true;
    setFollowBusy(true);
    try {
      const row = await supabase.from("follows").select("status").eq("follower_id", user.id).eq("following_id", targetId).maybeSingle();
      const status = (row.data as { status: string } | null)?.status;
      if (status === "accepted" || status === "pending") {
        await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", targetId);
        setList((l) => l.map((p) => p.id === targetId ? { ...p, followStatus: "none" } : p));
      } else {
        await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
        const { data: inserted } = await supabase.from("follows").select("status").eq("follower_id", user.id).eq("following_id", targetId).maybeSingle();
        setList((l) => l.map((p) => p.id === targetId ? { ...p, followStatus: ((inserted as { status: string } | null)?.status ?? "none") as "pending" | "accepted" | "none" } : p));
      }
    } catch {
      // follow update failures are non-fatal for the list page
    } finally {
      followBusyRef.current = false;
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Following" />
        <div aria-label="Loading following" className="animate-pulse px-4 sm:px-5 pt-6">
          <div className="h-4 w-1/3 rounded bg-af-surface-2" />
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-af-surface-2" />
            <div className="h-3 w-4/5 rounded bg-af-surface-2" />
          </div>
          <div className="mt-5 flex gap-4">
            <div className="h-3 w-20 rounded bg-af-surface-2" />
            <div className="h-3 w-20 rounded bg-af-surface-2" />
          </div>
        </div>
      </Shell>
    );
  }

  if (error === "private") {
    return <Shell><PageHeader title="Following" /><EmptyState title="Private profile" body="This account is private. Follow them to request access to their following list." /></Shell>;
  }
  if (error === "not_found") {
    return <Shell><PageHeader title="Following" /><EmptyState title="Profile not found" body="This user may not exist or is unavailable." /></Shell>;
  }
  if (error) {
    return <Shell><PageHeader title="Following" /><div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger">{error}</div></Shell>;
  }
  if (!profile) {
    return <Shell><PageHeader title="Following" /><EmptyState title="Profile not found" body="This user may not exist or is unavailable." /></Shell>;
  }

  return (
    <Shell>
      <PageHeader title={`Following ${profile.display_name || profile.username}`} subtitle={`${list.length} following`} />
      <div className="px-4 sm:px-5 pt-4 pb-12">
        {list.length === 0 ? (
          <EmptyState title="Not following anyone yet" body="When this user follows accounts, they will appear here." />
        ) : (
          <div className="space-y-2">
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-af-border/60 pb-3 last:border-0">
                <Link href={`/${p.username}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                  {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-af-brand-soft">{(p.display_name || p.username).slice(0, 1).toUpperCase()}</span>}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/${p.username}`} className="block truncate text-sm font-bold hover:underline">{p.display_name || p.username}</Link>
                  <p className="truncate text-xs text-af-muted">@{p.username}</p>
                </div>
                <div className="shrink-0">
                  {user && p.id !== user.id && (
                    <Button
                      variant={p.followStatus === "accepted" || p.followStatus === "pending" ? "secondary" : "primary"}
                      onClick={() => void toggleFollow(p.id)}
                      disabled={followBusy}
                      className="text-xs px-2 py-1"
                    >
                      {followBusy ? "…" : p.followStatus === "accepted" ? "Following" : p.followStatus === "pending" ? "Requested" : followsViewer ? "Follow back" : "Follow"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
