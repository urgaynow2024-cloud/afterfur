"use client";
import { useCallback, useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { publicPostUrl, publicProfileUrl } from "@/lib/follow";

type NotificationRow = { id: string; user_id: string; type: string; payload: { actor_id?: string; post_id?: string } | null; read: boolean; created_at: string };
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
    const actorId = n.payload?.actor_id;
    const actor = actorId ? profiles[actorId] : undefined;
    const name = actor?.display_name || actor?.username || "Someone";
    if (n.type === "follow") return `${name} followed you`;
    if (n.type === "like") return `${name} liked your post`;
    if (n.type === "reply") return `${name} replied to your post`;
    if (n.type === "repost") return `${name} reposted your post`;
    if (n.type === "mention") return `${name} mentioned you`;
    return `${name} interacted with you`;
  }

  return (
    <Shell>
      <PageHeader title="Notifications" subtitle={unreadCount ? `${unreadCount} unread` : "All caught up"} />
      <div role="tablist" aria-label="Notification filter" className="flex border-b border-af-border px-3">
        <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")} className={`min-h-12 flex-1 text-sm ${filter === "all" ? "border-b-2 border-af-brand font-semibold text-af-text" : "text-af-muted hover:text-af-text"}`}>All</button>
        <button type="button" role="tab" aria-selected={filter === "mentions"} onClick={() => setFilter("mentions")} className={`min-h-12 flex-1 text-sm ${filter === "mentions" ? "border-b-2 border-af-brand font-semibold text-af-text" : "text-af-muted hover:text-af-text"}`}>Mentions</button>
      </div>
      {loading ? <div className="p-8 text-center text-sm text-af-muted">Loading…</div> :
       error ? <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-danger">{error}<button type="button" onClick={() => { void load(); }} className="ml-3 underline">Retry</button></div> :
       visible.length === 0 ? <EmptyState title="You're all caught up" body="When someone interacts with you, you'll see it here." /> :
       <div>
         <div className="px-4 py-2 text-right">
           {actionError && <p role="alert" className="mb-2 text-left text-sm text-af-danger">{actionError}</p>}
           <button type="button" onClick={markAllRead} disabled={Boolean(marking) || unreadCount === 0} className="min-h-9 rounded-md px-2 text-sm font-medium text-af-brand-soft hover:bg-af-surface-2 disabled:opacity-50">{marking === "all" ? "Saving…" : "Mark all read"}</button>
         </div>
         <div className="divide-y divide-af-border">
           {visible.map((n) => {
             const actorId = n.payload?.actor_id;
             const postId = n.payload?.post_id;
             const actor = actorId ? profiles[actorId] : undefined;
             const post = postId ? posts[postId] : undefined;
             const href = postId ? actor ? publicPostUrl(actor.username, postId) : `/posts/${encodeURIComponent(postId)}` : actor ? publicProfileUrl(actor.username) : null;
             return (
               <div key={n.id} className={`flex gap-3 border-b border-af-border px-4 py-4 ${n.read ? "" : "bg-af-surface/60"}`}>
                 <Link href={actor ? `/${encodeURIComponent(actor.username)}` : "/profile"} aria-label={actor ? `View ${actor.display_name || actor.username}'s profile` : "View profile"} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                   {actor?.avatar_url ? <img src={actor.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
                 </Link>
                 <div className="min-w-0 flex-1">
                   <p className="text-sm text-af-text">{href ? <Link href={href} onClick={() => { if (!n.read) void markRead(n.id); }} className="hover:underline">{describe(n)}</Link> : describe(n)}</p>
                   {post?.content && <p className="mt-1 truncate text-sm text-af-muted">{href ? <Link href={href} onClick={() => { if (!n.read) void markRead(n.id); }} className="hover:underline">{post.content}</Link> : post.content}</p>}
                   <p className="mt-1 text-xs text-af-muted"><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time></p>
                 </div>
                 {!n.read && <button type="button" disabled={Boolean(marking)} onClick={() => markRead(n.id)} className="min-h-9 shrink-0 rounded-md px-2 text-xs font-medium text-af-brand-soft hover:bg-af-surface-2 disabled:opacity-50">{marking === n.id ? "Saving…" : "Mark read"}</button>}
               </div>
             );
           })}
         </div>
       </div>}
    </Shell>
  );
}
