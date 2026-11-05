"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { createClient } from "@/lib/supabase/client";

type ContentItem = {
  id: string;
  author_id: string;
  content: string;
  classification?: string | null;
  moderation_status?: string | null;
  created_at: string | null;
  media_urls?: string[] | null;
  post_id?: string | null;
  parent_reply_id?: string | null;
  author?: { id: string; username: string; display_name: string | null; avatar_url: string | null; is_private: boolean | null } | null;
};

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [type, setType] = useState<"post" | "reply">("post");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"remove" | "restore" | null>(null);
  const [actionReason, setActionReason] = useState("");

  const fetchContent = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setLoading(false); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/moderation/content?type=${type}&page=1&pageSize=50`, { headers });
      if (!res.ok) { setError("Failed to load content."); setLoading(false); return; }
      const data = await res.json();
      setItems(data.items ?? []);
    } catch { setError("Failed to load content."); }
    setLoading(false);
  }, [type]);

  useEffect(() => { void fetchContent(); }, [fetchContent]);

  const openAction = (a: "remove" | "restore", id: string) => { setConfirmAction(id); setActionType(a); setActionReason(""); };
  const submitAction = async () => {
    if (!confirmAction || !actionType || !actionReason.trim()) return;
    setActioning(confirmAction);
    const supabase = createClient();
    if (!supabase) { setActioning(null); return; }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/moderation/content", { method: "POST", headers, body: JSON.stringify({ targetType: type, targetId: confirmAction, action: actionType, reason: actionReason.trim() }) });
      if (res.ok) { setConfirmAction(null); setActionType(null); setActionReason(""); void fetchContent(); }
      else { const d = await res.json().catch(() => ({})); setError(d.hint || d.error || "Failed to process content action."); }
    } catch { setError("Failed to process content action."); }
    setActioning(null);
  };

  return (
    <Shell>
      <PageHeader title="Content Moderation" subtitle="Review and remove or restore posts and replies. Actions are audited server-side." />
      <div className="mb-3 flex items-center gap-2">
        <button onClick={() => setType("post")} className={`min-h-9 rounded-md px-3 text-sm font-medium ${type === "post" ? "bg-af-brand text-white" : "border border-af-border text-af-text-2"}`}>Posts</button>
        <button onClick={() => setType("reply")} className={`min-h-9 rounded-md px-3 text-sm font-medium ${type === "reply" ? "bg-af-brand text-white" : "border border-af-border text-af-text-2"}`}>Replies</button>
        <span className="ml-auto text-xs text-af-muted">Showing {items.length} {type}{items.length !== 1 ? "s" : ""}</span>
      </div>

      {loading ? <div className="p-8 text-center text-af-muted">Loading content...</div> : error ? <div className="rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{error}</div> : items.length === 0 ? (
        <EmptyState title="No content" body="There is no content to moderate." />
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const removed = item.moderation_status === "removed";
            return (
              <div key={item.id} className="rounded-xl border border-af-border bg-af-surface p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="truncate text-xs font-medium text-af-text">{item.author?.display_name || item.author?.username || "Unknown"}</span>
                      <span className="text-xs text-af-muted">@{item.author?.username}</span>
                      {item.author?.is_private && <span className="text-xs text-af-brand-soft">Private</span>}
                      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${removed ? "bg-af-danger/10 text-af-danger-soft" : "bg-af-surface-2 text-af-muted"}`}>{removed ? "Removed" : (item.classification || "Visible")}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-af-text">{item.content}</p>
                    <p className="mt-2 text-xs text-af-muted">{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {removed ? (
                      <button onClick={() => openAction("restore", item.id)} className="min-h-9 rounded-md border border-af-brand bg-af-surface px-3 text-xs font-medium text-af-brand hover:bg-af-brand/10">Restore</button>
                    ) : (
                      <button onClick={() => openAction("remove", item.id)} className="min-h-9 rounded-md border border-af-border bg-af-surface px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Remove</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6" onClick={() => setConfirmAction(null)} role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-af-text">{actionType === "remove" ? "Remove content" : "Restore content"}</h2>
            <p className="mt-2 text-sm text-af-text-2">Provide a reason for this moderation action. It will be recorded in the audit log.</p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-af-muted">Reason</label>
              <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} rows={3} className="af-field mt-1 w-full resize-y px-3 py-2 text-sm" placeholder="Explain the moderation decision..." />
            </div>
            <div className="mt-5 flex items-center justify-between gap-2">
              <button onClick={() => setConfirmAction(null)} className="af-action-secondary">Cancel</button>
              <button onClick={submitAction} disabled={!actionReason.trim() || actioning === confirmAction} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">
                {actioning === confirmAction ? "Processing..." : actionType === "remove" ? "Remove content" : "Restore content"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
