"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { callRpc } from "@/lib/rpc";
import { loadMyMembershipStatus, claimFoundingPrime, loadFoundingStatus, loadFoundingRemaining, type MembershipStatus } from "@/lib/pawpass";

import ProfileCustomisationStudio from "@/components/settings/ProfileCustomisationStudio";
import { parseProfileCustomisation, type ProfileCustomisation } from "@/lib/profileCustomisation";
import { getIncomingFollowRequests, approveFollowRequest, rejectFollowRequest, type IncomingFollowRequest } from "@/lib/followRequests";

const SETTINGS_SECTIONS = [
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy" },
  { id: "blocked-accounts", label: "Blocked accounts" },
  { id: "notifications", label: "Notifications" },
  { id: "accessibility", label: "Accessibility" },
  { id: "appearance", label: "Appearance" },
  { id: "membership", label: "Membership and Prime" },
  { id: "account-data", label: "Account & Data" },
] as const;

export default function Settings() {
  const { user } = useAuth();
  const [settingsQuery, setSettingsQuery] = useState("");
  const [membershipState, setMembershipState] = useState<{ loading: boolean; error: string; status: MembershipStatus | null }>({ loading: true, error: "", status: null });
  const [foundingState, setFoundingState] = useState<{ loading: boolean; error: string; claimed: boolean; claimedAt: string | null; expiresAt: string | null; remaining: number | null }>({ loading: true, error: "", claimed: false, claimedAt: null, expiresAt: null, remaining: null });
  const [privatePrefs, setPrivatePrefs] = useState<{ theme: string; accent: string }>({ theme: "default", accent: "#8b5cf6" });
  const [privateSaving, setPrivateSaving] = useState(false);
  const [privateMsg, setPrivateMsg] = useState("");
  const [privateError, setPrivateError] = useState("");
  const [customisation, setCustomisation] = useState<ProfileCustomisation>({});
  const [profileName, setProfileName] = useState<{ display_name: string | null; username: string | null }>({ display_name: null, username: null });
  const [notifPrefs, setNotifPrefs] = useState({ likes: true, replies: true, reposts: true, follows: true, mentions: true });
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyMsg, setPrivacyMsg] = useState("");
  const [privacyError, setPrivacyError] = useState("");
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState("");
  const [notifError, setNotifError] = useState("");
const [blockedOpen, setBlockedOpen] = useState(false);
const [blockedError, setBlockedError] = useState("");
const [blockedLoading, setBlockedLoading] = useState(false);
const [unblockingIds, setUnblockingIds] = useState<Set<string>>(new Set());
const [blockedReload, setBlockedReload] = useState(0);
const [incomingRequests, setIncomingRequests] = useState<IncomingFollowRequest[]>([]);
const [incomingLoading, setIncomingLoading] = useState(false);
const [incomingError, setIncomingError] = useState("");
const [incomingActionIds, setIncomingActionIds] = useState<Set<string>>(new Set());
const [incomingMsg, setIncomingMsg] = useState("");
const [blockedMsg, setBlockedMsg] = useState("");
const [blockedAccounts, setBlockedAccounts] = useState<{ id: string; username: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const [deletionOption, setDeletionOption] = useState<"immediate_24h" | "scheduled_14d" | "scheduled_30d">("immediate_24h");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionMsg, setDeletionMsg] = useState("");
  const [deletionError, setDeletionError] = useState("");
  const [pendingDeletion, setPendingDeletion] = useState<{ id: string; option: string; scheduled_deletion_at: string; status: string } | null>(null);
  const [exportStatus, setExportStatus] = useState<{ id: string; status: string; download_url?: string } | null>(null);
  const [requestingExport, setRequestingExport] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!user) { setMembershipState({ loading: false, error: "", status: null }); return; }
      const supabase = createClient();
      if (!supabase) { setMembershipState({ loading: false, error: "PawPass status is unavailable.", status: null }); return; }
      void loadMyMembershipStatus(supabase).then((result) => {
        if (cancelled) return;
        setMembershipState({ loading: false, error: result.error ?? "", status: result.status });
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!user) { setFoundingState({ loading: false, error: "", claimed: false, claimedAt: null, expiresAt: null, remaining: null }); return; }
      const supabase = createClient();
      if (!supabase) { setFoundingState({ loading: false, error: "Founding status unavailable.", claimed: false, claimedAt: null, expiresAt: null, remaining: null }); return; }
      void Promise.all([loadFoundingStatus(supabase), loadFoundingRemaining(supabase)]).then(([f, r]) => {
        if (cancelled) return;
        setFoundingState({ loading: false, error: f.error ?? r.error ?? "", claimed: f.claimed, claimedAt: f.claimedAt, expiresAt: f.expiresAt, remaining: r.remaining });
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!user) return;
      const supabase = createClient();
      if (!supabase) return;
      void callRpc(supabase, "get_my_ui_preferences", undefined).then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setPrivateError(error.message); return; }
        if (data && typeof data === "object") {
          const d = data as Record<string, unknown>;
          setPrivatePrefs({
            theme: typeof d.theme === "string" ? d.theme : "default",
            accent: typeof d.accent === "string" ? d.accent : "#8b5cf6",
          });
          if (d.notifications && typeof d.notifications === "object") {
            const n = d.notifications as Record<string, unknown>;
            setNotifPrefs({
              likes: n.likes !== false,
              replies: n.replies !== false,
              reposts: n.reposts !== false,
              follows: n.follows !== false,
              mentions: n.mentions !== false,
            });
          }
        }
      });
      void supabase.from("profiles").select("display_name, username, profile_customisation").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (cancelled) return;
        if (data) {
          setProfileName({ display_name: data.display_name ?? null, username: data.username ?? null });
          if (data.profile_customisation && typeof data.profile_customisation === "object") {
            setCustomisation(parseProfileCustomisation(data.profile_customisation));
          }
        } else {
          setCustomisation({});
        }
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  // eslint-disable-next-line react-hooks/purity
  const isPrime = membershipState.status !== null && (membershipState.status.status === "active" || membershipState.status.status === "cancel_at_period_end") && !!membershipState.status.currentPeriodEnd && new Date(membershipState.status.currentPeriodEnd).getTime() > Date.now();

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    let cancelled = false;
    const load = async () => {
      const { data: del } = await (supabase as any).from("account_deletion_requests").select("id,option,scheduled_deletion_at,status").eq("user_id", user.id);
      const pending = (del ?? []).filter((d: any) => d.status === "pending").sort((a: any, b: any) => new Date(b.requested_at ?? 0).getTime() - new Date(a.requested_at ?? 0).getTime())[0] ?? null;
      if (!cancelled && pending) setPendingDeletion(pending as any);
      const { data: exp } = await (supabase as any).from("data_export_requests").select("id,status").eq("user_id", user.id);
      const latestExp = (exp ?? []).sort((a: any, b: any) => new Date(b.requested_at ?? 0).getTime() - new Date(a.requested_at ?? 0).getTime())[0] ?? null;
      if (!cancelled && latestExp) setExportStatus(latestExp as any);
    };
    void load();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    let cancelled = false;
    setBlockedLoading(true);
    setBlockedError("");
    const load = async () => {
      try {
        const { data: blocks, error: blocksError } = await (supabase as any).from("blocks").select("blocked_id").eq("blocker_id", user.id);
        if (blocksError) { if (!cancelled) { setBlockedError(blocksError.message); setBlockedLoading(false); } return; }
        const ids = (blocks ?? []).map((b: { blocked_id: string }) => b.blocked_id);
        if (ids.length === 0) { if (!cancelled) { setBlockedAccounts([]); setBlockedLoading(false); } return; }
        const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids);
        if (profilesError) { if (!cancelled) { setBlockedError(profilesError.message); setBlockedLoading(false); } return; }
        if (!cancelled) setBlockedAccounts((profiles ?? []) as any);
      } catch (e) {
        if (!cancelled) setBlockedError((e as Error)?.message || "Failed to load blocked accounts.");
      }
      if (!cancelled) setBlockedLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [user, blockedOpen, blockedReload]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    let cancelled = false;
    setIncomingLoading(true);
    setIncomingError("");
    void getIncomingFollowRequests(supabase).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setIncomingError(error); else setIncomingRequests(data);
      setIncomingLoading(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) return <Shell><PageHeader title="Settings" /><EmptyState title="Sign in to manage settings" body="Account settings require authentication." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  const matching = SETTINGS_SECTIONS.filter((s) => s.label.toLowerCase().includes(settingsQuery.toLowerCase()));

  return (
    <Shell>
      <PageHeader title="Settings" />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row">
          <aside className="md:w-64 md:shrink-0">
            <div className="md:sticky md:top-20 space-y-4 rounded-2xl border border-af-border bg-af-surface p-4 shadow-sm">
              <input value={settingsQuery} onChange={(e) => setSettingsQuery(e.target.value)} placeholder="Search settings" className="af-field w-full text-sm" />
              <nav aria-label="Settings sections" className="flex flex-col gap-1">
                {matching.map((s) => (
                  <a key={s.id} href={`#${s.id}`} className="rounded-xl px-3 py-2 text-sm font-medium text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">{s.label}</a>
                ))}
                {settingsQuery && matching.length === 0 && <span className="px-3 py-2 text-xs text-af-muted">No matching settings.</span>}
              </nav>
            </div>
          </aside>

          <main className="min-w-0 flex-1 space-y-6">
            {user.app_metadata?.afterfur_staff_admin === true && (
              <div className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm">
                <div className="flex flex-wrap gap-2">
                  <Link href="/staff/badges" className="af-action-secondary">Manage staff badges</Link>
                  <Link href="/staff/membership" className="af-action-secondary">Manage memberships</Link>
                </div>
              </div>
            )}

            <section id="account" aria-labelledby="account-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="account-heading" className="text-base font-semibold text-af-text">Account</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">Signed in as {user.email || "unknown"}. User ID: {user.id || "—"}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/edit-profile" className="inline-flex min-h-10 items-center justify-center rounded-md bg-af-brand px-4 text-xs font-semibold text-white">Edit profile</Link>
              </div>
            </section>

            <section id="security" aria-labelledby="security-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="security-heading" className="text-base font-semibold text-af-text">Security and account access</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">Password recovery is handled through the existing authentication flow.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/forgot-password" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Reset password</Link>
              </div>
            </section>

             <section id="incoming-follow-requests" aria-labelledby="incoming-follow-requests-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
               <h2 id="incoming-follow-requests-heading" className="text-base font-semibold text-af-text">Incoming follow requests</h2>
               <p className="mt-1 text-sm leading-relaxed text-af-muted">Approve or reject requests to follow your private account.</p>
               {incomingMsg && <p role="status" className="mt-2 text-sm text-af-text-2">{incomingMsg}</p>}
               {incomingError && <p role="alert" className="mt-2 text-sm text-af-danger">{incomingError}</p>}
               {incomingLoading ? (
                 <p className="mt-3 text-sm text-af-muted">Loading…</p>
               ) : incomingRequests.length === 0 ? (
                 <p className="mt-3 text-sm text-af-muted">No pending requests.</p>
               ) : (
                 <ul className="mt-3 space-y-2">
                   {incomingRequests.map((r) => (
                     <li key={r.followerId} className="flex items-center justify-between gap-3 rounded-xl border border-af-border bg-af-surface-2 p-3">
                       <div className="flex items-center gap-3">
                         {r.avatarUrl ? <img src={r.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-af-surface-raised text-sm font-bold text-af-brand-soft">{(r.displayName || r.username || "?").slice(0,1).toUpperCase()}</div>}
                         <div>
                           <p className="text-sm font-medium text-af-text">{r.displayName || r.username}</p>
                           <p className="text-xs text-af-muted">@{r.username}</p>
                         </div>
                       </div>
                       <div className="flex gap-2">
                         <button type="button" disabled={incomingActionIds.has(r.followerId)} onClick={async () => {
                           const supabase = createClient(); if (!supabase || !user) return;
                           if (incomingActionIds.has(r.followerId)) return;
                           setIncomingActionIds((s) => new Set(s).add(r.followerId));
                           setIncomingMsg(""); setIncomingError("");
                           const res = await approveFollowRequest(supabase, r.followerId);
                           setIncomingActionIds((s) => { const n = new Set(s); n.delete(r.followerId); return n; });
                           if (!res.ok) { setIncomingError(res.error || "Failed to approve."); return; }
                           setIncomingRequests((list) => list.filter((x) => x.followerId !== r.followerId));
                           setIncomingMsg("Request approved.");
                         }} className="min-h-9 rounded-md bg-af-brand px-3 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
                         <button type="button" disabled={incomingActionIds.has(r.followerId)} onClick={async () => {
                           const supabase = createClient(); if (!supabase || !user) return;
                           if (incomingActionIds.has(r.followerId)) return;
                           setIncomingActionIds((s) => new Set(s).add(r.followerId));
                           setIncomingMsg(""); setIncomingError("");
                           const res = await rejectFollowRequest(supabase, r.followerId);
                           setIncomingActionIds((s) => { const n = new Set(s); n.delete(r.followerId); return n; });
                           if (!res.ok) { setIncomingError(res.error || "Failed to reject."); return; }
                           setIncomingRequests((list) => list.filter((x) => x.followerId !== r.followerId));
                           setIncomingMsg("Request rejected.");
                         }} className="min-h-9 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 disabled:opacity-50">Reject</button>
                       </div>
                     </li>
                   ))}
                 </ul>
               )}
             </section>

             <section id="privacy" aria-labelledby="privacy-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="privacy-heading" className="text-base font-semibold text-af-text">Privacy and safety</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">Privacy controls are documented in the Privacy Policy. Blocking and visibility enforcement are not yet implemented.</p>
              <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private account</label>
              <button type="button" disabled={privacySaving} onClick={async () => {
                const supabase = createClient();
                if (!supabase || !user) return;
                setPrivacySaving(true); setPrivacyError(""); setPrivacyMsg("");
                const { error } = await supabase.from("profiles").update({ is_private: isPrivate }).eq("id", user.id);
                if (error) setPrivacyError(error.message); else setPrivacyMsg("Saved.");
                setPrivacySaving(false);
              }} className="mt-4 min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">{privacySaving ? "Saving…" : "Save privacy"}</button>
              {privacyError && <p role="alert" className="mt-3 text-sm text-af-danger">{privacyError}</p>}
              {privacyMsg && <p role="status" className="mt-3 text-sm text-af-text-2">{privacyMsg}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/privacy" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Privacy Policy</Link>
                <Link href="/safety" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Safety</Link>
              </div>
            </section>

             <section id="blocked-accounts" aria-labelledby="blocked-accounts-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
               <div className="flex items-center justify-between gap-3">
                 <div>
                   <h2 id="blocked-accounts-heading" className="text-base font-semibold text-af-text">Blocked accounts</h2>
                   <p className="mt-1 text-sm leading-relaxed text-af-muted">{blockedAccounts.length} blocked</p>
                 </div>
                 <button type="button" onClick={() => setBlockedOpen((v) => !v)} className="min-h-9 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">
                   {blockedOpen ? "Hide" : "Show"}
                 </button>
               </div>
               {blockedOpen && (
                 <div className="mt-4">
                    {blockedLoading ? (
                      <p className="text-sm text-af-muted">Loading…</p>
                    ) : blockedError ? (
                      <div>
                        <p className="text-sm text-af-danger">{blockedError}</p>
                        <button type="button" onClick={() => setBlockedReload((n) => n + 1)} className="mt-2 min-h-9 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Retry</button>
                      </div>
                    ) : blockedAccounts.length === 0 ? (
                      <p className="text-sm text-af-muted">You haven't blocked anyone.</p>
                    ) : (
                     <ul className="space-y-2">
                       {blockedAccounts.map((p) => (
                         <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-af-border bg-af-surface-2 p-3">
                           <div className="flex items-center gap-3">
                             {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-af-surface-raised text-sm font-bold text-af-brand-soft">{(p.display_name || p.username).slice(0,1).toUpperCase()}</div>}
                             <div>
                               <p className="text-sm font-medium text-af-text">{p.display_name || p.username}</p>
                               <p className="text-xs text-af-muted">@{p.username}</p>
                             </div>
                           </div>
                            <button type="button" disabled={unblockingIds.has(p.id)} onClick={async () => {
                              if (!window.confirm("Unblock this user?")) return;
                              const supabase = createClient();
                              if (!supabase || !user) return;
                              if (unblockingIds.has(p.id)) return;
                              setUnblockingIds((s) => new Set(s).add(p.id));
                              setBlockedError("");
                              setBlockedMsg("");
                              const { error } = await (supabase as any).from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", p.id);
                              setUnblockingIds((s) => { const n = new Set(s); n.delete(p.id); return n; });
                              if (error) { setBlockedError(error.message || "Failed to unblock."); return; }
                              setBlockedAccounts((list) => list.filter((x) => x.id !== p.id));
                              setBlockedMsg("User unblocked.");
                            }} className="min-h-9 rounded-md border border-af-border px-3 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 disabled:opacity-50">{unblockingIds.has(p.id) ? "Unblocking…" : "Unblock"}</button>
                         </li>
                       ))}
                     </ul>
                   )}
                 </div>
               )}
             </section>

             <section id="notifications" aria-labelledby="notifications-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="notifications-heading" className="text-base font-semibold text-af-text">Notifications</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">Notification preferences are saved to your account. Enforcement depends on existing database triggers.</p>
              {notifError && <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-sm text-af-danger">{notifError}</p>}
              {notifMsg && <p role="status" className="mt-3 rounded-md border border-af-border bg-af-surface-2 px-3 py-2 text-sm text-af-text-2">{notifMsg}</p>}
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(["likes","replies","reposts","follows","mentions"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notifPrefs[k]} onChange={(e) => setNotifPrefs({ ...notifPrefs, [k]: e.target.checked })} /> {k}</label>
                ))}
              </div>
              <button type="button" disabled={notifSaving} onClick={async () => {
                const supabase = createClient();
                if (!supabase) return;
                setNotifSaving(true); setNotifError(""); setNotifMsg("");
                const { error } = await callRpc(supabase, "update_ui_preferences", { p_preferences: { ...privatePrefs, notifications: notifPrefs } });
                if (error) setNotifError(error.message); else setNotifMsg("Saved.");
                setNotifSaving(false);
              }} className="mt-4 min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">{notifSaving ? "Saving…" : "Save notification preferences"}</button>
            </section>

            <section id="accessibility" aria-labelledby="accessibility-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="accessibility-heading" className="text-base font-semibold text-af-text">Accessibility</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">AfterFur respects your operating system&apos;s reduced-motion preference. Animations and transitions are disabled when Reduce Motion is enabled.</p>
            </section>

            <section id="appearance" aria-labelledby="appearance-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="appearance-heading" className="text-base font-semibold text-af-text">Appearance</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">Private interface preferences are stored separately and affect only your own account. They are not visible to other users.</p>
              {privateError && <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-sm text-af-danger">{privateError}</p>}
              {privateMsg && <p role="status" className="mt-3 rounded-md border border-af-border bg-af-surface-2 px-3 py-2 text-sm text-af-text-2">{privateMsg}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-af-text-2">Interface theme</span>
                  <select value={privatePrefs.theme} onChange={(e) => setPrivatePrefs({ ...privatePrefs, theme: e.target.value })} className="af-field mt-0 w-full text-sm" aria-label="Interface theme">
                    <option value="default">Default</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-af-text-2">Personal accent colour</span>
                  <input type="color" value={privatePrefs.accent} onChange={(e) => setPrivatePrefs({ ...privatePrefs, accent: e.target.value })} className="af-field h-10 w-full cursor-pointer" aria-label="Personal accent colour" />
                </label>
              </div>
              <button type="button" disabled={privateSaving} onClick={async () => {
                const supabase = createClient();
                if (!supabase) return;
                setPrivateSaving(true); setPrivateError(""); setPrivateMsg("");
                const { error } = await callRpc(supabase, "update_ui_preferences", { p_preferences: privatePrefs });
                if (error) setPrivateError(error.message); else setPrivateMsg("Saved.");
                setPrivateSaving(false);
              }} className="mt-4 min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">{privateSaving ? "Saving…" : "Save private appearance"}</button>
            </section>

            <section id="membership" aria-labelledby="membership-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="membership-heading" className="text-base font-semibold text-af-text">Membership and Prime</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">Membership status is read from a verified provider entitlement. AfterFur Prime is not enabled unless billing configures an active entitlement.</p>
              {membershipState.loading ? <p role="status" className="mt-3 text-sm text-af-muted">Checking membership status</p> : membershipState.error ? <p role="status" className="mt-3 text-sm text-af-muted">Verified membership status is not available: {membershipState.error}</p> : !membershipState.status ? <p role="status" className="mt-3 text-sm text-af-muted">No verified PawPass membership is connected to this account.</p> : membershipState.status.status === "active" || membershipState.status.status === "cancel_at_period_end" ? <p role="status" className="mt-3 text-sm text-af-text-2">PawPass {membershipState.status.source === "owner_test" ? "(test mode) " : ""}entitlement active through {membershipState.status.currentPeriodEnd ? new Date(membershipState.status.currentPeriodEnd).toLocaleDateString() : "the current period"}.</p> : <p role="status" className="mt-3 text-sm text-af-muted">Membership is {membershipState.status.status}. Source: {membershipState.status.source}. Earned anniversary badges remain on your profile.</p>}

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-af-text">Founding 50 reward</h3>
                <p className="mt-1 text-xs text-af-muted">Limited to 50 successful claims. 12 months of Prime from claim time. No payment method required.</p>
                {foundingState.loading ? <p className="mt-2 text-xs text-af-muted">Checking founding status </p> : foundingState.error ? <p className="mt-2 text-xs text-af-danger">{foundingState.error}</p> : foundingState.claimed ? <p className="mt-2 text-xs text-af-text-2">Claimed on {foundingState.claimedAt ? new Date(foundingState.claimedAt).toLocaleString() : "?"}; active through {foundingState.expiresAt ? new Date(foundingState.expiresAt).toLocaleDateString() : "?"}.</p> : (
                  <>
                    <p className="mt-2 text-xs text-af-muted">{foundingState.remaining ?? 0} of 50 rewards remaining.</p>
                    <button
                      type="button"
                      disabled={foundingState.remaining === 0 || foundingState.remaining === null}
                      onClick={async () => {
                        const supabase = createClient();
                        if (!supabase) return;
                        const { ok, error } = await claimFoundingPrime(supabase);
                        if (error || !ok) { setFoundingState((s) => ({ ...s, error: error ?? "Claim failed." })); return; }
                        const [f, r] = await Promise.all([loadFoundingStatus(supabase), loadFoundingRemaining(supabase)]);
                        setFoundingState({ loading: false, error: "", claimed: f.claimed, claimedAt: f.claimedAt, expiresAt: f.expiresAt, remaining: r.remaining });
                        const m = await loadMyMembershipStatus(supabase);
                        setMembershipState({ loading: false, error: m.error ?? "", status: m.status });
                      }}
                      className="mt-2 min-h-10 rounded-md bg-af-brand px-4 text-xs font-semibold text-white hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Claim founding Prime
                    </button>
                    {foundingState.remaining === 0 && <p className="mt-2 text-xs text-af-muted">All 50 founding rewards have been claimed.</p>}
                  </>
                )}
              </div>

              <ProfileCustomisationStudio
                isPrime={isPrime}
                customisation={customisation}
                displayName={profileName.display_name ?? profileName.username ?? "Your name"}
                username={profileName.username ?? "yourname"}
              />

               <div className="mt-6">
                <h3 className="text-sm font-semibold text-af-text">PawPass benefits</h3>
                <ul className="mt-2 space-y-1 text-xs text-af-text-2">
                  <li>Bookmark folders {isPrime ? "(available)" : "(requires PawPass)"}</li>
                  <li>Advanced search filters {isPrime ? "(available)" : "(requires PawPass)"}</li>
                  <li>Creator analytics {isPrime ? "(available)" : "(requires PawPass)"}</li>
                  <li>Monthly Discovery Boosts {isPrime ? "(available)" : "(requires PawPass)"}</li>
                  <li>Membership recognition and anniversary badges {isPrime ? "(available)" : "(requires PawPass)"}</li>
                  <li>Animated GIF avatars and banners {isPrime ? "(available)" : "(requires PawPass)"}</li>
                </ul>
                <p className="mt-3 text-xs text-af-muted">Payment processing is not yet configured. No charges are made. Upgrade options will appear here when billing is enabled.</p>
              </div>
            </section>

            <section id="resources" aria-labelledby="resources-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
              <h2 id="resources-heading" className="text-base font-semibold text-af-text">Additional resources</h2>
              <p className="mt-1 text-sm leading-relaxed text-af-muted">Policies and support links.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/terms" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Terms of Service</Link>
                <Link href="/privacy" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Privacy Policy</Link>
                <Link href="/policies" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">All policies</Link>
              </div>
            </section>
             <section id="account-data" aria-labelledby="account-data-heading" className="rounded-2xl border border-af-border bg-af-surface p-5 shadow-sm sm:p-6">
               <h2 id="account-data-heading" className="text-base font-semibold text-af-text">Account & data rights</h2>
               <p className="mt-1 text-sm leading-relaxed text-af-muted">Request a copy of your data or delete your account.</p>

               <div className="mt-4 space-y-3">
                 <h3 className="text-sm font-semibold text-af-text">Request my data</h3>
                 <p className="text-xs text-af-muted">Generate a secure, expiring download of your personal account data.</p>
                 <button type="button" disabled={requestingExport} onClick={async () => {
                   const supabase = createClient();
                   if (!supabase || !user) return;
                   setRequestingExport(true); setDeletionError(""); setDeletionMsg("");
                   const { data, error } = await (supabase as any).rpc("request_data_export");
                   if (error) { setDeletionError(error.message); setRequestingExport(false); return; }
                   const res = await fetch("/api/account/export", { method: "POST", headers: { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` } });
                   const json = await res.json();
                   if (!res.ok) { setDeletionError(json.error || "Export failed."); setRequestingExport(false); return; }
                   setExportStatus({ id: json.requestId, status: "completed", download_url: json.downloadUrl });
                   setDeletionMsg("Export ready. Use the download link below.");
                   setRequestingExport(false);
                 }} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{requestingExport ? "Preparing…" : "Request my data"}</button>
                 {exportStatus?.download_url && (
                   <p className="text-xs text-af-muted">Download: <a href={exportStatus.download_url} className="text-af-brand-soft underline">secure link (expires soon)</a></p>
                 )}
                 {exportStatus?.status === "completed" && !exportStatus.download_url && <p className="text-xs text-af-danger">Export completed but download link is unavailable. Request a new export.</p>}
                 {exportStatus && exportStatus.status !== "completed" && <p className="text-xs text-af-muted">Export status: {exportStatus.status}</p>}
               </div>

               <div className="mt-6 space-y-3">
                 <h3 className="text-sm font-semibold text-af-text">Delete my account</h3>
                 {pendingDeletion ? (
                   <div className="rounded-xl border border-af-danger/40 bg-af-danger/10 p-4">
                     <p className="text-sm text-af-danger">Deletion scheduled: {new Date(pendingDeletion.scheduled_deletion_at).toLocaleString()}</p>
                     <p className="mt-1 text-xs text-af-muted">Option: {pendingDeletion.option}. Status: {pendingDeletion.status}.</p>
                     <button type="button" disabled={deleting} onClick={async () => {
                       const supabase = createClient();
                       if (!supabase || !pendingDeletion) return;
                       if (!window.confirm("Cancel scheduled account deletion?")) return;
                       setDeleting(true); setDeletionError(""); setDeletionMsg("");
                       const { error } = await (supabase as any).rpc("cancel_account_deletion", { p_request_id: pendingDeletion.id });
                       if (error) setDeletionError(error.message); else { setDeletionMsg("Deletion cancelled."); setPendingDeletion(null); }
                       setDeleting(false);
                     }} className="mt-3 min-h-10 rounded-md border border-af-border-strong px-4 text-sm font-medium text-af-text hover:bg-af-surface-2 disabled:opacity-50">{deleting ? "Cancelling…" : "Cancel account deletion"}</button>
                   </div>
                 ) : (
                   <>
                     <div className="grid gap-2 sm:grid-cols-3">
                       {(["immediate_24h","scheduled_14d","scheduled_30d"] as const).map((opt) => (
                         <label key={opt} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-xs ${deletionOption === opt ? "border-af-brand bg-af-brand/10" : "border-af-border"}`}>
                           <input type="radio" name="deletionOption" checked={deletionOption === opt} onChange={() => setDeletionOption(opt)} />
                           <span>{opt === "immediate_24h" ? "Delete now (24h grace)" : opt === "scheduled_14d" ? "Delete in 14 days" : "Delete in 30 days"}</span>
                         </label>
                       ))}
                     </div>
                     <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} /> I understand this will permanently delete my account after the grace period.</label>
                     <button type="button" disabled={!confirmDelete || deleting} onClick={async () => {
                       const supabase = createClient();
                       if (!supabase || !user) return;
                       if (!window.confirm("Submit account deletion request?")) return;
                       setDeleting(true); setDeletionError(""); setDeletionMsg("");
                       const { data, error } = await (supabase as any).rpc("request_account_deletion", { p_option: deletionOption });
                       if (error) setDeletionError(error.message); else { setDeletionMsg("Deletion request created."); setPendingDeletion({ id: data, option: deletionOption, scheduled_deletion_at: new Date(Date.now() + (deletionOption === "immediate_24h" ? 86400000 : deletionOption === "scheduled_14d" ? 1209600000 : 2592000000)).toISOString(), status: "pending" }); setConfirmDelete(false); }
                       setDeleting(false);
                     }} className="mt-3 min-h-10 rounded-md bg-af-danger px-4 text-sm font-semibold text-white disabled:opacity-50">{deleting ? "Submitting…" : "Delete my account"}</button>
                   </>
                 )}
                 {deletionError && <p role="alert" className="mt-3 text-sm text-af-danger">{deletionError}</p>}
                 {deletionMsg && <p role="status" className="mt-3 text-sm text-af-text-2">{deletionMsg}</p>}
               </div>
             </section>
           </main>
        </div>
      </div>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';
