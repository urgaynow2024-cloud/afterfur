"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { EmptyState, PageHeader, Shell } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { MANAGEABLE_BADGES, badgeImageFor } from "@/lib/badges";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

type DiagnosticsResult = {
  authenticatedUserId: string | null;
  sessionUserId: string | null;
  jwtRole: string | null;
  jwtAppMetadata: Record<string, unknown> | null;
  jwtAfterfurStaffAdmin: unknown;
  sessionExpiry: string | null;
  isAuthenticated: boolean;
  jwtAppMetadataMatch: { pass: boolean; details: string };
  supabaseUserAppMetadataMatch: { pass: boolean; details: string };
  expectedAdminPermission: { pass: boolean; details: string };
  permissionFunctionCheck: { pass: boolean; details: string };
  overallPass: boolean;
};

async function runDiagnostics(supabase: ReturnType<typeof createClient>, user: { id: string; app_metadata?: Record<string, unknown> } | null): Promise<DiagnosticsResult> {
  if (!supabase) {
    return {
      authenticatedUserId: null,
      sessionUserId: null,
      jwtRole: null,
      jwtAppMetadata: null,
      jwtAfterfurStaffAdmin: null,
      sessionExpiry: null,
      isAuthenticated: false,
      jwtAppMetadataMatch: { pass: false, details: "Supabase client not available" },
      supabaseUserAppMetadataMatch: { pass: false, details: "Supabase client not available" },
      expectedAdminPermission: { pass: false, details: "Supabase client not available" },
      permissionFunctionCheck: { pass: false, details: "Supabase client not available" },
      overallPass: false,
    };
  }

  const { data } = await supabase.auth.getSession();
  const sessionData = data?.session;
  const sessionUserId = sessionData?.user?.id ?? null;
  const authenticatedUserId = user?.id ?? null;
  const isAuthenticated = Boolean(sessionData?.user);
  const sessionExpiry = sessionData?.expires_at ? new Date(sessionData.expires_at * 1000).toISOString() : null;

  const jwtPayload = sessionData?.access_token ? decodeJwtPayload(sessionData.access_token) : null;
  const jwtRole = (jwtPayload?.role as string) ?? null;
  const jwtAppMetadata = (jwtPayload?.app_metadata as Record<string, unknown>) ?? null;
  const jwtAfterfurStaffAdmin = jwtAppMetadata?.afterfur_staff_admin ?? null;

  const supabaseUserAppMetadata = user?.app_metadata ?? null;
  const supabaseUserAfterfurStaffAdmin = supabaseUserAppMetadata?.afterfur_staff_admin ?? null;

  const jwtAppMetadataMatch = {
    pass: jwtAfterfurStaffAdmin === true,
    details: `JWT app_metadata.afterfur_staff_admin = ${JSON.stringify(jwtAfterfurStaffAdmin)}`,
  };

  const supabaseUserAppMetadataMatch = {
    pass: supabaseUserAfterfurStaffAdmin === true,
    details: `Supabase user app_metadata.afterfur_staff_admin = ${JSON.stringify(supabaseUserAfterfurStaffAdmin)}`,
  };

  const expectedAdminPermission = {
    pass: jwtAfterfurStaffAdmin === true && supabaseUserAfterfurStaffAdmin === true,
    details: `Expected: both JWT and Supabase user have afterfur_staff_admin = true`,
  };

  const permissionFunctionCheck = {
    pass: Boolean(authenticatedUserId && jwtAfterfurStaffAdmin === true),
    details: authenticatedUserId && jwtAfterfurStaffAdmin === true
      ? "require_afterfur_staff_admin() would PASS (authenticated user with JWT claim)"
      : "require_afterfur_staff_admin() would FAIL: " + (!authenticatedUserId ? "not authenticated" : "JWT claim missing/false"),
  };

  const overallPass = jwtAppMetadataMatch.pass && supabaseUserAppMetadataMatch.pass && expectedAdminPermission.pass && permissionFunctionCheck.pass;

  return {
    authenticatedUserId,
    sessionUserId,
    jwtRole,
    jwtAppMetadata,
    jwtAfterfurStaffAdmin,
    sessionExpiry,
    isAuthenticated,
    jwtAppMetadataMatch,
    supabaseUserAppMetadataMatch,
    expectedAdminPermission,
    permissionFunctionCheck,
    overallPass,
  };
}

function DiagnosticsPanel({ supabase, user }: { supabase: ReturnType<typeof createClient>; user: { id: string; app_metadata?: Record<string, unknown> } | null }) {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await runDiagnostics(supabase, user);
      setResult(res);
    } finally {
      setRunning(false);
    }
  };

  if (!result) {
    return (
      <button
        type="button"
        onClick={handleRun}
        disabled={running}
        className="min-h-9 rounded-md border border-af-border-strong px-3 text-xs font-medium text-af-text-2 disabled:opacity-50"
      >
        {running ? "Running…" : "Run Admin Permission Diagnostics"}
      </button>
    );
  }

  const checks = [
    { label: "Authenticated User ID", value: result.authenticatedUserId ?? "—", pass: result.isAuthenticated, details: result.isAuthenticated ? "Session has authenticated user" : "No authenticated user in session" },
    { label: "Session User ID", value: result.sessionUserId ?? "—", pass: result.sessionUserId === result.authenticatedUserId, details: result.sessionUserId === result.authenticatedUserId ? "Matches authenticated user ID" : "Mismatch or missing" },
    { label: "JWT Role", value: result.jwtRole ?? "—", pass: result.jwtRole === "authenticated", details: result.jwtRole === "authenticated" ? "Role is 'authenticated'" : `Role is '${result.jwtRole}'` },
    { label: "JWT app_metadata", value: result.jwtAppMetadata ? JSON.stringify(result.jwtAppMetadata, null, 2) : "—", pass: Boolean(result.jwtAppMetadata), details: result.jwtAppMetadata ? "Present" : "Missing" },
    { label: "JWT afterfur_staff_admin", value: String(result.jwtAfterfurStaffAdmin), pass: result.jwtAfterfurStaffAdmin === true, details: result.jwtAppMetadataMatch.details },
    { label: "Session Expiry", value: result.sessionExpiry ?? "—", pass: Boolean(result.sessionExpiry), details: result.sessionExpiry ? "Valid expiry timestamp" : "No expiry" },
    { label: "Session Authenticated", value: String(result.isAuthenticated), pass: result.isAuthenticated, details: result.isAuthenticated ? "Authenticated" : "Not authenticated" },
    { label: "JWT app_metadata match", value: result.jwtAppMetadataMatch.pass ? "PASS" : "FAIL", pass: result.jwtAppMetadataMatch.pass, details: result.jwtAppMetadataMatch.details },
    { label: "Supabase user app_metadata match", value: result.supabaseUserAppMetadataMatch.pass ? "PASS" : "FAIL", pass: result.supabaseUserAppMetadataMatch.pass, details: result.supabaseUserAppMetadataMatch.details },
    { label: "Expected admin permission", value: result.expectedAdminPermission.pass ? "PASS" : "FAIL", pass: result.expectedAdminPermission.pass, details: result.expectedAdminPermission.details },
    { label: "Permission function check", value: result.permissionFunctionCheck.pass ? "PASS" : "FAIL", pass: result.permissionFunctionCheck.pass, details: result.permissionFunctionCheck.details },
  ];

  return (
    <section className="rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-af-text">Admin Permission Diagnostics</h3>
        <button
          type="button"
          onClick={() => setResult(null)}
          className="min-h-8 rounded-md border border-af-border-strong px-3 text-xs font-medium text-af-text-2"
        >
          Clear
        </button>
      </div>
      <div className="space-y-2 text-xs">
        {checks.map((check, idx) => (
          <div
            key={idx}
            className={`flex flex-col gap-1 rounded-lg border p-3 ${check.pass ? "border-emerald-500/30 bg-emerald-500/5" : "border-af-danger/30 bg-af-danger/5"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-af-text">{check.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${check.pass ? "bg-emerald-500/20 text-emerald-300" : "bg-af-danger/20 text-af-danger-soft"}`}>
                {check.pass ? "PASS" : "FAIL"}
              </span>
            </div>
            <div className="font-mono text-af-muted break-all">{check.value}</div>
            <div className="text-af-text-2">{check.details}</div>
          </div>
        ))}
        <div className={`rounded-lg border p-3 text-center font-semibold ${result.overallPass ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-af-danger/30 bg-af-danger/5 text-af-danger-soft"}`}>
          Overall: {result.overallPass ? "PASS" : "FAIL"}
        </div>
      </div>
    </section>
  );
}

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
  const supabase = createClient();

  async function search(event: React.FormEvent) {
    event.preventDefault();
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
    if (!supabase) return;
    setPendingBadge(badgeId); setError(""); setMessage("");
    try {
      const { data, error: manageError } = await supabase.rpc("manage_staff_badge", { p_target_id: selected.user_id, p_badge_id: badgeId, p_action: action });
      console.log("RPC response:", { data, error: manageError });
      if (manageError) {
        console.error("RPC error details:", JSON.stringify(manageError, null, 2));
        setError(manageError.message);
        return;
      }
      if (data === false) {
        setMessage(action === "grant" ? "Badge is already active for this user." : "Badge is not currently active for this user.");
      } else {
        setMessage(action === "grant" ? "Badge granted." : "Badge revoked.");
      }
      await selectTarget(selected);
    } catch { setError("Badge update failed."); }
    finally { setPendingBadge(null); setConfirmRevoke(null); }
  }

  const grouped = MANAGEABLE_BADGES.reduce<Record<string, typeof MANAGEABLE_BADGES>>((acc, badge) => {
    (acc[badge.category] ||= []).push(badge);
    return acc;
  }, {});

  const isOwn = user?.id === selected?.user_id;
  const canSelfAssign = isOwn && user?.app_metadata?.afterfur_staff_admin === true;

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
            <DiagnosticsPanel supabase={supabase} user={user} />
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
                        const src = badgeImageFor(badge.id);
                        return (
                          <div key={badge.id} className="rounded-lg border border-af-border bg-af-surface-2 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {src ? (
                                  <Image src={src} alt={badge.label} width={32} height={32} className="h-8 w-8 shrink-0 object-contain" />
                                ) : (
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center text-base font-bold text-af-brand-soft">{badge.mark}</span>
                                )}
                                <div className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-af-text">{badge.label}</span>
                                  <p className="mt-1 text-xs text-af-muted">{badge.id}</p>
                                </div>
                              </div>
                              {active ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Active</span> : <span className="rounded-full bg-af-surface px-2 py-0.5 text-xs text-af-muted">Inactive</span>}
                            </div>
                            <div className="mt-3 flex gap-2">
                              {!active ? (
                                <button type="button" disabled={busy || (isOwn && !canSelfAssign)} onClick={() => { void manage(badge.id, "grant"); }} className="min-h-9 rounded-md bg-af-brand px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "…" : "Grant"}</button>
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
