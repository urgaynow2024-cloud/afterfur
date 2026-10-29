"use client";

import { useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { STAFF_BADGES } from "@/lib/badges";
import { useRefreshUserBadges } from "@/components/UserBadgeProvider";

type Target = { user_id: string; username: string; display_name: string | null };

export default function StaffBadgesPage() {
  const { user } = useAuth();
  const refreshBadges = useRefreshUserBadges();
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<Target | null>(null);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const roleRequestId = useRef(0);
  const isAdmin = user?.app_metadata?.afterfur_staff_admin === true;

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase || query.trim().length < 2) return;
    setLoading(true); setError(""); setMessage(""); setSelected(null); setAssigned([]); setTargets([]);
    try {
      const { data, error: searchError } = await supabase.rpc("search_staff_badge_targets", { p_query: query.trim() });
      if (searchError) setError(searchError.message);
      else setTargets(data ?? []);
    } catch {
      setError("User search failed. Check your connection and administrator access.");
    } finally { setLoading(false); }
  }

  async function selectTarget(target: Target) {
    const requestId = ++roleRequestId.current;
    setSelected(target); setAssigned([]); setError(""); setMessage("");
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setLoading(true);
    try {
      const { data, error: roleError } = await supabase.rpc("get_staff_badges_for_admin", { p_target_id: target.user_id });
      if (requestId !== roleRequestId.current) return;
      if (roleError) setError(roleError.message);
      else setAssigned((data ?? []).map((row) => row.badge_id));
    } catch { if (requestId === roleRequestId.current) setError("Could not load staff assignments."); }
    finally { if (requestId === roleRequestId.current) setLoading(false); }
  }

  async function changeBadge(badgeId: string) {
    if (!selected || pending) return;
    const action = assigned.includes(badgeId) ? "revoke" : "grant";
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

  return (
    <Shell>
      <PageHeader title="Staff badges" subtitle="Manage the four public staff badges. Changes are checked and audited by Supabase." />
      {!user ? <EmptyState title="Sign in required" body="Staff badge management requires an authenticated administrator." action={{ label: "Sign in", href: "/signin" }} /> : !isAdmin ? (
        <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-text-2">This account is not configured as a staff administrator. Administrator access is assigned through trusted Supabase Auth app metadata; staff badges themselves do not grant administrative access.</div>
      ) : (
        <section className="p-4 sm:p-5">
          <form onSubmit={search} className="flex gap-2">
            <label htmlFor="staff-user-search" className="sr-only">Search users by username or display name</label>
            <input id="staff-user-search" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} placeholder="Search username or display name" className="af-field min-w-0 flex-1 px-3 text-sm" />
            <button type="submit" disabled={loading || query.trim().length < 2} className="af-action-primary disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-af-danger">{error}</p>}
          {message && <p role="status" className="mt-3 text-sm text-af-text-2">{message}</p>}
          {targets.length > 0 && <ul className="mt-4 divide-y divide-af-border rounded-lg border border-af-border">{targets.map((target) => <li key={target.user_id}>
            <button type="button" onClick={() => { void selectTarget(target); }} className={`flex min-h-12 w-full items-center justify-between px-3 text-left hover:bg-af-surface-2 ${selected?.user_id === target.user_id ? "bg-af-surface-2" : ""}`}>
              <span><span className="block text-sm font-medium">{target.display_name || target.username}</span><span className="text-xs text-af-muted">@{target.username}</span></span>
              {selected?.user_id === target.user_id && <span aria-hidden="true" className="text-xs text-af-brand-soft">Selected</span>}
            </button>
          </li>)}</ul>}
          {selected && <section aria-labelledby="selected-staff-target" className="mt-5 rounded-lg border border-af-border p-4">
            <h2 id="selected-staff-target" className="font-semibold">Badges for @{selected.username}</h2>
            <p className="mt-1 text-xs text-af-muted">Assignments are audited. Moderator, Developer and Tester are independent badges; none grants administrator access.</p>
            <ul className="mt-3 divide-y divide-af-border">{STAFF_BADGES.map((badge) => {
              const active = assigned.includes(badge.id);
              return <li key={badge.id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-sm">{badge.label}</span>
                <button type="button" onClick={() => { void changeBadge(badge.id); }} disabled={loading || pending !== null} aria-pressed={active} className={active ? "af-action-secondary" : "af-action-primary"}>
                  {pending === badge.id ? "Saving…" : active ? "Revoke" : "Grant"}
                </button>
              </li>;
            })}</ul>
          </section>}
          {!targets.length && !loading && <p className="mt-4 text-sm text-af-muted">Search for a member to manage badges. A user cannot be assigned badges by their own account.</p>}
        </section>
      )}
    </Shell>
  );
}
