"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type Appeal = {
  id: string;
  userId: string;
  userUsername: string | null;
  userDisplayName: string | null;
  reportId: string | null;
  enforcementType: string | null;
  enforcementId: string | null;
  reason: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  responseMessage: string | null;
  createdAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "text-af-warning-soft",
  accepted: "text-af-brand-soft",
  rejected: "text-af-danger-soft",
};

export default function AppealsPage() {
  const { user } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmAppeal, setConfirmAppeal] = useState<string | null>(null);
  const [appealStatus, setAppealStatus] = useState<"accepted" | "rejected" | null>(null);
  const [appealResponse, setAppealResponse] = useState("");
  const requestId = useRef(0);

  const fetchAppeals = useCallback(async () => {
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
      if (search) params.set("search", search);

      const res = await fetch(`/api/moderation/appeals?${params}`, { headers });
      if (!res.ok) { setError("Failed to load appeals."); setLoading(false); return; }
      const data = await res.json();
      setAppeals(data.appeals ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Failed to load appeals."); }
    setLoading(false);
  }, [page, pageSize, statusFilter, search]);

  useEffect(() => { void fetchAppeals(); }, [fetchAppeals]);

  const openAction = (appealId: string) => {
    setConfirmAppeal(appealId);
    setAppealStatus(null);
    setAppealResponse("");
  };

  const submitAction = async () => {
    if (!confirmAppeal || !appealStatus) return;
    setActioning(confirmAppeal);
    const supabase = createClient();
    if (!supabase) { setActioning(null); return; }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setActioning(null); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/moderation/appeals", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ appealId: confirmAppeal, status: appealStatus, responseMessage: appealResponse.trim() || undefined }),
      });

      if (res.ok) {
        setConfirmAppeal(null);
        setAppealStatus(null);
        setAppealResponse("");
        void fetchAppeals();
      } else {
        setError("Failed to process appeal.");
      }
    } catch { setError("Failed to process appeal."); }
    setActioning(null);
  };

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Appeals" />
        <div className="p-8 text-center text-af-muted">Loading appeals...</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <PageHeader title="Appeals" />
        <div className="p-8 text-center text-af-danger">{error}</div>
      </Shell>
    );
  }

  const filtered = appeals.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.userUsername?.toLowerCase().includes(q) ?? false) ||
             (a.reason.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <Shell>
      <PageHeader title="Appeals" subtitle="Review user appeals against enforcement decisions." />

      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={statusFilter ?? ""}
            onChange={(e) => { setStatusFilter(e.target.value || null); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
          <input
            type="text"
            placeholder="Search appeals..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm w-64"
          />
        </div>
        <div className="text-xs text-af-muted">
          Showing {filtered.length} of {total} appeal{total !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState title="No appeals" body="There are no appeals matching your filters." />
        ) : (
          <div className="space-y-1">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-xl border border-af-border bg-af-surface p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${STATUS_COLOR[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                      <span className="text-xs text-af-muted">{a.enforcementType ?? "content_removal"}</span>
                    </div>
                    <p className="text-sm text-af-text">{a.reason}</p>
                    <p className="mt-2 text-xs text-af-muted">
                      Submitted by {a.userDisplayName ?? a.userUsername ?? "Unknown"} (@{a.userUsername ?? "unknown"})
                      · {new Date(a.createdAt!).toLocaleDateString()}
                    </p>
                    {a.responseMessage && (
                      <p className="mt-1 text-xs text-af-brand-soft">{a.responseMessage}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {a.status === "pending" && (
                      <button
                        onClick={() => openAction(a.id)}
                        className="min-h-9 rounded-md border border-af-border bg-af-surface px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2"
                      >
                        Review
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action dialog */}
        {confirmAppeal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
            onClick={() => setConfirmAppeal(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-af-text">Review appeal</h2>
              <p className="mt-2 text-sm text-af-text-2">Accept or reject the appeal and provide a response.</p>

              <div className="mt-4 space-y-2">
                <label className="text-xs font-medium text-af-muted block">Decision</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAppealStatus("accepted")}
                    className={`flex-1 min-h-9 rounded-md px-3 text-xs font-medium ${appealStatus === "accepted" ? "bg-af-brand text-white" : "border border-af-border text-af-text-2"}`}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => setAppealStatus("rejected")}
                    className={`flex-1 min-h-9 rounded-md px-3 text-xs font-medium ${appealStatus === "rejected" ? "bg-af-danger text-white" : "border border-af-border text-af-text-2"}`}
                  >
                    Reject
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-af-muted block">Response message (optional)</label>
                <textarea
                  value={appealResponse}
                  onChange={(e) => setAppealResponse(e.target.value)}
                  rows={3}
                  className="af-field w-full px-3 py-2 text-sm resize-y"
                  placeholder="Explain the decision to the user..."
                />
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  onClick={() => setConfirmAppeal(null)}
                  className="af-action-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitAction}
                  disabled={!appealStatus || actioning === confirmAppeal}
                  className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actioning === confirmAppeal ? "Processing..." : "Confirm decision"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

