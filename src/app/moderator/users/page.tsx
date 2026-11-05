"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type UserRow = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isPrivate: boolean | null;
  createdAt: string | null;
  activeEnforcements: Array<{ id: string; type: string; reason: string; starts_at: string | null; ends_at: string | null; created_at: string | null }>;
};

const TYPE_COLOR: Record<string, string> = {
  warning: "text-af-warning-soft",
  suspension: "text-af-warning-soft",
  ban: "text-af-danger-soft",
  restriction: "text-af-muted",
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enforcing, setEnforcing] = useState<string | null>(null);
  const [confirmEnforce, setConfirmEnforce] = useState<string | null>(null);
  const [enforceType, setEnforceType] = useState<"warning" | "suspension" | "ban" | "restriction" | null>(null);
  const [enforceReason, setEnforceReason] = useState("");
  const [enforceEndsAt, setEnforceEndsAt] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchUsers = useCallback(async () => {
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
      if (search) params.set("search", search);

      const res = await fetch(`/api/moderation/users?${params}`, { headers });
      if (!res.ok) { setError("Failed to load users."); setLoading(false); return; }
      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } catch { setError("Failed to load users."); }
    setLoading(false);
  }, [page, pageSize, search]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  const openEnforce = (userId: string) => {
    setConfirmEnforce(userId);
    setEnforceType(null);
    setEnforceReason("");
    setEnforceEndsAt("");
  };

  const submitEnforce = async () => {
    if (!confirmEnforce || !enforceType || !enforceReason.trim()) return;
    setEnforcing(confirmEnforce);
    const supabase = createClient();
    if (!supabase) { setEnforcing(null); return; }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setEnforcing(null); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const body: Record<string, unknown> = {
        targetUserId: confirmEnforce,
        type: enforceType,
        reason: enforceReason.trim(),
      };
      if (enforceEndsAt) body.ends_at = enforceEndsAt;

      const res = await fetch("/api/moderation/users", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setConfirmEnforce(null);
        setEnforceType(null);
        setEnforceReason("");
        setEnforceEndsAt("");
        void fetchUsers();
      } else {
        setError("Failed to create enforcement.");
      }
    } catch { setError("Failed to create enforcement."); }
    setEnforcing(null);
  };

  const revokeEnforcement = async (enforcementId: string) => {
    setRevoking(enforcementId);
    const supabase = createClient();
    if (!supabase) { setRevoking(null); return; }
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setRevoking(null); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/moderation/users", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enforcementId, action: "revoke", revokedReason: "Revoked by moderator" }),
      });

      if (res.ok) {
        setRevoking(null);
        void fetchUsers();
      } else {
        setError("Failed to revoke enforcement.");
      }
    } catch { setError("Failed to revoke enforcement."); }
    setRevoking(null);
  };

  if (loading) {
    return (
      <Shell>
        <PageHeader title="User Management" />
        <div className="p-8 text-center text-af-muted">Loading users...</div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <PageHeader title="User Management" />
        <div className="p-8 text-center text-af-danger">{error}</div>
      </Shell>
    );
  }

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.username.toLowerCase().includes(q) || (u.displayName?.toLowerCase().includes(q) ?? false);
  });

  return (
    <Shell>
      <PageHeader title="User Management" subtitle="Search accounts, view enforcement history and issue warnings, suspensions or bans." />

      <div className="flex flex-col sm:flex-row gap-4 items-end">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search username or display name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="af-field min-h-10 rounded-md px-3 text-sm w-full"
          />
        </div>
        <div className="text-xs text-af-muted">
          Showing {filtered.length} of {total} user{total !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <EmptyState title="No users" body="There are no users matching your search." />
        ) : (
          <div className="space-y-1">
            {filtered.map((u) => (
              <div key={u.id} className="rounded-xl border border-af-border bg-af-surface p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-af-text truncate">{u.displayName || u.username}</span>
                      <span className="text-xs text-af-muted">@{u.username}</span>
                    </div>
                    <p className="text-xs text-af-muted">
                      Account created {new Date(u.createdAt!).toLocaleDateString()}
                      {u.isPrivate ? " · Private account" : ""}
                    </p>
                    {u.activeEnforcements.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {u.activeEnforcements.map((e) => (
                          <span
                            key={e.id}
                            className={`rounded-md px-2 py-0.5 text-xs font-medium ${TYPE_COLOR[e.type]}`}
                          >
                            {e.type}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEnforce(u.id)}
                      className="min-h-9 rounded-md border border-af-border bg-af-surface px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2"
                    >
                      Enforce
                    </button>
                  </div>
                </div>
                {u.activeEnforcements.length > 0 && (
                  <div className="mt-3 border-t border-af-border/50 pt-3 space-y-1">
                    <p className="text-xs font-medium text-af-muted">Active enforcements</p>
                    {u.activeEnforcements.map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-af-surface-2 border border-af-border/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-af-text truncate">{e.reason}</p>
                          <p className="text-xs text-af-muted">{e.type} · started {new Date(e.starts_at!).toLocaleDateString()}</p>
                        </div>
                        <button
                          onClick={() => revokeEnforcement(e.id)}
                          disabled={revoking === e.id}
                          className={`min-h-8 rounded-md px-2 text-xs font-medium ${
                            revoking === e.id
                              ? "bg-af-surface opacity-50 cursor-not-allowed"
                              : "text-af-danger-soft hover:bg-af-danger/10"
                          }`}
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Enforcement dialog */}
        {confirmEnforce && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 sm:p-6"
            onClick={() => setConfirmEnforce(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-af-text">Issue enforcement</h2>
              <p className="mt-2 text-sm text-af-text-2">Select enforcement type, reason and optional expiry.</p>

              <div className="mt-4 space-y-2">
                <label className="text-xs font-medium text-af-muted block">Enforcement type</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { id: "warning", label: "Warning" },
                    { id: "suspension", label: "Suspension" },
                    { id: "ban", label: "Ban" },
                    { id: "restriction", label: "Restriction" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setEnforceType(t.id as any)}
                      className={`min-h-9 rounded-md px-3 text-xs font-medium ${enforceType === t.id ? "bg-af-brand text-white" : "border border-af-border text-af-text-2"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-af-muted block">Reason</label>
                <textarea
                  value={enforceReason}
                  onChange={(e) => setEnforceReason(e.target.value)}
                  rows={3}
                  className="af-field w-full px-3 py-2 text-sm resize-y"
                  placeholder="Explain the enforcement decision..."
                />
              </div>

              <div className="mt-4">
                <label className="text-xs font-medium text-af-muted block">Expires at (optional)</label>
                <input
                  type="datetime-local"
                  value={enforceEndsAt}
                  onChange={(e) => setEnforceEndsAt(e.target.value)}
                  className="af-field w-full px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  onClick={() => setConfirmEnforce(null)}
                  className="af-action-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitEnforce}
                  disabled={!enforceType || !enforceReason.trim() || enforcing === confirmEnforce}
                  className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enforcing === confirmEnforce ? "Enforcing..." : "Issue enforcement"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

