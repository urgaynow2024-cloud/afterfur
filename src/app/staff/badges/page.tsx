"use client";

import { useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { MANAGEABLE_BADGES } from "@/lib/badges";

type Target = { user_id: string; username: string; display_name: string | null; avatar_url?: string | null };
type AuditRow = { id: number; action: string; badge_id: string; occurred_at: string; actor_id: string | null };

const CATEGORY_LABEL: Record<string, string> = {
  staff: "Staff",
  trust: "Verification",
  creator: "Creator",
  community: "Community",
  membership: "Membership",
  achievement: "Achievement",
  milestone: "Milestone",
};

export default function StaffBadgesPage() {
  const { user } = useAuth();
  const isAdmin = user?.app_metadata?.afterfur_staff_admin === true;
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<Target | null>(null);
  const [badges, setBadges] = useState<string[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingBadge, setPendingBadge] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const requestId = useRef(0);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase || query.trim().length < 2) return;
    setLoading(true); setError(""); setMessage(""); setSelected(null); setBadges([]); setAudit([]);
    try {
      const { data, error: searchError } = await supabase.rpc("search_staff_badge_targets", { p_query: query.trim() });
      if (searchError) setError(searchError.message);
      else setTargets((data ?? []).map((row: { user_id: string; username: string; display_name: string | null; avatar_url?: string | null }) => ({
        user_id: row.user_id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url ?? null,
      })));
    } catch { setError("User search failed."); }
    finally { setLoading(false); }
  }

  async function selectTarget(target: Target) {
    const rid = ++requestId.current;
    setSelected(target); setBadges([]); setAudit([]); setError(""); setMessage("");
    const supabase = createClient();
    if (!supabase) { setError("Supabase not configured."); return; }
    setLoading(true);
    try {
      const { data, error: roleError } = await supabase.rpc("get_staff_badges_for_admin", { p_target_id: target.user_id });
      if (rid !== requestId.current) return;
      if (roleError) { setError(roleError.message); return; }
      setBadges((data ?? []).map((row: { badge_id: string }) => row.badge_id));
    } catch { if (rid === requestId.current) setError("Could not load badge assignments."); }
    finally { if (rid === requestId.current) setLoading(false); }
  }

  async function manage(badgeId: string, action: "grant" | "revoke") {
    if (!selected || pendingBadge) return;
    const supabase = createClient();
    if (!supabase) return;
    setPendingBadge(badgeId); setError(""); setMessage("");
    try {
      const { error: manageError } = await supabase.rpc("manage_staff_badge", { p_target_id: selected.user_id, p_badge_id: badgeId, p_action: action });
      if (manageError) { setError(manageError.message); return; }
      setMessage(action === "grant" ? "Badge granted." : "Badge revoked.");
      await selectTarget(selected);
    } catch { setError("Badge update failed."); }
    finally { setPendingBadge(null); setConfirmRevoke(null); }
  }

  const grouped = MANAGEABLE_BADGES.reduce<Record<string, typeof MANAGEABLE_BADGES>>((acc, badge) => {
    (acc[badge.category] ||= []).push(badge);
    return acc;
  }, {});

  const isOwn = user?.id === selected?.user_id;

  return (
    <Shell>
      <PageHeader title="Staff Badge Management" subtitle="Search users, review badges and manage authorised awards." />
      {!user ? <EmptyState title="Sign in required" body="Staff badge management requires authentication." action={{ label: "Sign in", href: "/signin" }} /> : !isAdmin ? (
        <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-text-2">This account is not configured as a staff administrator.</div>
      ) : (
        <section className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="rounded-xl border border-af-border bg-af-surface p-4">
            <form onSubmit={search} className="flex gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} minLength={2} placeholder="Search username or display name" className="af-field min-w-0 flex-1 px-3 text-sm" />
              <button type="submit" disabled={loading || query.trim().length < 2} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{loading ? "…" : "Search"}</button>
            </form>
            {error && <p role="alert" className="mt-3 text-sm text-af-danger">{error}</p>}
            {message && <p role="status" className="mt-3 text-sm text-af-text-2">{message}</p>}
            <ul className="mt-4 divide-y divide-af-border rounded-lg border border-af-border" role="list">
              {targets.map((target) => (
                <li key={target.user_id}>
                  <button type="button" onClick={() => { void selectTarget(target); }} className={`flex min-h-12 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-af-surface-2 ${selected?.user_id === target.user_id ? "bg-af-surface-2" : ""}`}>
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-af-surface-2">
                      {target.avatar_url ? <img src={target.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-xs font-bold text-af-brand-soft">{(target.display_name || target.username).slice(0, 1).toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-af-text">{target.display_name || target.username}</span>
                      <span className="block truncate text-xs text-af-muted">@{target.username}</span>
                    </div>
                  </button>
                </li>
              ))}
              {targets.length === 0 && !loading && <li className="px-3 py-4 text-xs text-af-muted">No users found.</li>}
            </ul>
          </div>

          <div className="space-y-4">
            {!selected ? (
              <div className="rounded-xl border border-af-border bg-af-surface p-6 text-sm text-af-muted">Select a user to manage badges.</div>
            ) : (
              <>
                <section className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                      {selected.avatar_url ? <img src={selected.avatar_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-lg font-bold text-af-brand-soft">{(selected.display_name || selected.username).slice(0, 1).toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-af-text">{selected.display_name || selected.username}</h2>
                      <p className="truncate text-sm text-af-muted">@{selected.username}</p>
                      <p className="mt-1 text-xs text-af-muted">{badges.length} active badge(s)</p>
                    </div>
                  </div>
                </section>

                {Object.entries(grouped).map(([category, list]) => (
                  <section key={category} className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-af-muted">{CATEGORY_LABEL[category] || category}</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {list.map((badge) => {
                        const active = badges.includes(badge.id);
                        const busy = pendingBadge === badge.id;
                        return (
                          <div key={badge.id} className="rounded-lg border border-af-border bg-af-surface-2 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-af-text">{badge.mark} {badge.label}</span>
                                <p className="mt-1 text-xs text-af-muted">{badge.id}</p>
                              </div>
                              {active ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Active</span> : <span className="rounded-full bg-af-surface px-2 py-0.5 text-xs text-af-muted">Inactive</span>}
                            </div>
                            <div className="mt-3 flex gap-2">
                              {!active ? (
                                <button type="button" disabled={busy || isOwn} onClick={() => { void manage(badge.id, "grant"); }} className="min-h-9 rounded-md bg-af-brand px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "…" : "Grant"}</button>
                              ) : confirmRevoke === badge.id ? (
                                <>
                                  <button type="button" disabled={busy} onClick={() => { void manage(badge.id, "revoke"); }} className="min-h-9 rounded-md bg-af-danger px-3 text-xs font-semibold text-white disabled:opacity-50">Confirm revoke</button>
                                  <button type="button" disabled={busy} onClick={() => setConfirmRevoke(null)} className="min-h-9 rounded-md border border-af-border-strong px-3 text-xs font-medium text-af-text-2 disabled:opacity-50">Cancel</button>
                                </>
                              ) : (
                                <button type="button" disabled={busy} onClick={() => setConfirmRevoke(badge.id)} className="min-h-9 rounded-md border border-af-border-strong px-3 text-xs font-medium text-af-text-2 disabled:opacity-50">Revoke</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}

                {audit.length > 0 && (
                  <section className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
                    <h3 className="mb-3 text-sm font-semibold text-af-text">Audit history</h3>
                    <ul className="space-y-2 text-xs text-af-muted">
                      {audit.map((row) => (
                        <li key={row.id} className="flex flex-wrap items-center gap-2">
                          <span>{new Date(row.occurred_at).toLocaleString()}</span>
                          <span className="font-medium text-af-text-2">{row.action}</span>
                          <span>{row.badge_id}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </section>
      )}
    </Shell>
  );
}
