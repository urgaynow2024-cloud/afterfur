"use client";
import { useCallback, useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { publicPostUrl, publicProfileUrl } from "@/lib/follow";

type NotificationRow = { id: string; user_id: string; type: string; payload: { actor_id?: string; post_id?: string; conversation_id?: string; message?: string; system?: boolean; badge_id?: string } | null; read: boolean; created_at: string };
type ActorProfile = { id: string; username: string; display_name: string | null; avatar_url: string | null };
type NotificationPost = { id: string; content: string };

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ActorProfile>>({});
  const [posts, setPosts] = useState<Record<string, NotificationPost>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [marking, setMarking] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mentions">("all");

  const load = useCallback(async () => {
    const supabase = createClient();
    if (!supabase || !user) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data, error: e } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (e) { setError(e.message); setLoading(false); return; }
    const rows = (data ?? []) as NotificationRow[];
    setItems(rows);
    const actorIds = [...new Set(rows.map((r) => r.payload?.actor_id).filter((value): value is string => Boolean(value)))];
    const postIds = [...new Set(rows.map((r) => r.payload?.post_id).filter((value): value is string => Boolean(value)))];
    if (actorIds.length) {
      const { data: profs, error: profilesError } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", actorIds);
      if (profilesError) { setError(profilesError.message); setLoading(false); return; }
      const map: Record<string, ActorProfile> = {};
      ((profs ?? []) as ActorProfile[]).forEach((profile) => { map[profile.id] = profile; });
      setProfiles(map);
    }
    if (postIds.length) {
      const { data: ps, error: postsError } = await supabase.from("posts").select("id,content").in("id", postIds);
      if (postsError) { setError(postsError.message); setLoading(false); return; }
      const map: Record<string, NotificationPost> = {};
      ((ps ?? []) as NotificationPost[]).forEach((post) => { map[post.id] = post; });
      setPosts(map);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const n = payload.new as NotificationRow;
        setItems((prev) => [n, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload: any) => {
        const n = payload.new as NotificationRow;
        setItems((prev) => prev.map((x) => x.id === n.id ? n : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  async function markRead(id: string) {
    const supabase = createClient();
    if (!supabase || marking) return;
    setMarking(id); setActionError("");
    const { error: updateError } = await supabase.rpc("mark_notification_read", { p_notification_id: id });
    if (updateError) { setActionError(updateError.message); setMarking(null); return; }
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setMarking(null);
  }

  async function markAllRead() {
    const supabase = createClient();
    if (!supabase || !user || marking) return;
    setMarking("all"); setActionError("");
    const { error: updateError } = await supabase.rpc("mark_all_notifications_read");
    if (updateError) { setActionError(updateError.message); setMarking(null); return; }
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setMarking(null);
  }

  if (!user) return <Shell><PageHeader title="Notifications" /><EmptyState title="Sign in to view notifications" body="Your notifications appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  const visible = filter === "mentions" ? items.filter((n) => n.type === "mention") : items;
  const unreadCount = items.filter((n) => !n.read).length;

  function describe(n: NotificationRow) {
    if (n.type === "badge") {
      const msg = n.payload?.message;
      if (typeof msg === "string") return msg;
      return "You've earned a new badge!";
    }
    const actorId = n.payload?.actor_id;
    const actor = actorId ? profiles[actorId] : undefined;
    const name = actor?.display_name || actor?.username || "Someone";
    if (n.type === "follow") return `${name} followed you`;
    if (n.type === "like") return `${name} liked your post`;
    if (n.type === "reply") return `${name} replied to your post`;
    if (n.type === "repost") return `${name} reposted your post`;
    if (n.type === "mention") return `${name} mentioned you`;
    if (n.type === "message") return `${name} sent you a message`;
    if (n.type === "appeal_decision") {
      const p = (n.payload ?? {}) as Record<string, unknown>;
      const status = p.status;
      const rm = typeof p.response_message === "string" ? p.response_message.trim() : "";
      const msg = rm ? ` ${rm}` : "";
      if (status === "accepted") return `Your appeal was accepted.${msg}`;
      if (status === "rejected") return `Your appeal was rejected.${msg}`;
      return `Your appeal was reviewed.${msg}`;
    }
    return `${name} interacted with you`;
  }

  return (
    <Shell>
      <PageHeader title="Notifications" subtitle={unreadCount ? `${unreadCount} unread` : "All caught up"} />
      <div className="border-b border-af-border bg-af-surface/40 px-3 py-2 sm:px-6">
        <div role="tablist" aria-label="Notification filter" className="flex overflow-hidden rounded-xl border border-af-border bg-af-bg/60">
          <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")} className={`min-h-11 flex-1 text-sm font-medium transition-colors ${filter === "all" ? "bg-af-brand/15 text-af-text" : "text-af-muted hover:text-af-text"}`}>All</button>
          <button type="button" role="tab" aria-selected={filter === "mentions"} onClick={() => setFilter("mentions")} className={`min-h-11 flex-1 text-sm font-medium transition-colors ${filter === "mentions" ? "bg-af-brand/15 text-af-text" : "text-af-muted hover:text-af-text"}`}>Mentions</button>
        </div>
      </div>
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center px-6 py-12 text-sm text-af-muted">Loading…</div>
      ) : error ? (
        <div role="alert" className="m-4 rounded-2xl border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger sm:m-6">
          {error}
          <button type="button" onClick={() => { void load(); }} className="ml-3 font-semibold underline underline-offset-2">Retry</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="px-4 py-6 sm:px-6">
          <EmptyState title="You're all caught up" body="When someone interacts with you, you'll see it here." />
        </div>
      ) : (
        <div className="pb-6">
          <div className="flex items-center justify-between gap-3 border-b border-af-border px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-af-muted">{unreadCount ? `${unreadCount} unread` : "All read"}</p>
            </div>
            <div className="flex items-center gap-2">
              {actionError && <p role="alert" className="text-sm text-af-danger">{actionError}</p>}
              <button type="button" onClick={markAllRead} disabled={Boolean(marking) || unreadCount === 0} className="min-h-9 rounded-xl px-3 text-sm font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2 disabled:opacity-50">{marking === "all" ? "Saving…" : "Mark all read"}</button>
            </div>
          </div>
          <div className="divide-y divide-af-border">
            {visible.map((n) => {
              const actorId = n.payload?.actor_id;
              const postId = n.payload?.post_id;
              const conversationId = n.payload?.conversation_id;
              const actor = actorId ? profiles[actorId] : undefined;
              const post = postId ? posts[postId] : undefined;
              const href = postId ? actor ? publicPostUrl(actor.username, postId) : `/posts/${encodeURIComponent(postId)}` : conversationId ? `/messages` : actor ? publicProfileUrl(actor.username) : null;
              return (
                <div key={n.id} className={`flex gap-3 px-4 py-4 transition-colors sm:px-6 ${n.read ? "bg-transparent" : "bg-af-brand/8"}`}>
                  <Link href={actor ? `/${encodeURIComponent(actor.username)}` : "/profile"} aria-label={actor ? `View ${actor.display_name || actor.username}'s profile` : "View profile"} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                    {actor?.avatar_url ? <img src={actor.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-af-brand-soft">{(actor?.display_name || actor?.username || "?").slice(0, 1).toUpperCase()}</span>}
                    {!n.read && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-af-bg bg-af-brand" aria-hidden="true" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-af-text">{href ? <Link href={href} onClick={() => { if (!n.read) void markRead(n.id); }} className="hover:underline">{describe(n)}</Link> : describe(n)}</p>
                    {post?.content && <p className="mt-1 truncate text-sm text-af-muted">{href ? <Link href={href} onClick={() => { if (!n.read) void markRead(n.id); }} className="hover:underline">{post.content}</Link> : post.content}</p>}
                    <p className="mt-1.5 text-xs text-af-muted"><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time></p>
                  </div>
                  {!n.read && <button type="button" disabled={Boolean(marking)} onClick={() => markRead(n.id)} className="min-h-9 shrink-0 self-start rounded-xl px-3 text-xs font-medium text-af-brand-soft transition-colors hover:bg-af-surface-2 disabled:opacity-50">{marking === n.id ? "Saving…" : "Mark read"}</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
