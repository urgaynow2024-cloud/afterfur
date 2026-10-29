"use client";

import { useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import type { MembershipSource } from "@/lib/pawpass";

type Target = { user_id: string; username: string; display_name: string | null };

type MembershipRow = {
  user_id: string;
  source: MembershipSource;
  plan_interval: string | null;
  status: string;
  eligible_since: string;
  current_period_end: string | null;
  is_test: boolean;
  granted_by: string | null;
  grant_reason: string | null;
};

const DURATIONS = [1, 3, 6, 12];

export default function StaffMembershipPage() {
  const { user } = useAuth();
  const isAdmin = user?.app_metadata?.afterfur_staff_admin === true;
  const [query, setQuery] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);
  const [selected, setSelected] = useState<Target | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [grantMonths, setGrantMonths] = useState<number>(3);
  const [customMonths, setCustomMonths] = useState<string>("");
  const [grantReason, setGrantReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [testDays, setTestDays] = useState<number>(7);
  const [testReason, setTestReason] = useState("");
  const [audit, setAudit] = useState<Array<{ id: number; action: string; source: string | null; occurred_at: string; details: unknown }>>([]);
  const requestId = useRef(0);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase || query.trim().length < 2) return;
    setLoading(true); setError(""); setMessage(""); setSelected(null); setMembership(null); setAudit([]);
    try {
      const { data, error: searchError } = await supabase.rpc("search_staff_badge_targets", { p_query: query.trim() });
      if (searchError) setError(searchError.message);
      else setTargets((data ?? []).map((row: { user_id: string; username: string; display_name: string | null }) => ({
        user_id: row.user_id, username: row.username, display_name: row.display_name,
      })));
    } catch { setError("User search failed."); }
    finally { setLoading(false); }
  }

  async function selectTarget(target: Target) {
    const rid = ++requestId.current;
    setSelected(target); setMembership(null); setError(""); setMessage(""); setAudit([]);
    const supabase = createClient();
    if (!supabase) { setError("Supabase not configured."); return; }
    setLoading(true);
    try {
      const { data, error: mError } = await supabase.rpc("get_membership_for_admin", { p_target_id: target.user_id });
      if (rid !== requestId.current) return;
      if (mError) { setError(mError.message); return; }
      const row = Array.isArray(data) ? data[0] : data;
      setMembership(row ? (row as MembershipRow) : null);
      const { data: auditData, error: aError } = await supabase.rpc("get_membership_audit", { p_target_id: target.user_id, p_limit: 25 });
      if (rid !== requestId.current) return;
      if (!aError) setAudit((auditData ?? []) as Array<{ id: number; action: string; source: string | null; occurred_at: string; details: unknown }>);
    } catch { if (rid === requestId.current) setError("Could not load membership."); }
    finally { if (rid === requestId.current) setLoading(false); }
  }

  function resolvedMonths(): number {
    const c = parseInt(customMonths, 10);
    if (Number.isFinite(c) && c > 0) return c;
    return grantMonths;
  }

  async function grant() {
    if (!selected || pending) return;
    const months = resolvedMonths();
    if (months < 1 || months > 36) { setError("Duration must be 1-36 months."); return; }
    const supabase = createClient();
    if (!supabase) return;
    setPending("grant"); setError(""); setMessage("");
    try {
      const { error: gError } = await supabase.rpc("grant_free_prime_membership", {
        p_target_id: selected.user_id, p_months: months, p_reason: grantReason.trim() || null,
      });
      if (gError) { setError(gError.message); return; }
      setMessage(`Granted ${months} month(s) of Prime.`);
      await selectTarget(selected);
    } catch { setError("Grant failed."); }
    finally { setPending(null); }
  }

  async function revoke() {
    if (!selected || pending) return;
    if (!confirmRevoke) { setConfirmRevoke(true); return; }
    setConfirmRevoke(false);
    const supabase = createClient();
    if (!supabase) return;
    setPending("revoke"); setError(""); setMessage("");
    try {
      const { error: rError } = await supabase.rpc("revoke_free_prime_membership", {
        p_target_id: selected.user_id, p_reason: "Revoked by owner",
      });
      if (rError) { setError(rError.message); return; }
      setMessage("Free membership revoked.");
      await selectTarget(selected);
    } catch { setError("Revoke failed."); }
    finally { setPending(null); }
  }

  async function setTest(active: boolean) {
    if (!selected || pending) return;
    const supabase = createClient();
    if (!supabase) return;
    setPending("test"); setError(""); setMessage("");
    try {
      const { error: tError } = await supabase.rpc("set_owner_test_prime", {
        p_target_id: selected.user_id,
        p_active: active,
        p_days: testDays,
        p_reason: testReason.trim() || null,
      });
      if (tError) { setError(tError.message); return; }
      setMessage(active ? "Test Prime activated." : "Test Prime deactivated.");
      await selectTarget(selected);
    } catch { setError("Test toggle failed."); }
    finally { setPending(null); }
  }

  const isOwnerGranted = membership?.source === "owner_granted";

  return (
    <Shell>
      <PageHeader title="Membership management" subtitle="Owner-only controls for free grants, test access and audit history." />
      {!user ? <EmptyState title="Sign in required" body="Membership management requires an authenticated administrator." action={{ label: "Sign in", href: "/signin" }} /> : !isAdmin ? (
        <div role="alert" className="m-4 rounded-lg border border-af-danger/40 bg-af-danger/10 p-4 text-sm text-af-text-2">This account is not configured as a staff administrator.</div>
      ) : (
        <section className="p-4 sm:p-5">
          <form onSubmit={search} className="flex gap-2">
            <label htmlFor="member-search" className="sr-only">Search users</label>
            <input id="member-search" value={query} onChange={(e) => setQuery(e.target.value)} minLength={2} placeholder="Search username or display name" className="af-field min-w-0 flex-1 px-3 text-sm" />
            <button type="submit" disabled={loading || query.trim().length < 2} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:opacity-50">{loading ? "Searching…" : "Search"}</button>
          </form>
          {error && <p role="alert" className="mt-3 text-sm text-af-danger">{error}</p>}
          {message && <p role="status" className="mt-3 text-sm text-af-text-2">{message}</p>}
          {targets.length > 0 && (
            <ul className="mt-4 divide-y divide-af-border rounded-lg border border-af-border" role="list">
              {targets.map((target) => (
                <li key={target.user_id}>
                  <button type="button" onClick={() => { void selectTarget(target); }} className={`flex min-h-12 w-full items-center gap-3 px-3 text-left transition-colors hover:bg-af-surface-2 ${selected?.user_id === target.user_id ? "bg-af-surface-2" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-af-text">{target.display_name || target.username}</span>
                      <span className="block truncate text-xs text-af-muted">@{target.username}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selected && (
            <section className="mt-5 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
              <h2 className="font-semibold text-af-text">{selected.display_name || selected.username}</h2>
              <p className="text-xs text-af-muted">@{selected.username}</p>
              {membership ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <dt className="text-af-muted">Source</dt><dd className="text-af-text">{membership.source}{membership.is_test ? " (test mode)" : ""}</dd>
                  <dt className="text-af-muted">Status</dt><dd className="text-af-text">{membership.status}</dd>
                  <dt className="text-af-muted">Start</dt><dd className="text-af-text">{new Date(membership.eligible_since).toLocaleString()}</dd>
                  <dt className="text-af-muted">Expiry</dt><dd className="text-af-text">{membership.current_period_end ? new Date(membership.current_period_end).toLocaleString() : "—"}</dd>
                  <dt className="text-af-muted">Plan</dt><dd className="text-af-text">{membership.plan_interval ?? "—"}</dd>
                  <dt className="text-af-muted">Reason</dt><dd className="text-af-text">{membership.grant_reason ?? "—"}</dd>
                </dl>
              ) : (
                <p className="mt-3 text-xs text-af-muted">No membership record.</p>
              )}

              <div className="mt-5 border-t border-af-border pt-4">
                <h3 className="text-sm font-semibold text-af-text">Grant free Prime membership</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DURATIONS.map((d) => (
                    <button key={d} type="button" onClick={() => { setGrantMonths(d); setCustomMonths(""); }} className={`min-h-9 rounded-md border px-3 text-xs font-medium ${grantMonths === d && !customMonths ? "border-af-brand bg-af-brand/15 text-af-brand-soft" : "border-af-border-strong text-af-text-2"}`}>{d} mo</button>
                  ))}
                  <input type="number" min={1} max={36} placeholder="Custom" value={customMonths} onChange={(e) => setCustomMonths(e.target.value)} className="af-field w-20 px-2 text-xs" />
                </div>
                <input type="text" placeholder="Grant reason / internal note" value={grantReason} onChange={(e) => setGrantReason(e.target.value)} className="af-field mt-2 w-full px-3 text-xs" />
                <button type="button" disabled={pending !== null} onClick={() => { void grant(); }} className="mt-2 min-h-9 rounded-md bg-af-brand px-4 text-xs font-semibold text-white disabled:opacity-50">{pending === "grant" ? "Granting…" : "Grant"}</button>
              </div>

              <div className="mt-5 border-t border-af-border pt-4">
                <h3 className="text-sm font-semibold text-af-text">Owner test access</h3>
                <p className="mt-1 text-xs text-af-muted">Clear test-mode labelling. Reversible. Does not represent a payment or founding reward.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="number" min={1} max={365} value={testDays} onChange={(e) => setTestDays(parseInt(e.target.value, 10) || 7)} className="af-field w-20 px-2 text-xs" />
                  <span className="text-xs text-af-muted">days</span>
                  <input type="text" placeholder="Reason" value={testReason} onChange={(e) => setTestReason(e.target.value)} className="af-field flex-1 px-3 text-xs" />
                </div>
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={pending !== null} onClick={() => { void setTest(true); }} className="min-h-9 rounded-md bg-af-brand px-4 text-xs font-semibold text-white disabled:opacity-50">{pending === "test" ? "Working…" : "Activate test Prime"}</button>
                  <button type="button" disabled={pending !== null || membership?.source !== "owner_test"} onClick={() => { void setTest(false); }} className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 disabled:opacity-50">Deactivate test Prime</button>
                </div>
              </div>

              {isOwnerGranted && (
                <div className="mt-5 border-t border-af-border pt-4">
                  <h3 className="text-sm font-semibold text-af-text">Revoke free membership</h3>
                  {confirmRevoke ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-af-muted">Confirm revoke?</span>
                      <button type="button" onClick={() => { void revoke(); }} className="min-h-9 rounded-md bg-af-danger px-4 text-xs font-semibold text-white">Confirm revoke</button>
                      <button type="button" onClick={() => setConfirmRevoke(false)} className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2">Cancel</button>
                    </div>
                  ) : (
                    <button type="button" disabled={pending !== null} onClick={() => setConfirmRevoke(true)} className="mt-2 min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 disabled:opacity-50">Revoke free membership</button>
                  )}
                </div>
              )}

              {audit.length > 0 && (
                <div className="mt-5 border-t border-af-border pt-4">
                  <h3 className="text-sm font-semibold text-af-text">Audit history</h3>
                  <ul className="mt-2 space-y-1 text-xs text-af-muted">
                    {audit.map((a) => (
                      <li key={a.id}>{new Date(a.occurred_at).toLocaleString()} — {a.action} ({a.source ?? "n/a"})</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </section>
      )}
    </Shell>
  );
}
