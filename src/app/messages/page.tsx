"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

export default function Messages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) { setLoading(false); return; }
    supabase.from("conversation_participants").select("*", { count: "exact", head: true }).eq("user_id", user.id).then(({ count }: any) => {
      setCount(count ?? 0);
      setLoading(false);
    });
  }, [user]);

  if (!user) return <Shell><PageHeader title="Messages" /><EmptyState title="Sign in to view messages" body="Your conversations appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Messages" />
      {loading ? <div className="p-8 text-center text-sm text-af-muted">Loading…</div> :
       count === 0 ? <EmptyState title="Your conversations start here" body="Your private conversations will appear here." /> :
       <div className="p-4 text-sm text-af-muted">{count} conversation(s). Full messaging UI pending.</div>}
    </Shell>
  );
}

