"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type AuditEntry = {
  id: string;
  actorId: string;
  actorUsername: string | null;
  actorDisplayName: string | null;
  targetType: string;
  targetId: string;
  action: string;
  details: Record<string, unknown> | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string | null;
};

export default function AuditLogsPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [actorFilter, setActorFilter] = useState<string | null>(null);
  const [targetTypeFilter, setTargetTypeFilter] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchEntries = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setLoading(false); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (actorFilter) params.set("actor_id", actorFilter);
      if (targetTypeFilter) params.set("target_type", targetTypeFilter);
      if (actionFilter) params.set("action", actionFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/moderation/audit-log?${params}`, { headers });
      if (!res.ok) { setError("Failed to load audit log."); setLoading(false); return; }
      const data = await res.json();
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Failed to load audit log."); }
    setLoading(false);
  }, [page, pageSize, actorFilter, targetTypeFilter, actionFilter, search]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Moderation Audit Log" />
        <div className="p-8 text-center text-af-muted">Loading audit log…</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <PageHeader title="Moderation Audit Log" />
        <div className="p-8 text-center text-af-danger">{error}</div>
      </Shell>
    );
  }

  const filtered = entries.filter((e) => {
    if (actorFilter && e.actorId !== actorFilter) return false;
    if (targetTypeFilter && e.targetType !== targetTypeFilter) return false;
    if (actionFilter && !e.action.toLowerCase().includes(actionFilter.toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.action.toLowerCase().includes(q) ||
             (e.actorUsername?.toLowerCase().includes(q) ?? false);
    }
    return true;
  });

  return (
    <Shell>
      <PageHeader title="Moderation Audit Log" subtitle="Immutable record of all moderation actions." />

      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            placeholder="Search actions or actors…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm w-64"
          />
          <select
            value={targetTypeFilter ?? ""}
            onChange={(e) => { setTargetTypeFilter(e.target.value || null); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm"
          >
            <option value="">All target types</option>
            <option value="post">Post</option>
            <option value="reply">Reply</option>
            <option value="user">User</option>
            <option value="report">Report</option>
            <option value="appeal">Appeal</option>
            <option value="staff_role">Staff role</option>
          </select>
        </div>
        <div className="text-xs text-af-muted">
          Showing {filtered.length} of {total} entr{total === 1 ? "y" : "ies"}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState title="No audit entries" body="There are no moderation audit entries matching your filters." />
        ) : (
          <div className="space-y-2">
            {filtered.map((e) => (
              <div key={e.id} className="rounded-xl border border-af-border bg-af-surface p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-af-text truncate">{e.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                      <span className="text-xs text-af-muted">{e.targetType}</span>
                    </div>
                    <p className="text-xs text-af-muted">
                      Actor: {(e.actorDisplayName ?? e.actorUsername ?? "Unknown")} (@{(e.actorUsername ?? "unknown")})
                    </p>
                    <p className="text-xs text-af-muted">
                      Target: {e.targetId} • {new Date(e.createdAt!).toLocaleString()}
                    </p>
                    {e.details && Object.keys(e.details).length > 0 && (
                      <div className="mt-2 text-xs text-af-muted">
                        {Object.entries(e.details).map(([k, v]) => (
                          <span key={k} className="mr-2">{k}: {String(v)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-af-muted truncate max-w-xs">{new Date(e.createdAt!).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-af-border bg-af-surface/50 p-4">
        <p className="text-xs text-af-muted">
          Audit log entries are append-only and cannot be edited or deleted by
          moderators. Only system administrators can manage this log.
        </p>
      </div>
    </Shell>
  );
}
