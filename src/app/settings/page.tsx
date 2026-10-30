"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { callRpc } from "@/lib/rpc";
import { loadMyMembershipStatus, claimFoundingPrime, loadFoundingStatus, loadFoundingRemaining, type MembershipStatus } from "@/lib/pawpass";
import { Separator } from "@/components/ui/separator";
import ProfileCustomisationStudio from "@/components/settings/ProfileCustomisationStudio";
import { parseProfileCustomisation, type ProfileCustomisation } from "@/lib/profileCustomisation";

const SETTINGS_SECTIONS = [
  { id: "account", label: "Account" },
  { id: "security", label: "Security" },
  { id: "privacy", label: "Privacy" },
  { id: "notifications", label: "Notifications" },
  { id: "accessibility", label: "Accessibility" },
  { id: "appearance", label: "Appearance" },
  { id: "membership", label: "Membership and Prime" },
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

  if (!user) return <Shell><PageHeader title="Settings" /><EmptyState title="Sign in to manage settings" body="Account settings require authentication." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  const matching = SETTINGS_SECTIONS.filter((s) => s.label.toLowerCase().includes(settingsQuery.toLowerCase()));

  return (
    <Shell>
      <PageHeader title="Settings" />
      {user.app_metadata?.afterfur_staff_admin === true && <div className="px-4 sm:px-6 space-y-2"><Link href="/staff/badges" className="af-action-secondary">Manage staff badges</Link><Link href="/staff/membership" className="af-action-secondary">Manage memberships</Link></div>}
      <div className="space-y-3">
        <input value={settingsQuery} onChange={(e) => setSettingsQuery(e.target.value)} placeholder="Search settings" className="af-field w-full text-sm" />
        <nav aria-label="Settings sections" className="flex flex-wrap gap-2 rounded-lg border border-af-border bg-af-surface p-2">
          {matching.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-md px-3 py-1.5 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">{s.label}</a>
          ))}
          {settingsQuery && matching.length === 0 && <span className="px-3 py-1.5 text-xs text-af-muted">No matching settings.</span>}
        </nav>
      </div>

      <section id="account" aria-labelledby="account-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="account-heading" className="text-base font-semibold text-af-text">Account</h2>
        <p className="mt-1 text-sm leading-relaxed text-af-muted">Signed in as {user.email || "unknown"}. User ID: {user.id || "—"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/edit-profile" className="inline-flex min-h-10 items-center justify-center rounded-md bg-af-brand px-4 text-xs font-semibold text-white">Edit profile</Link>
        </div>
      </section>

      <Separator className="mt-6 mb-2" />
      <section id="security" aria-labelledby="security-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="security-heading" className="text-base font-semibold text-af-text">Security and account access</h2>
        <p className="mt-1 text-sm leading-relaxed text-af-muted">Password recovery is handled through the existing authentication flow.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/forgot-password" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Reset password</Link>
        </div>
      </section>

      <Separator className="mt-6 mb-2" />
      <section id="privacy" aria-labelledby="privacy-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="privacy-heading" className="text-base font-semibold text-af-text">Privacy and safety</h2>
        <p className="mt-1 text-sm leading-relaxed text-af-muted">Privacy controls are documented in the Privacy Policy. Blocking and visibility enforcement are not yet implemented.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/privacy" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Privacy Policy</Link>
          <Link href="/safety" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Safety</Link>
        </div>
      </section>

      <Separator className="mt-6 mb-2" />
      <section id="notifications" aria-labelledby="notifications-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="notifications-heading" className="text-base font-semibold text-af-text">Notifications</h2>
        <p className="mt-1 text-sm leading-relaxed text-af-muted">Notification preference persistence is not yet implemented. Badge awards and social notifications continue to use the existing notification system.</p>
      </section>

      <Separator className="mt-6 mb-2" />
      <section id="accessibility" aria-labelledby="accessibility-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="accessibility-heading" className="text-base font-semibold text-af-text">Accessibility</h2>
        <p className="mt-1 text-sm leading-relaxed text-af-muted">AfterFur respects your operating system&apos;s reduced-motion preference. Animations and transitions are disabled when Reduce Motion is enabled.</p>
      </section>

      <Separator className="mt-6 mb-2" />
      <section id="appearance" aria-labelledby="appearance-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="appearance-heading" className="text-base font-semibold text-af-text">Appearance</h2>
        <p className="mt-1 text-sm leading-relaxed text-af-muted">Private interface preferences are stored separately and affect only your own account. They are not visible to other users.</p>
        {privateError && <p role="alert" className="mt-3 rounded-md border border-af-danger/40 bg-af-danger/10 px-3 py-2 text-sm text-af-danger">{privateError}</p>}
        {privateMsg && <p role="status" className="mt-3 rounded-md border border-af-border bg-af-surface-2 px-3 py-2 text-sm text-af-text-2">{privateMsg}</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
        }} className="mt-3 af-btn af-btn-primary">{privateSaving ? "Saving…" : "Save private appearance"}</button>
      </section>

      <Separator className="mt-6 mb-2" />
      <section id="membership" aria-labelledby="membership-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
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
          <h3 className="text-sm font-semibold text-af-text">Planned benefits (not yet available)</h3>
          <ul className="mt-2 space-y-1 text-xs text-af-muted">
            <li>Extra bookmark folders</li>
            <li>Advanced search filters</li>
            <li>Analytics dashboard</li>
            <li>Monthly boosts</li>
            <li>Anniversary badges retained after expiry</li>
          </ul>
          <p className="mt-3 text-xs text-af-muted">Payment processing is not yet configured. No charges are made. Upgrade options will appear here when billing is enabled.</p>
        </div>
      </section>

      <Separator className="mt-6 mb-2" />
      <section id="resources" aria-labelledby="resources-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="resources-heading" className="text-base font-semibold text-af-text">Additional resources</h2>
        <p className="mt-1 text-sm leading-relaxed text-af-muted">Policies and support links.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/terms" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Terms of Service</Link>
          <Link href="/privacy" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Privacy Policy</Link>
          <Link href="/policies" className="inline-flex min-h-10 items-center justify-center rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">All policies</Link>
        </div>
      </section>
    </Shell>
  );
}

export const dynamic = 'force-dynamic';

