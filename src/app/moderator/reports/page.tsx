"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type Report = {
  id: string;
  reporter_username: string | null;
  reporter_display_name: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  reviewed: "Reviewed",
  dismissed: "Dismissed",
  actioned: "Actioned",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-af-warning-soft",
  reviewed: "text-af-brand-soft",
  dismissed: "text-af-muted",
  actioned: "text-af-brand",
};

const ICON_MAP: Record<string, string> = {
  "message-circle": "M18 8A6 6 0 016 8a6 6 0 006 6m0 0a6 6 0 006-6 6 6 0 01-6-6",
  file: "M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z",
  user: "M22 10c0-3-1.346-5-3-5s-3 2-3 5m0 5c0 3 1.346 5 3 5s3-2 3-5",
};

export default function ReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [targetTypeFilter, setTargetTypeFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);
  const [confirmResolve, setConfirmResolve] = useState<string | null>(null);
  const [resolveStatus, setResolveStatus] = useState<"reviewed" | "dismissed" | "actioned" | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [assigning, setAssigning] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchReports = useCallback(async () => {
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
      if (statusFilter) params.set("status", statusFilter);
      if (targetTypeFilter) params.set("target_type", targetTypeFilter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/moderation/reports?${params}`, { headers });
      if (!res.ok) { setError("Failed to load reports."); setLoading(false); return; }
      const data = await res.json();
      setReports(data.reports ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Failed to load reports."); }
    setLoading(false);
  }, [page, pageSize, statusFilter, targetTypeFilter, search]);

  useEffect(() => { void fetchReports(); }, [fetchReports]);

  const handleResolve = (reportId: string) => {
    setConfirmResolve(reportId);
    setResolveNotes("");
    setResolveStatus(null);
  };

  const submitResolve = async () => {
    if (!confirmResolve || !resolveStatus) return;
    setResolving(confirmResolve);
    const supabase = createClient();
    if (!supabase) { setResolving(null); return; }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setResolving(null); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/moderation/reports", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ reportId: confirmResolve, status: resolveStatus, moderatorNotes: resolveNotes.trim() || undefined }),
      });

      if (res.ok) {
        setConfirmResolve(null);
        setResolveNotes("");
        setResolveStatus(null);
        void fetchReports();
      } else {
        setError("Failed to resolve report.");
      }
    } catch { setError("Failed to resolve report."); }
    setResolving(null);
  };

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Reports Management" />
        <div className="p-8 text-center text-af-muted">Loading reports...</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <PageHeader title="Reports Management" />
        <div className="p-8 text-center text-af-danger">{error}</div>
      </Shell>
    );
  }

  const filtered = reports.filter((r) => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (targetTypeFilter && r.target_type !== targetTypeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.reporter_username?.toLowerCase().includes(q) ?? false) ||
             (r.reason.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <Shell>
      <PageHeader title="Reports Management" subtitle="Review, assign and resolve user-submitted reports." />

      <div className="flex flex-col lg:flex-row gap-4 items-end">
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={statusFilter ?? ""}
            onChange={(e) => { setStatusFilter(e.target.value || null); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="dismissed">Dismissed</option>
            <option value="actioned">Actioned</option>
          </select>
          <select
            value={targetTypeFilter ?? ""}
            onChange={(e) => { setTargetTypeFilter(e.target.value || null); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm"
          >
            <option value="">All target types</option>
            <option value="post">Post</option>
            <option value="reply">Reply</option>
            <option value="user">Account</option>
          </select>
          <input
            type="text"
            placeholder="Search reports..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm w-64"
          />
        </div>

        <div className="text-xs text-af-muted">
          Showing {filtered.length} of {total} report{total !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState title="No reports" body="There are no reports matching your filters." />
        ) : (
          <div className="space-y-1">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-xl border border-af-border bg-af-surface p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${STATUS_COLOR[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      <span className="text-xs text-af-muted">{r.target_type}</span>
                    </div>
                    <p className="text-sm text-af-text">{r.reason}</p>
                    {r.description && (
                      <p className="mt-1 text-xs text-af-text-2 line-clamp-2">{r.description}</p>
                    )}
                    <p className="mt-2 text-xs text-af-muted">
                      Reported by {r.reporter_display_name ?? r.reporter_username ?? "Unknown"} (@{r.reporter_username ?? "unknown"})
                      · {new Date(r.created_at!).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleResolve(r.id)}
                      disabled={resolving === r.id}
                      className={`min-h-9 rounded-md px-3 text-xs font-medium ${
                        resolving === r.id
                          ? "bg-af-surface opacity-50 cursor-not-allowed"
                          : "bg-af-brand text-white hover:bg-af-brand-hover"
                      }`}
                    >
                      {resolving === r.id ? "..." : "Resolve"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve dialog */}
      {confirmResolve && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
          onClick={() => setConfirmResolve(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-af-text">Resolve report</h2>
            <p className="mt-2 text-sm text-af-text-2">Select an outcome and add an optional moderator note.</p>

            <div className="mt-4 space-y-2">
              <label className="text-xs font-medium text-af-muted block">Outcome</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setResolveStatus("reviewed")}
                  className={`flex-1 min-h-9 rounded-md px-3 text-xs font-medium ${resolveStatus === "reviewed" ? "bg-af-brand text-white" : "border border-af-border text-af-text-2"}`}
                >
                  Reviewed
                </button>
                <button
                  onClick={() => setResolveStatus("dismissed")}
                  className={`flex-1 min-h-9 rounded-md px-3 text-xs font-medium ${resolveStatus === "dismissed" ? "bg-af-surface text-af-text" : "border border-af-border text-af-text-2"}`}
                >
                  Dismissed
                </button>
                <button
                  onClick={() => setResolveStatus("actioned")}
                  className={`flex-1 min-h-9 rounded-md px-3 text-xs font-medium ${resolveStatus === "actioned" ? "bg-af-brand text-white" : "border border-af-border text-af-text-2"}`}
                >
                  Actioned
                </button>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium text-af-muted block">Moderator note (optional)</label>
              <textarea
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                rows={3}
                className="af-field w-full px-3 py-2 text-sm resize-y"
                placeholder="Internal note explaining the decision..."
              />
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
              <button
                onClick={() => setConfirmResolve(null)}
                className="af-action-secondary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitResolve}
                disabled={!resolveStatus || resolving === confirmResolve}
                className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resolving === confirmResolve ? "Resolving..." : "Confirm resolve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

