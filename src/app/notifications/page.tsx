"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type N = { id: string; type: string; created_at: string; read: boolean };

export default function Notifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<N[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) { setLoading(false); return; }
    supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).then(({ data, error }: any) => {
      if (error) setError(error.message);
      else setItems((data as N[]) ?? []);
      setLoading(false);
    });
  }, [user]);

  if (!user) return <Shell><PageHeader title="Notifications" /><EmptyState title="Sign in to view notifications" body="Your notifications appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Notifications" />
      {loading ? <div className="p-8 text-center text-sm text-af-muted">Loading…</div> :
       error ? <div className="p-8 text-center text-sm text-af-danger">{error}</div> :
       items.length === 0 ? <EmptyState title="You're all caught up" body="When someone interacts with you, you'll see it here." /> :
       <div className="divide-y divide-af-border">
         {items.map((n) => (
           <div key={n.id} className="p-4 text-sm">
             <span className="font-medium">{n.type}</span>
             <span className="text-af-muted"> · {new Date(n.created_at).toLocaleString()}</span>
           </div>
         ))}
       </div>}
    </Shell>
  );
}

