"use client";

import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { loadMyMembershipStatus } from "@/lib/pawpass";
import Link from "next/link";

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPawPass, setIsPawPass] = useState(false);
  const [stats, setStats] = useState({ posts: 0, replies: 0, likesReceived: 0, bookmarksReceived: 0 });

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) { setLoading(false); return; }
    let cancelled = false;
    void (async () => {
      const { status } = await loadMyMembershipStatus(supabase);
      const active = !!status && (status.status === "active" || status.status === "cancel_at_period_end") && !!status.currentPeriodEnd && new Date(status.currentPeriodEnd).getTime() > Date.now();
      if (cancelled) return;
      setIsPawPass(active);
      if (!active) { setLoading(false); return; }
      try {
        const { count: posts } = await supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", user.id);
        const { count: replies } = await supabase.from("replies").select("id", { count: "exact", head: true }).eq("author_id", user.id);
        const { data: userPosts } = await supabase.from("posts").select("id").eq("author_id", user.id).limit(1000);
        const postIds = (userPosts ?? []).map((p: { id: string }) => p.id);
        let likesReceived = 0;
        let bookmarksReceived = 0;
        if (postIds.length) {
          const { count: likes } = await supabase.from("likes").select("user_id", { count: "exact", head: true }).in("post_id", postIds);
          const { count: bookmarks } = await supabase.from("bookmarks").select("user_id", { count: "exact", head: true }).in("post_id", postIds);
          likesReceived = likes ?? 0;
          bookmarksReceived = bookmarks ?? 0;
        }
        if (cancelled) return;
        setStats({ posts: posts ?? 0, replies: replies ?? 0, likesReceived, bookmarksReceived });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!user) {
    return (
      <Shell>
        <PageHeader title="Analytics" subtitle="Creator and post analytics." />
        <EmptyState title="Sign in required" body="Sign in to view analytics." action={{ label: "Sign in", href: "/signin" }} />
      </Shell>
    );
  }

  if (!isPawPass) {
    return (
      <Shell>
        <PageHeader title="Analytics" subtitle="Creator and post analytics." />
        <EmptyState title="PawPass required" body="Analytics are available to active PawPass members." action={{ label: "View PawPass", href: "/pawpass" }} />
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHeader title="Analytics" subtitle="Real engagement data for your account." />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        {loading ? (
          <p className="text-sm text-af-muted">Loading analytics…</p>
        ) : error ? (
          <p role="alert" className="text-sm text-af-danger">{error}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-af-border bg-af-surface p-5"><p className="text-xs text-af-muted">Posts</p><p className="mt-1 text-2xl font-bold text-af-text">{stats.posts}</p></div>
            <div className="rounded-2xl border border-af-border bg-af-surface p-5"><p className="text-xs text-af-muted">Replies</p><p className="mt-1 text-2xl font-bold text-af-text">{stats.replies}</p></div>
            <div className="rounded-2xl border border-af-border bg-af-surface p-5"><p className="text-xs text-af-muted">Likes received</p><p className="mt-1 text-2xl font-bold text-af-text">{stats.likesReceived}</p></div>
            <div className="rounded-2xl border border-af-border bg-af-surface p-5"><p className="text-xs text-af-muted">Bookmarks received</p><p className="mt-1 text-2xl font-bold text-af-text">{stats.bookmarksReceived}</p></div>
          </div>
        )}
        <Link href="/pawpass" className="af-action-secondary">Back to PawPass</Link>
      </div>
    </Shell>
  );
}