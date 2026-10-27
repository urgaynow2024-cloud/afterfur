"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type NotificationRow = { id: string; user_id: string; type: string; payload: any; read: boolean; created_at: string };

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [posts, setPosts] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "mentions">("all");

  async function load() {
    const supabase = createClient();
    if (!supabase || !user) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const { data, error: e } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (e) { setError(e.message); setLoading(false); return; }
    const rows = (data ?? []) as NotificationRow[];
    setItems(rows);
    const actorIds = [...new Set(rows.map((r) => r.payload?.actor_id).filter(Boolean))];
    const postIds = [...new Set(rows.map((r) => r.payload?.post_id).filter(Boolean))];
    if (actorIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", actorIds);
      const map: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
    if (postIds.length) {
      const { data: ps } = await supabase.from("posts").select("id,content").in("id", postIds);
      const map: Record<string, any> = {};
      (ps ?? []).forEach((p: any) => { map[p.id] = p; });
      setPosts(map);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  async function markRead(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }

  async function markAllRead() {
    const supabase = createClient();
    if (!supabase || !user) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  if (!user) return <Shell><PageHeader title="Notifications" /><EmptyState title="Sign in to view notifications" body="Your notifications appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  const visible = filter === "mentions" ? items.filter((n) => n.type === "mention") : items;
  const unreadCount = items.filter((n) => !n.read).length;

  function describe(n: any) {
    const actor = profiles[n.payload?.actor_id];
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
      <div className="flex border-b border-af-border">
        <button onClick={() => setFilter("all")} className={`flex-1 py-3 text-sm ${filter === "all" ? "font-bold text-af-text" : "text-af-muted"}`}>All</button>
        <button onClick={() => setFilter("mentions")} className={`flex-1 py-3 text-sm ${filter === "mentions" ? "font-bold text-af-text" : "text-af-muted"}`}>Mentions</button>
      </div>
      {loading ? <div className="p-8 text-center text-sm text-af-muted">Loading…</div> :
       error ? <div className="p-8 text-center text-sm text-af-danger">{error}</div> :
       visible.length === 0 ? <EmptyState title="You're all caught up" body="When someone interacts with you, you'll see it here." /> :
       <div>
         <div className="px-4 py-2 text-right">
           <button onClick={markAllRead} className="text-sm text-af-accent hover:underline">Mark all read</button>
         </div>
         <div className="divide-y divide-af-border">
           {visible.map((n: any) => {
             const actor = profiles[n.payload?.actor_id];
             const post = posts[n.payload?.post_id];
             return (
               <div key={n.id} className={`flex gap-3 p-4 ${n.read ? "" : "bg-af-surface/40"}`}>
                 <Link href={actor ? `/${actor.username}` : "#"} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                   {actor?.avatar_url ? <img src={actor.avatar_url} alt="" className="h-full w-full object-cover" /> : null}
                 </Link>
                 <div className="min-w-0 flex-1">
                   <p className="text-sm text-af-text">{describe(n)}</p>
                   {post?.content && <p className="mt-1 truncate text-sm text-af-muted">{post.content}</p>}
                   <p className="mt-1 text-xs text-af-muted">{new Date(n.created_at).toLocaleString()}</p>
                 </div>
                 {!n.read && <button onClick={() => markRead(n.id)} className="text-xs text-af-accent hover:underline">Mark read</button>}
               </div>
             );
           })}
         </div>
       </div>}
    </Shell>
  );
}
