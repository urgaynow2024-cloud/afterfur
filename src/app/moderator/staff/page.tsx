"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StaffMember = {
  id: string; userId: string; username: string | null; displayName: string | null;
  avatarUrl: string | null; role: string; assignedBy: string | null; assignedAt: string | null; reason: string | null; status?: string | null;
};
type SearchUser = { id: string; username: string | null; displayName: string | null; avatarUrl: string | null; existingRole: string | null };
type Toast = { kind: "success" | "error"; message: string } | null;

const ROLE_LABEL: Record<string, string> = { moderator: "Moderator", senior_moderator: "Senior Moderator", administrator: "Administrator" };
const ROLE_DESC: Record<string, string> = {
  moderator: "Can review reports and perform content moderation actions.",
  senior_moderator: "All Moderator permissions, plus user enforcement (warnings, suspensions, bans, restrictions).",
  administrator: "All Senior Moderator permissions, plus staff management and sensitive administration actions.",
};
const ROLE_BADGE: Record<string, string> = {
  moderator: "border-af-brand/25 bg-af-brand/10 text-af-brand-soft",
  senior_moderator: "border-violet-400/25 bg-violet-500/10 text-violet-200",
  administrator: "border-amber-400/25 bg-amber-500/10 text-amber-200",
};

function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const initial = (name || "?").trim().slice(0, 1).toUpperCase() || "?";
  if (src) return <img src={src} alt="" width={size} height={size} className="rounded-full object-cover ring-1 ring-af-border" style={{ width: size, height: size }} />;
  return <div className="flex items-center justify-center rounded-full bg-gradient-to-br from-af-brand/40 to-violet-500/20 text-sm font-semibold text-af-text ring-1 ring-af-border" style={{ width: size, height: size }} aria-hidden="true">{initial}</div>;
}

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

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupMessage, setSetupMessage] = useState("");
  const [toast, setToast] = useState<Toast>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [actorIsAdmin, setActorIsAdmin] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [badgeSync, setBadgeSync] = useState<Record<string, { synced: boolean; badgeId: string | null; action: string | null; error: string | null; pending: boolean }>>({});

  const [addOpen, setAddOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<SearchUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [addRole, setAddRole] = useState<"moderator" | "senior_moderator" | "administrator">("moderator");
  const [addReason, setAddReason] = useState("");
  const [addConfirm, setAddConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [changeTarget, setChangeTarget] = useState<StaffMember | null>(null);
  const [changeRole, setChangeRole] = useState<"moderator" | "senior_moderator" | "administrator">("moderator");
  const [changeReason, setChangeReason] = useState("");
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (kind: "success" | "error", message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 4500);
  };

  const retryBadgeSync = async (targetUserId: string, currentRole: string) => {
    setBadgeSync((current) => ({ ...current, [targetUserId]: { ...current[targetUserId], pending: true } }));
    try {
      const res = await fetch("/api/moderation/staff", {
        method: "PATCH",
        headers: await authHeaders(true),
        body: JSON.stringify({ targetUserId, action: "sync_badge", role: currentRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBadgeSync((current) => ({
          ...current,
          [targetUserId]: {
            synced: Boolean(data?.badge?.synced),
            badgeId: data?.badge?.badge_id ?? null,
            action: data?.badge?.action ?? null,
            error: data?.badge?.error ?? null,
            pending: false,
          },
        }));
        if (data?.badge?.synced) {
          showToast("success", "Staff badge synchronized.");
        } else {
          showToast("error", data?.badge?.error || "Badge synchronization failed.");
        }
      } else {
        setBadgeSync((current) => ({
          ...current,
          [targetUserId]: { ...current[targetUserId], pending: false, error: data?.message || "Retry failed." },
        }));
        showToast("error", data?.message || "Badge synchronization failed.");
      }
      void fetchStaff();
    } catch {
      setBadgeSync((current) => ({
        ...current,
        [targetUserId]: { ...current[targetUserId], pending: false, error: "Badge synchronization failed." },
      }));
      showToast("error", "Badge synchronization failed.");
    }
  };

  const fetchStaff = useCallback(async () => {
    setLoading(true); setError(""); setSetupMessage("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page)); params.set("pageSize", String(pageSize));
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      const res = await fetch("/api/moderation/staff?" + params, { headers: await authHeaders(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 503 && data?.code === "migration_required") {
        setSetupMessage(typeof data.message === "string" ? data.message : "Staff management database setup is incomplete."); setStaff([]); setTotal(0);
      } else if (res.status === 401 || res.status === 403) {
        setError("You do not have permission to manage staff."); setStaff([]);
      } else if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "Failed to load staff members."); setStaff([]);
      } else {
        setStaff(Array.isArray(data.staff) ? data.staff : []); setTotal(Number(data.total) || 0);
        setActorId(data.actor?.userId ?? null); setActorIsAdmin(Boolean(data.actor?.isAdministrator));
      }
    } catch { setError("Failed to load staff members."); }
    setLoading(false);
  }, [page, pageSize, search, roleFilter]);

  useEffect(() => { void fetchStaff(); }, [fetchStaff]);

  useEffect(() => {
    if (!addOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = userQuery.trim();
    if (q.length < 2) { setUserResults([]); setSearchingUsers(false); return; }
    setSearchingUsers(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/moderation/staff/search?q=" + encodeURIComponent(q), { headers: await authHeaders(), cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        setUserResults(res.ok && Array.isArray(data.users) ? data.users : []);
      } catch { setUserResults([]); }
      setSearchingUsers(false);
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [userQuery, addOpen]);

  const resetAdd = () => { setAddOpen(false); setUserQuery(""); setUserResults([]); setSelectedUser(null); setAddRole("moderator"); setAddReason(""); setAddConfirm(false); setSearchingUsers(false); };

  const submitAdd = async () => {
    if (!selectedUser || !addReason.trim() || submitting) return;
    if (addRole === "administrator" && !actorIsAdmin) { showToast("error", "Only administrators can appoint administrators."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/moderation/staff", { method: "POST", headers: await authHeaders(true), body: JSON.stringify({ targetUserId: selectedUser.id, role: addRole, reason: addReason.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const badge = data?.badge ?? null;
        let message = (selectedUser.displayName || selectedUser.username || "User") + " appointed as " + ROLE_LABEL[addRole] + ".";
        if (badge?.badge_id) message += ` — ${badge.action === "grant" ? "Badge awarded" : "Badge updated"}.`;
        else if (badge?.error) {
          message += " — Role saved, but badge could not be awarded. Retry below.";
          setBadgeSync((current) => ({
            ...current,
            [selectedUser.id]: {
              synced: false,
              badgeId: null,
              action: "grant",
              error: badge.error,
              pending: false,
            },
          }));
        } else {
          message += " — No badge change needed.";
        }
        showToast("success", message);
        setBadgeSync((current) => ({
          ...current,
          [selectedUser.id]: {
            synced: Boolean(badge?.synced),
            badgeId: badge?.badge_id ?? null,
            action: badge?.action ?? null,
            error: badge?.error ?? null,
            pending: false,
          },
        }));
        resetAdd(); void fetchStaff();
      } else { showToast("error", typeof data?.message === "string" ? data.message : "Could not appoint staff member."); }
    } catch { showToast("error", "Could not appoint staff member."); }
    setSubmitting(false);
  };

  const submitChangeRole = async () => {
    if (!changeTarget || !changeReason.trim() || submitting) return;
    if (changeRole === "administrator" && !actorIsAdmin) { showToast("error", "Only administrators can appoint administrators."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/moderation/staff", { method: "PATCH", headers: await authHeaders(true), body: JSON.stringify({ targetUserId: changeTarget.userId, role: changeRole, reason: changeReason.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const badge = data?.badge ?? null;
        let message = "Role updated to " + ROLE_LABEL[changeRole] + ".";
        if (badge?.badge_id) message += ` — ${badge.action === "grant" ? "Badge awarded" : "Badge revoked"}.`;
        else if (badge?.error) {
          message += " — Role saved, but badge sync failed. Retry below.";
          setBadgeSync((current) => ({
            ...current,
            [changeTarget.userId]: {
              synced: false,
              badgeId: null,
              action: "grant",
              error: badge.error,
              pending: false,
            },
          }));
        } else {
          message += " — No badge change needed.";
        }
        showToast("success", message);
        setBadgeSync((current) => ({
          ...current,
          [changeTarget.userId]: {
            synced: Boolean(badge?.synced),
            badgeId: badge?.badge_id ?? null,
            action: badge?.action ?? null,
            error: badge?.error ?? null,
            pending: false,
          },
        }));
        setChangeTarget(null); setChangeReason(""); void fetchStaff();
      } else { showToast("error", typeof data?.message === "string" ? data.message : "Could not change role."); }
    } catch { showToast("error", "Could not change role."); }
    setSubmitting(false);
  };

  const submitRemove = async () => {
    if (!removeTarget || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/moderation/staff", { method: "PATCH", headers: await authHeaders(true), body: JSON.stringify({ targetUserId: removeTarget.userId, action: "remove", reason: removeReason.trim() || "Removed by administrator" }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const badge = data?.badge ?? null;
        let message = (removeTarget.displayName || removeTarget.username || "Staff member") + " removed from staff.";
        if (badge?.badge_id) message += " — Staff badge revoked.";
        else if (badge?.error) {
          message += " — Removed from staff, but badge revocation failed. Retry below.";
          setBadgeSync((current) => ({
            ...current,
            [removeTarget.userId]: {
              synced: false,
              badgeId: null,
              action: "revoke",
              error: badge.error,
              pending: false,
            },
          }));
        }
        showToast("success", message);
        setBadgeSync((current) => ({
          ...current,
          [removeTarget.userId]: {
            synced: Boolean(badge?.synced),
            badgeId: badge?.badge_id ?? null,
            action: badge?.action ?? null,
            error: badge?.error ?? null,
            pending: false,
          },
        }));
        setRemoveTarget(null); setRemoveReason(""); void fetchStaff();
      } else { showToast("error", typeof data?.message === "string" ? data.message : "Could not remove staff member."); }
    } catch { showToast("error", "Could not remove staff member."); }
    setSubmitting(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-screen bg-af-bg text-af-text">
      <header className="sticky top-0 z-20 border-b border-af-border/80 bg-af-bg/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-af-text sm:text-2xl">Staff Management</h1>
            <p className="mt-1 text-sm text-af-muted">Appoint trusted moderators, manage roles, and keep staff permissions auditable.</p>
          </div>
          <button type="button" onClick={() => setAddOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-af-brand px-4 text-sm font-semibold text-white shadow-lg shadow-af-brand/20 transition hover:bg-af-brand-hover focus:outline-none focus:ring-2 focus:ring-af-brand/50">
            <span className="text-base leading-none">+</span> Add Staff Member
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-4 py-5 sm:px-6 sm:py-6">
        {toast && <div className={"mb-4 rounded-xl border px-4 py-3 text-sm " + (toast.kind === "success" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-red-400/20 bg-red-500/10 text-red-200")} role="status">{toast.message}</div>}

        {setupMessage ? (
          <div className="rounded-2xl border border-af-warning/30 bg-af-warning/10 p-5">
            <h2 className="text-sm font-semibold text-af-warning-soft">Database setup required</h2>
            <p className="mt-2 text-sm text-af-text-2">{setupMessage}</p>
            <p className="mt-2 text-xs text-af-muted">Migrations are not applied automatically. Apply 0033_moderator_administration.sql to the target database, then reload.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 rounded-2xl border border-af-border bg-af-surface/70 p-3 sm:grid-cols-[1fr_180px_auto] sm:items-center">
              <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or username..." aria-label="Search staff members" className="af-field w-full min-h-11 rounded-xl px-3.5 text-sm" />
              <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} aria-label="Filter by role" className="af-field w-full min-h-11 rounded-xl px-3.5 text-sm">
                <option value="">All roles</option><option value="moderator">Moderator</option><option value="senior_moderator">Senior Moderator</option><option value="administrator">Administrator</option>
              </select>
              <div className="text-sm text-af-muted sm:text-right">{loading ? "Loading..." : total + " staff member" + (total === 1 ? "" : "s")}</div>
            </div>

            {error && !loading && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="animate-pulse rounded-2xl border border-af-border bg-af-surface p-4"><div className="flex items-center gap-4"><div className="h-11 w-11 rounded-full bg-af-surface-2" /><div className="flex-1 space-y-2"><div className="h-4 w-40 rounded bg-af-surface-2" /><div className="h-3 w-56 rounded bg-af-surface-2" /></div><div className="h-7 w-24 rounded-full bg-af-surface-2" /></div></div>))}</div>
            ) : !error && staff.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-af-border bg-af-surface/40 px-6 py-14 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-af-brand/10 text-2xl text-af-brand-soft">+</div>
                <h2 className="text-lg font-semibold text-af-text">No staff members yet</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-af-muted">Appoint a trusted account as a moderator, senior moderator, or administrator. All changes are recorded in the audit log.</p>
                <button type="button" onClick={() => setAddOpen(true)} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-af-brand px-4 text-sm font-semibold text-white hover:bg-af-brand-hover">Add Staff Member</button>
              </div>
            ) : !error ? (
              <div className="space-y-3">
                {staff.map((m) => {
                  const name = m.displayName || m.username || "Unknown";
                  const isSelf = Boolean(actorId && actorId === m.userId);
                  return (
                    <article key={m.userId} className="rounded-2xl border border-af-border bg-af-surface p-4 transition hover:border-af-brand/25 hover:bg-af-surface-2/30">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <Avatar src={m.avatarUrl} name={name} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-af-text">{name}</span>
                              {m.username && <span className="truncate text-sm text-af-muted">@{m.username}</span>}
                              <span className={"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium " + (ROLE_BADGE[m.role] || "border-af-border bg-af-surface-2 text-af-text-2")}>{ROLE_LABEL[m.role] || m.role}</span>
                              <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">Active</span>
                              {isSelf && <span className="text-[11px] text-af-muted">(You)</span>}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-af-muted">
                              <span>Appointed {m.assignedAt ? new Date(m.assignedAt).toLocaleDateString() : "—"}</span>
                              {m.reason && <span className="max-w-[42ch] truncate" title={m.reason}>Reason: {m.reason}</span>}
                              {badgeSync[m.userId] && (
                                <span className={badgeSync[m.userId].synced
                                  ? "inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200"
                                  : "inline-flex items-center rounded-full border border-red-400/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-200"}>
                                  {badgeSync[m.userId].synced ? "Badge synced" : "Badge error"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="relative flex items-center justify-end gap-2 self-end sm:self-auto">
                          <Link href={m.username ? "/" + m.username : "#"} className="hidden min-h-9 items-center rounded-lg border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 sm:inline-flex">Profile</Link>
                          <button type="button" aria-label="Staff actions" onClick={() => setMenuFor(menuFor === m.userId ? null : m.userId)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-af-border text-af-text-2 transition hover:bg-af-surface-2 focus:outline-none focus:ring-2 focus:ring-af-brand/40"><span aria-hidden="true">⋯</span></button>
                          {menuFor === m.userId && (
                            <>
                              <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close menu" onClick={() => setMenuFor(null)} />
                              <div className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-af-border bg-af-surface p-1.5 shadow-2xl">
                                <button type="button" disabled={isSelf} onClick={() => { setMenuFor(null); setChangeTarget(m); setChangeRole(((m.role as any) || "moderator")); setChangeReason(""); }} className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-af-text hover:bg-af-surface-2 disabled:cursor-not-allowed disabled:opacity-45">Change role</button>
                                <Link href={m.username ? "/" + m.username : "#"} onClick={() => setMenuFor(null)} className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-af-text hover:bg-af-surface-2 sm:hidden">View profile</Link>
                                <button type="button" disabled={isSelf} onClick={() => { setMenuFor(null); setRemoveTarget(m); setRemoveReason(""); }} className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">Remove from staff</button>
                                {badgeSync[m.userId] && !badgeSync[m.userId].synced && (
                                  <button type="button" disabled={badgeSync[m.userId].pending || submitting} onClick={() => { setMenuFor(null); void retryBadgeSync(m.userId, m.role); }} className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-amber-300 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-45">
                                    {badgeSync[m.userId].pending ? "Retrying…" : "Retry badge sync"}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}

            {!loading && !error && totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between gap-3 text-sm">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-af-border px-3 py-2 text-af-text-2 hover:bg-af-surface-2 disabled:opacity-40">Previous</button>
                <span className="text-af-muted">Page {page} of {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-af-border px-3 py-2 text-af-text-2 hover:bg-af-surface-2 disabled:opacity-40">Next</button>
              </div>
            )}
          </>
        )}
      </main>

      {addOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Add staff member">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-af-border bg-af-bg p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-af-text">Add staff member</h2><p className="mt-1 text-sm text-af-muted">Search an existing AfterFur account, choose a role, and confirm the appointment.</p></div><button type="button" onClick={resetAdd} className="rounded-lg p-1.5 text-af-muted hover:bg-af-surface-2" aria-label="Close">✕</button></div>
            {!selectedUser ? (
              <>
                <label className="block text-sm font-medium text-af-text-2">Search account</label>
                <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Username or display name..." className="af-field mt-1.5 w-full min-h-11 rounded-xl px-3.5 text-sm" autoFocus />
                <p className="mt-1.5 text-xs text-af-muted">Matches username/display name. Email is not shown. Minimum 2 characters.</p>
                <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
                  {searchingUsers && <div className="rounded-xl border border-af-border bg-af-surface px-3 py-3 text-sm text-af-muted">Searching accounts...</div>}
                  {!searchingUsers && userQuery.trim().length >= 2 && userResults.length === 0 && <div className="rounded-xl border border-dashed border-af-border bg-af-surface/50 px-3 py-4 text-sm text-af-muted">No matching accounts found.</div>}
                  {userResults.map((u) => {
                    const isSelf = actorId === u.id; const disabled = Boolean(u.existingRole) || isSelf;
                    return (<button key={u.id} type="button" disabled={disabled} onClick={() => setSelectedUser(u)} className="flex w-full items-center gap-3 rounded-xl border border-af-border bg-af-surface px-3 py-2.5 text-left transition hover:border-af-brand/30 hover:bg-af-surface-2 disabled:cursor-not-allowed disabled:opacity-55">
                      <Avatar src={u.avatarUrl} name={u.displayName || u.username || "?"} size={36} />
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-af-text">{u.displayName || u.username || "Unknown"}</div><div className="truncate text-xs text-af-muted">@{u.username || "unknown"}</div></div>
                      {u.existingRole && <span className="text-xs text-af-muted">Already {ROLE_LABEL[u.existingRole] || "staff"}</span>}
                      {isSelf && <span className="text-xs text-af-muted">Your account</span>}
                    </button>);
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-af-border bg-af-surface p-3"><div className="flex items-center gap-3"><Avatar src={selectedUser.avatarUrl} name={selectedUser.displayName || selectedUser.username || "?"} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-af-text">{selectedUser.displayName || selectedUser.username || "Unknown"}</div><div className="truncate text-xs text-af-muted">@{selectedUser.username || "unknown"}</div></div><button type="button" onClick={() => { setSelectedUser(null); setAddConfirm(false); }} className="text-xs font-medium text-af-brand-soft hover:text-af-brand">Change</button></div></div>
                <fieldset className="mt-4"><legend className="text-sm font-medium text-af-text-2">Role</legend><div className="mt-2 space-y-2">{(["moderator","senior_moderator","administrator"] as const).map((r) => {
                  const adminBlocked = r === "administrator" && !actorIsAdmin;
                  return (<label key={r} className={"flex cursor-pointer gap-3 rounded-xl border p-3 transition " + (addRole === r ? "border-af-brand/40 bg-af-brand/10" : "border-af-border bg-af-surface hover:border-af-brand/20") + (adminBlocked ? " cursor-not-allowed opacity-50" : "")}>
                    <input type="radio" name="add-role" checked={addRole === r} disabled={adminBlocked} onChange={() => setAddRole(r)} className="mt-1 accent-af-brand" />
                    <div><div className="text-sm font-medium text-af-text">{ROLE_LABEL[r]} {adminBlocked && <span className="ml-1 text-xs font-normal text-af-muted">(Administrator only)</span>}</div><div className="mt-0.5 text-xs leading-relaxed text-af-muted">{ROLE_DESC[r]}</div></div>
                  </label>);
                })}</div></fieldset>
                <label className="mt-4 block"><span className="text-sm font-medium text-af-text-2">Reason / note</span><textarea value={addReason} onChange={(e) => setAddReason(e.target.value)} rows={3} maxLength={500} placeholder="Why is this account being appointed?" className="af-field mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm" /></label>
                {!addConfirm ? (
                  <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={resetAdd} className="min-h-10 rounded-xl border border-af-border px-4 text-sm font-medium text-af-text-2 hover:bg-af-surface-2">Cancel</button><button type="button" disabled={!addReason.trim() || (addRole === "administrator" && !actorIsAdmin)} onClick={() => setAddConfirm(true)} className="min-h-10 rounded-xl bg-af-brand px-4 text-sm font-semibold text-white hover:bg-af-brand-hover disabled:opacity-50">Review appointment</button></div>
                ) : (
                  <div className="mt-5 rounded-xl border border-af-brand/25 bg-af-brand/10 p-4"><div className="text-sm font-semibold text-af-text">Confirm appointment</div><p className="mt-1 text-sm text-af-text-2">Appoint <strong>@{selectedUser.username}</strong> as <strong>{ROLE_LABEL[addRole]}</strong>? This action will be recorded in the moderation audit log.</p><div className="mt-4 flex justify-end gap-2"><button type="button" disabled={submitting} onClick={() => setAddConfirm(false)} className="min-h-10 rounded-xl border border-af-border bg-af-bg px-4 text-sm font-medium text-af-text-2 hover:bg-af-surface-2 disabled:opacity-50">Back</button><button type="button" disabled={submitting} onClick={() => void submitAdd()} className="min-h-10 rounded-xl bg-af-brand px-4 text-sm font-semibold text-white hover:bg-af-brand-hover disabled:opacity-50">{submitting ? "Appointing..." : "Confirm appointment"}</button></div></div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {changeTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Change role">
          <div className="w-full max-w-lg rounded-2xl border border-af-border bg-af-bg p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-af-text">Change role</h2>
            <p className="mt-1 text-sm text-af-muted">Update the staff role for <strong className="text-af-text">@{changeTarget.username}</strong>. This will be audited.</p>
            <div className="mt-4 space-y-2">{(["moderator","senior_moderator","administrator"] as const).map((r) => {
              const adminBlocked = r === "administrator" && !actorIsAdmin;
              return (<label key={r} className={"flex cursor-pointer gap-3 rounded-xl border p-3 " + (changeRole === r ? "border-af-brand/40 bg-af-brand/10" : "border-af-border bg-af-surface") + (adminBlocked ? " cursor-not-allowed opacity-50" : "")}><input type="radio" name="change-role" checked={changeRole === r} disabled={adminBlocked} onChange={() => setChangeRole(r)} className="mt-1 accent-af-brand" /><div><div className="text-sm font-medium text-af-text">{ROLE_LABEL[r]}</div><div className="text-xs text-af-muted">{ROLE_DESC[r]}</div></div></label>);
            })}</div>
            <label className="mt-4 block"><span className="text-sm font-medium text-af-text-2">Reason</span><textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)} rows={3} className="af-field mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Why is this role changing?" /></label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={submitting} onClick={() => setChangeTarget(null)} className="min-h-10 rounded-xl border border-af-border px-4 text-sm font-medium text-af-text-2 hover:bg-af-surface-2">Cancel</button><button type="button" disabled={submitting || !changeReason.trim() || changeRole === changeTarget.role || (changeRole === "administrator" && !actorIsAdmin)} onClick={() => void submitChangeRole()} className="min-h-10 rounded-xl bg-af-brand px-4 text-sm font-semibold text-white hover:bg-af-brand-hover disabled:opacity-50">{submitting ? "Saving..." : "Confirm role change"}</button></div>
          </div>
        </div>
      )}

      {removeTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Remove from staff">
          <div className="w-full max-w-lg rounded-2xl border border-af-border bg-af-bg p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-af-text">Remove from staff</h2>
            <p className="mt-2 text-sm text-af-text-2">Remove <strong>@{removeTarget.username}</strong> ({ROLE_LABEL[removeTarget.role] || removeTarget.role}) from staff? They will lose moderator access. This action is recorded in the audit log.</p>
            <label className="mt-4 block"><span className="text-sm font-medium text-af-text-2">Reason (optional)</span><textarea value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} rows={2} className="af-field mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm" placeholder="Reason for removal" /></label>
            <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={submitting} onClick={() => setRemoveTarget(null)} className="min-h-10 rounded-xl border border-af-border px-4 text-sm font-medium text-af-text-2 hover:bg-af-surface-2">Cancel</button><button type="button" disabled={submitting} onClick={() => void submitRemove()} className="min-h-10 rounded-xl bg-red-500/90 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">{submitting ? "Removing..." : "Confirm removal"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
