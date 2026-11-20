"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, Shell, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type Req = {
  id: string;
  user_id: string;
  status: string;
  requested_at: string | null;
  reviewed_at: string | null;
  reviewer_id: string | null;
  review_note: string | null;
  evidence: any | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  age_verified: boolean | null;
  age_assurance_approved: boolean | null;
};
type Toast = { kind: "success" | "error"; message: string } | null;

async function authHeaders(json = false): Promise<Record<string, string>> {
  const supabase = createClient();
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (!supabase) return headers;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers["Authorization"] = "Bearer " + token;
  return headers;
}

export default function AgeVerificationAdminPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Req[]>([]);
  const [assuranceRequests, setAssuranceRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 4500);
  };

  const fetchRequests = async () => {
    try {
      const [vr, ar] = await Promise.all([
        fetch("/api/age-verification?status=pending", { headers: await authHeaders(), cache: "no-store" }),
        fetch("/api/age-assurance?status=pending", { headers: await authHeaders(), cache: "no-store" }),
      ]);
      const vdata = await vr.json().catch(() => ({}));
      const adata = await ar.json().catch(() => ({}));
      if (vr.status === 401 || vr.status === 403 || ar.status === 401 || ar.status === 403) {
        setError("You do not have permission to review age-verification requests.");
        setRequests([]);
        setAssuranceRequests([]);
        return;
      }
      setRequests(Array.isArray(vdata.requests) ? vdata.requests : []);
      setAssuranceRequests(Array.isArray(adata.requests) ? adata.requests : []);
    } catch {
      setError("Failed to load requests.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await fetchRequests();
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const decideVerification = async (id: string, decision: "approved" | "rejected") => {
    setActing(id);
    setError("");
    try {
      const res = await fetch("/api/age-verification/" + id, {
        method: "PATCH",
        headers: await authHeaders(true),
        body: JSON.stringify({ decision, reviewNote: note[id] || null })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("success", decision === "approved" ? "Age verification approved." : "Age verification rejected.");
        await fetchRequests();
      } else {
        setError(data.error || "Failed to decide request.");
      }
    } catch {
      setError("Failed to decide request.");
    } finally {
      setActing(null);
    }
  };

  const decideAssurance = async (id: string, decision: "approved" | "rejected") => {
    setActing(id);
    setError("");
    try {
      const res = await fetch("/api/age-assurance/" + id, {
        method: "PATCH",
        headers: await authHeaders(true),
        body: JSON.stringify({ decision, reviewNote: note[id] || null })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast("success", decision === "approved" ? "Age assurance approved." : "Age assurance rejected.");
        await fetchRequests();
      } else {
        setError(data.error || "Failed to decide request.");
      }
    } catch {
      setError("Failed to decide request.");
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return (
      <Shell>
        <PageHeader title="Age Verification" subtitle="Review age-verification and age-assurance requests." />
        <EmptyState title="Loading" body="Loading requests..." />
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <PageHeader title="Age Verification" subtitle="Review age-verification and age-assurance requests." />
        <EmptyState title="Sign in required" body="You must be signed in to review requests." action={{ label: "Sign in", href: "/signin" }} />
      </Shell>
    );
  }

  const renderList = (items: Req[], onDecide: (id: string, d: "approved" | "rejected") => void, emptyMsg: string) => (
    items.length === 0 ? (
      <EmptyState title="No pending requests" body={emptyMsg} />
    ) : (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {items.map((r) => (
          <div key={r.id} className="rounded-2xl border border-af-border bg-af-surface p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-af-surface-2 text-sm font-bold text-af-text">
                {(r.display_name || r.username || "?").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-af-text">{r.display_name || r.username || "Unknown"}</div>
                <div className="text-xs text-af-muted">@{r.username || "unknown"}</div>
                <div className="mt-1 text-xs text-af-muted">Requested {r.requested_at ? new Date(r.requested_at).toLocaleString() : "unknown"}</div>
              </div>
            </div>
            <div className="mt-3">
              <textarea
                value={note[r.id] || ""}
                onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Review note (optional)"
                rows={2}
                className="w-full resize-none rounded-xl border border-af-border bg-af-bg px-3 py-2 text-sm text-af-text outline-none focus:border-af-brand"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button disabled={acting === r.id} onClick={() => onDecide(r.id, "approved")} className="rounded-xl bg-af-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Approve
              </button>
              <button disabled={acting === r.id} onClick={() => onDecide(r.id, "rejected")} className="rounded-xl bg-af-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <Shell>
      <PageHeader title="Age Verification" subtitle="Review age-verification and age-assurance requests." />
      {toast && (
        <div className={"fixed bottom-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg " + (toast.kind === "success" ? "bg-af-success" : "bg-af-danger")}>
          {toast.message}
        </div>
      )}
      {error && <div className="mx-auto max-w-2xl px-4 pt-4 text-sm text-af-danger-soft">{error}</div>}
      <h2 className="mx-auto max-w-2xl px-4 pt-4 text-lg font-bold">Age verification requests</h2>
      {renderList(requests, decideVerification, "There are no age-verification requests awaiting review.")}
      <h2 className="mx-auto max-w-2xl px-4 pt-4 text-lg font-bold">Age assurance requests</h2>
      {renderList(assuranceRequests, decideAssurance, "There are no age-assurance requests awaiting review.")}
    </Shell>
  );
}