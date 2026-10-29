"use client";

import { useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { STAFF_BADGES } from "@/lib/badges";
import { useRefreshUserBadges } from "@/components/UserBadgeProvider";

type Target = { user_id: string; username: string; display_name: string | null; avatar_url?: string | null };

export default function StaffBadgesPage() {
  const { user } = useAuth();
  const refreshBadges = useRefreshUserBadges();
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<Target | null>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const roleRequestId = useRef(0);
  const isAdmin = user?.app_metadata?.afterfur_staff_admin === true;

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase || query.trim().length < 2) return;
    setLoading(true); setError(""); setMessage(""); setSelected(null); setSelectedAvatar(null); setAssigned([]); setTargets([]);
    try {
      const { data, error: searchError } = await supabase.rpc("search_staff_badge_targets", { p_query: query.trim() });
      if (searchError) setError(searchError.message);
      else setTargets((data ?? []).map((row: { user_id: string; username: string; display_name: string | null }) => ({
        user_id: row.user_id,
        username: row.username,
        display_name: row.display_name,
      })));
    } catch {
      setError("User search failed. Check your connection and administrator access.");
    } finally { setLoading(false); }
  }

  async function selectTarget(target: Target) {
    const requestId = ++roleRequestId.current;
    setSelected(target); setSelectedAvatar(null); setAssigned([]); setError(""); setMessage(""); setConfirmRevoke(null);
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setLoading(true);
    try {
      const { data, error: roleError } = await supabase.rpc("get_staff_badges_for_admin", { p_target_id: target.user_id });
      if (requestId !== roleRequestId.current) return;
      if (roleError) { setError(roleError.message); return; }
      setAssigned((data ?? []).map((row: { badge_id: string }) => row.badge_id));
      // Fetch avatar for the selected user (non-blocking, best-effort).
      void supabase.from("profiles").select("avatar_url").eq("id", target.user_id).maybeSingle().then(({ data: prof }) => {
        if (requestId === roleRequestId.current) setSelectedAvatar(prof?.avatar_url ?? null);
      });
    } catch { if (requestId === roleRequestId.current) setError("Could not load staff assignments."); }
    finally { if (requestId === roleRequestId.current) setLoading(false); }
  }

  async function changeBadge(badgeId: string) {
    if (!selected || pending) return;
    const action = assigned.includes(badgeId) ? "revoke" : "grant";
    if (action === "revoke" && confirmRevoke !== badgeId) {
      setConfirmRevoke(badgeId);
      return;
    }
    setConfirmRevoke(null);
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setPending(badgeId); setError(""); setMessage("");
    try {
      const { data, error: changeError } = await supabase.rpc("manage_staff_badge", { p_target_id: selected.user_id, p_badge_id: badgeId, p_action: action });
      if (changeError) { setError(changeError.message); return; }
      if (!data) { setMessage("No change was needed; the assignment was already in that state."); return; }
      setAssigned((current) => action === "grant" ? [...new Set([...current, badgeId])] : current.filter((id) => id !== badgeId));
      refreshBadges(selected.user_id);
      setMessage(`${action === "grant" ? "Granted" : "Revoked"} ${STAFF_BADGES.find((badge) => badge.id === badgeId)?.label ?? "badge"}.`);
    } catch { setError("The staff badge change failed. Please retry."); }
    finally { setPending(null); }
  }

  const cancelRevoke = () => setConfirmRevoke(null);

  return (
    <Shell>
      <PageHeader title="Staff badges" subtitle="Manage the four manually assigned staff badges. Changes are checked and audited by Supabase." />
      {!user ? <EmptyState title="Sign in required" body="Staff badge management requires an authenticated administrator." action={{ label: "Sign in", href: "/signin" }} /> : !isAdmin ? (
        <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-text-2">This account is not configured as a staff administrator. Administrator access is assigned through trusted Supabase Auth app metadata; staff badges themselves do not grant administrative access.</div>
      ) : (
        <section className="p-4 sm:p-5">
          <form onSubmit={search} className="flex gap-2">
            <label htmlFor="staff-user-search" className="sr-only">Search users by username or display name</label>
            <input id="staff-user-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} placeholder="Search username or display name" className="af-field min-w-0 flex-1 px-3 text-sm" />
            <button type="submit" disabled={loading || query.trim().length < 2} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-af-danger">{error}</p>}
          {message && <p role="status" className="mt-3 text-sm text-af-text-2">{message}</p>}
          {targets.length > 0 && (
            <ul className="mt-4 divide-y divide-af-border rounded-lg border border-af-border" role="list" aria-label="Search results">
              {targets.map((target) => (
                <li key={target.user_id}>
                  <button type="button" onClick={() => { void selectTarget(target); }} aria-pressed={selected?.user_id === target.user_id} className={`flex min-h-12 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-af-surface-2 ${selected?.user_id === target.user_id ? "bg-af-surface-2" : ""}`}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                      {target.avatar_url ? <img src={target.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-semibold text-af-brand-soft">{(target.display_name || target.username).slice(0, 1).toUpperCase()}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-af-text">{target.display_name || target.username}</span>
                      <span className="block truncate text-xs text-af-muted">@{target.username}</span>
                    </div>
                    {selected?.user_id === target.user_id && <span aria-hidden="true" className="text-xs text-af-brand-soft">Selected</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <section aria-labelledby="selected-staff-target" className="mt-5 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-af-surface-2 ring-1 ring-af-border">
                  {selectedAvatar ? <img src={selectedAvatar} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-semibold text-af-brand-soft">{(selected.display_name || selected.username).slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="min-w-0">
                  <h2 id="selected-staff-target" className="truncate font-semibold text-af-text">{selected.display_name || selected.username}</h2>
                  <p className="truncate text-xs text-af-muted">@{selected.username}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-af-muted">Manually managed badges only. PawPass and milestone badges are awarded automatically from verified data and cannot be changed here. All changes are audited.</p>
              <ul className="mt-3 divide-y divide-af-border" role="list" aria-label="Staff badges">
                {STAFF_BADGES.map((badge) => {
                  const active = assigned.includes(badge.id);
                  const isPending = pending === badge.id;
                  const isConfirming = confirmRevoke === badge.id;
                  return (
                    <li key={badge.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-af-border-strong bg-af-surface-2 text-sm text-af-brand-soft" aria-hidden="true">{badge.mark}</span>
                        <span className="text-sm font-medium text-af-text">{badge.label}</span>
                        {active && <span className="rounded-full border border-af-brand/40 bg-af-brand/10 px-2 py-0.5 text-[10px] font-semibold text-af-brand-soft">Active</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {isConfirming && (
                          <>
                            <span className="text-xs text-af-muted">Revoke this badge?</span>
                            <button type="button" onClick={cancelRevoke} className="min-h-9 rounded-md border border-af-border-strong px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Cancel</button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => { void changeBadge(badge.id); }}
                          disabled={loading || pending !== null}
                          aria-pressed={active}
                          className={`min-h-9 rounded-md px-4 text-xs font-semibold transition-colors disabled:opacity-50 ${active ? "border border-af-border-strong text-af-text hover:bg-af-surface-2" : "bg-af-brand text-white hover:bg-af-brand-hover"}`}
                        >
                          {isPending ? "Saving…" : isConfirming ? "Confirm revoke" : active ? "Revoke" : "Grant"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {!targets.length && !loading && (
            <p className="mt-4 text-sm text-af-muted">Search for a member to manage badges. A user cannot be assigned badges by their own account. Staff badges do not grant administrator access.</p>
          )}
        </section>
      )}
    </Shell>
  );
}
