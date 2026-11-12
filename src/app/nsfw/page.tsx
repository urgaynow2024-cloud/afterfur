"use client";
import { useEffect, useState, useCallback } from "react";
import { Suspense } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import { useResolvedMediaUrls } from "@/lib/media-url-state";

type Post = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  classification: string;
  media_urls?: string[] | null;
  profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

function NsfwPageInner() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const supabase = createClient();
    if (!supabase) {
      setError("Supabase not configured.");
      setLoading(false);
      return;
    }

    // Require authentication - registered users only, no ad_creator badge needed.
    if (!user) {
      setError("You must be signed in to view the NSFW page.");
      setLoading(false);
      return;
    }

    try {
      const { data: ps, error: postsError } = await supabase
        .from("posts")
        .select("*")
        .eq("classification", "NSFW")
        .or("moderation_status.is.null,moderation_status.eq.visible")
        .order("created_at", { ascending: false })
        .limit(60);

      if (postsError) throw postsError;

      const authorIds = [...new Set(((ps ?? []) as Post[]).map((p) => p.author_id).filter(Boolean))];
      let profMap = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null }>();
      if (authorIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", authorIds);
        profMap = new Map((profs ?? []).map((x: { id: string; username: string; display_name: string | null; avatar_url: string | null }) => [x.id, x]));
      }

      setPosts(((ps ?? []) as Post[]).map((p) => ({ ...p, profiles: profMap.get(p.author_id) || null })));
    } catch (err: any) {
      setError(err?.message || "Could not load NSFW posts.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Shell>
        <PageHeader title="NSFW" />
        <div className="p-8 text-center text-sm text-af-muted">Loading…</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <PageHeader title="NSFW" />
        <div className="p-8 text-center text-sm text-af-danger">{error}</div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <PageHeader title="NSFW" />
        <EmptyState title="Sign in required" body="You must be signed in to view NSFW content." action={{ label: "Sign in", href: "/signin" }} />
      </Shell>
    );
  }

  return (
    <Shell>
      <PageHeader title="NSFW" subtitle="Mature content for registered adults." />
      {posts.length === 0 ? (
        <EmptyState title="No NSFW posts yet" body="There are no NSFW posts to display." />
      ) : (
        <div className="divide-y divide-af-border/70">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </Shell>
  );
}

export default function NsfwPage() {
  return (
    <Suspense fallback={<Shell><PageHeader title="NSFW" /><div className="p-8 text-center text-sm text-af-muted">Loading…</div></Shell>}>
      <NsfwPageInner />
    </Suspense>
  );
}
