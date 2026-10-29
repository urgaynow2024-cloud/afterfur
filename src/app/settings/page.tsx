"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { loadMyMembershipStatus, claimFoundingPrime, loadFoundingStatus, loadFoundingRemaining, type MembershipStatus } from "@/lib/pawpass";

export default function Settings() {
  const { user } = useAuth();
  const [settingsQuery, setSettingsQuery] = useState("");
  const [membershipState, setMembershipState] = useState<{ loading: boolean; error: string; status: MembershipStatus | null }>({ loading: true, error: "", status: null });
  const [foundingState, setFoundingState] = useState<{ loading: boolean; error: string; claimed: boolean; claimedAt: string | null; expiresAt: string | null; remaining: number | null }>({ loading: true, error: "", claimed: false, claimedAt: null, expiresAt: null, remaining: null });
  const [privatePrefs, setPrivatePrefs] = useState<{ theme: string; accent: string }>({ theme: "default", accent: "#8b5cf6" });
  const [privateSaving, setPrivateSaving] = useState(false);
  const [privateMsg, setPrivateMsg] = useState("");
  const [privateError, setPrivateError] = useState("");
  const [publicCustom, setPublicCustom] = useState<{ accent: string; usernameColor: string; displayNameColor: string; effect: string }>({ accent: "#8b5cf6", usernameColor: "#ffffff", displayNameColor: "#ffffff", effect: "none" });
  const [publicSaving, setPublicSaving] = useState(false);
  const [publicMsg, setPublicMsg] = useState("");
  const [publicError, setPublicError] = useState("");
  const [accent, setAccent] = useState<string | null>(null);
  const [accentSaving, setAccentSaving] = useState(false);
  const [accentError, setAccentError] = useState("");
  const [accentMsg, setAccentMsg] = useState("");

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase as any).rpc("get_my_ui_preferences").then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase.from("profiles").select("profile_customisation").eq("id", user.id).maybeSingle() as any).then(({ data }: any) => {
        if (cancelled || !data?.profile_customisation || typeof data.profile_customisation !== "object") return;
        const d = data.profile_customisation as Record<string, unknown>;
        setPublicCustom({
          accent: typeof d.accent === "string" ? d.accent : "#8b5cf6",
          usernameColor: typeof d.usernameColor === "string" ? d.usernameColor : "#ffffff",
          displayNameColor: typeof d.displayNameColor === "string" ? d.displayNameColor : "#ffffff",
          effect: typeof d.effect === "string" ? d.effect : "none",
        });
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!user) { setAccent(null); return; }
      const supabase = createClient();
      if (!supabase) return;
      void supabase.rpc("get_my_profile_accent").then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setAccentError(error.message); return; }
        setAccent((data as string | null) ?? null);
      });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  // eslint-disable-next-line react-hooks/purity
  const isPrime = membershipState.status !== null && (membershipState.status.status === "active" || membershipState.status.status === "cancel_at_period_end") && !!membershipState.status.currentPeriodEnd && new Date(membershipState.status.currentPeriodEnd).getTime() > Date.now();

  if (!user) return <Shell><PageHeader title="Settings" /><EmptyState title="Sign in to manage settings" body="Account settings require authentication." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Settings" />
      {user.app_metadata?.afterfur_staff_admin === true && <div className="px-4 pt-4 sm:px-6"><Link href="/staff/badges" className="af-action-secondary">Manage staff badges</Link></div>}
      {user.app_metadata?.afterfur_staff_admin === true && <div className="px-4 pt-2 sm:px-6"><Link href="/staff/membership" className="af-action-secondary">Manage memberships</Link></div>}
      <div className="space-y-2">
        <input value={settingsQuery} onChange={(e) => setSettingsQuery(e.target.value)} placeholder="Search settings" className="af-field w-full px-3 text-sm" />
        <nav aria-label="Settings sections" className="flex flex-wrap gap-2 rounded-lg border border-af-border bg-af-surface p-2">
          {[
            { href: "#membership", label: "Membership" },
            { href: "#appearance", label: "Appearance" },
            { href: "#public", label: "Public" },
            { href: "#founding", label: "Founding" },
          ].filter((s) => s.label.toLowerCase().includes(settingsQuery.toLowerCase())).map((s) => (
            <a key={s.href} href={s.href} className="rounded-md px-3 py-1.5 text-xs font-medium text-af-text-2 hover:bg-af-surface-2 hover:text-af-text">{s.label}</a>
          ))}
          {settingsQuery && !["Membership","Appearance","Public","Founding"].some((l) => l.toLowerCase().includes(settingsQuery.toLowerCase())) && (
            <span className="px-3 py-1.5 text-xs text-af-muted">No matching settings.</span>
          )}
        </nav>
      </div>
      <section id="resources" aria-labelledby="resources-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="resources-heading" className="text-base font-semibold text-af-text">Additional resources</h2>
        <p className="mt-1 text-xs text-af-muted">Policies and support links.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/terms" className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Terms of Service</Link>
          <Link href="/privacy" className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Privacy Policy</Link>
          <Link href="/policies" className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">All policies</Link>
        </div>
      </section>
      <section id="security" aria-labelledby="security-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="security-heading" className="text-base font-semibold text-af-text">Security and account access</h2>
        <p className="mt-1 text-xs text-af-muted">Manage password recovery through the existing authentication flow.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/forgot-password" className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Reset password</Link>
        </div>
      </section>
      <section id="privacy" aria-labelledby="privacy-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="privacy-heading" className="text-base font-semibold text-af-text">Privacy and safety</h2>
        <p className="mt-1 text-xs text-af-muted">Privacy controls are documented in the Privacy Policy. Blocking and visibility enforcement are not yet implemented.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/privacy" className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Privacy Policy</Link>
          <Link href="/safety" className="min-h-9 rounded-md border border-af-border-strong px-4 text-xs font-medium text-af-text-2 hover:bg-af-surface-2">Safety</Link>
        </div>
      </section>
      <section id="notifications" aria-labelledby="notifications-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="notifications-heading" className="text-base font-semibold text-af-text">Notifications</h2>
        <p className="mt-1 text-xs text-af-muted">Notification preference persistence is not yet implemented. Badge awards and social notifications continue to use the existing notification system.</p>
      </section>
      <section id="accessibility" aria-labelledby="accessibility-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="accessibility-heading" className="text-base font-semibold text-af-text">Accessibility and appearance</h2>
        <p className="mt-1 text-xs text-af-muted">Private interface preferences are stored separately and affect only your account.</p>
        <p className="mt-3 text-xs text-af-muted">Appearance settings are managed in the My Appearance section.</p>
      </section>
      <section id="account" aria-labelledby="account-heading" className="mt-4 rounded-xl border border-af-border bg-af-surface p-4 sm:p-5">
        <h2 id="account-heading" className="text-base font-semibold text-af-text">Account</h2>
        <p className="mt-1 text-xs text-af-muted">Signed in as {user?.email || "unknown"}. User ID: {user?.id || "—"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/edit-profile" className="min-h-9 rounded-md bg-af-brand px-4 text-xs font-semibold text-white">Edit profile</Link>
        </div>
      </section>
      <section aria-labelledby="pawpass-heading" className="mt-8 border-t border-af-border pt-5">
          <h2 id="pawpass-heading" className="text-base font-semibold">PawPass membership</h2>
          <p className="mt-1 text-sm leading-relaxed text-af-muted">Membership status is read from a verified provider entitlement. AfterFur Prime is not enabled unless billing configures an active entitlement.</p>
          {membershipState.loading ? <p role="status" className="mt-3 text-sm text-af-muted">Checking membership </p> : membershipState.error ? <p role="status" className="mt-3 text-sm text-af-muted">Verified membership status is not available: {membershipState.error}</p> : !membershipState.status ? <p role="status" className="mt-3 text-sm text-af-muted">No verified PawPass membership is connected to this account.</p> : membershipState.status.status === "active" || membershipState.status.status === "cancel_at_period_end" ? <p role="status" className="mt-3 text-sm text-af-text-2">PawPass {membershipState.status.source === "owner_test" ? "(test mode) " : ""}entitlement active through {membershipState.status.currentPeriodEnd ? new Date(membershipState.status.currentPeriodEnd).toLocaleDateString() : "the current period"}.</p> : <p role="status" className="mt-3 text-sm text-af-muted">Membership is {membershipState.status.status}. Source: {membershipState.status.source}. Earned anniversary badges remain on your profile.</p>}
          <div className="mt-4 rounded-lg border border-af-border bg-af-surface-2 p-4">
            <h3 className="text-sm font-semibold text-af-text">Profile accent colour (Prime benefit)</h3>
            <p className="mt-1 text-xs text-af-muted">Choose an accent colour for your profile. Available to PawPass Prime members only.</p>
            {accentError && <p role="alert" className="mt-2 text-xs text-af-danger">{accentError}</p>}
            {accentMsg && <p role="status" className="mt-2 text-xs text-af-text-2">{accentMsg}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {["default", "purple", "blue", "emerald", "amber", "rose"].map((colour) => {
                const selected = (accent ?? "default") === colour;
  // eslint-disable-next-line react-hooks/purity
                  const isPrime = membershipState.status !== null && (membershipState.status.status === "active" || membershipState.status.status === "cancel_at_period_end") && !!membershipState.status.currentPeriodEnd && new Date(membershipState.status.currentPeriodEnd).getTime() > Date.now();
                const disabled = !isPrime && colour !== "default";
                return (
                  <button
                    key={colour}
                    type="button"
                    disabled={disabled || accentSaving}
                    onClick={async () => {
                      const supabase = createClient();
                      if (!supabase) return;
                      setAccentSaving(true); setAccentError(""); setAccentMsg("");
                      const { error } = await supabase.rpc("update_profile_accent", { p_accent: colour });
                      if (error) { setAccentError(error.message); }
                      else { setAccent(colour === "default" ? null : colour); setAccentMsg("Accent colour saved."); }
                      setAccentSaving(false);
                    }}
                    className={`min-h-9 rounded-md border px-3 text-xs font-medium capitalize transition-colors ${selected ? "border-af-brand bg-af-brand/15 text-af-brand-soft" : "border-af-border-strong text-af-text-2 hover:bg-af-surface"} ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
                    aria-pressed={selected}
                  >
                    {colour}
                  </button>
                );
              })}
            </div>
            {!isPrime && <p className="mt-3 text-xs text-af-muted">Activate PawPass Prime to unlock custom accent colours.</p>}
          </div>
          <div className="mt-4 rounded-lg border border-af-border bg-af-surface-2 p-4">
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
                  className="mt-2 min-h-9 rounded-md bg-af-brand px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Claim founding Prime
                </button>
                {foundingState.remaining === 0 && <p className="mt-2 text-xs text-af-muted">All 50 founding rewards have been claimed.</p>}
              </>
            )}
          </div>
          <div className="mt-4 rounded-lg border border-af-border bg-af-surface-2 p-4">
            <h3 className="text-sm font-semibold text-af-text">My Appearance (private)</h3>
            <p className="mt-1 text-xs text-af-muted">Affects only your own interface. Not visible to other users.</p>
            {privateError && <p role="alert" className="mt-2 text-xs text-af-danger">{privateError}</p>}
            {privateMsg && <p role="status" className="mt-2 text-xs text-af-text-2">{privateMsg}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-af-text-2">Interface theme
                <select value={privatePrefs.theme} onChange={(e) => setPrivatePrefs({ ...privatePrefs, theme: e.target.value })} className="af-field mt-1 w-full px-2 text-xs">
                  <option value="default">Default</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>
              <label className="text-xs text-af-text-2">Personal accent
                <input type="color" value={privatePrefs.accent} onChange={(e) => setPrivatePrefs({ ...privatePrefs, accent: e.target.value })} className="mt-1 h-9 w-full" />
              </label>
            </div>
            <button type="button" disabled={privateSaving} onClick={async () => {
              const supabase = createClient();
              if (!supabase) return;
              setPrivateSaving(true); setPrivateError(""); setPrivateMsg("");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error } = await (supabase as any).rpc("update_ui_preferences", { p_preferences: privatePrefs });
              if (error) setPrivateError(error.message); else setPrivateMsg("Saved.");
              setPrivateSaving(false);
            }} className="mt-3 min-h-9 rounded-md bg-af-brand px-4 text-xs font-semibold text-white disabled:opacity-50">{privateSaving ? "Saving�" : "Save private appearance"}</button>
          </div>
          <div className="mt-4 rounded-lg border border-af-border bg-af-surface-2 p-4">
            <h3 className="text-sm font-semibold text-af-text">Public Profile Customisation (Prime)</h3>
            <p className="mt-1 text-xs text-af-muted">Visible to other users. Requires active Prime entitlement.</p>
            {publicError && <p role="alert" className="mt-2 text-xs text-af-danger">{publicError}</p>}
            {publicMsg && <p role="status" className="mt-2 text-xs text-af-text-2">{publicMsg}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-af-text-2">Profile accent
                <input type="color" value={publicCustom.accent} onChange={(e) => setPublicCustom({ ...publicCustom, accent: e.target.value })} className="mt-1 h-9 w-full" />
              </label>
              <label className="text-xs text-af-text-2">Username colour
                <input type="color" value={publicCustom.usernameColor} onChange={(e) => setPublicCustom({ ...publicCustom, usernameColor: e.target.value })} className="mt-1 h-9 w-full" />
              </label>
              <label className="text-xs text-af-text-2">Display-name colour
                <input type="color" value={publicCustom.displayNameColor} onChange={(e) => setPublicCustom({ ...publicCustom, displayNameColor: e.target.value })} className="mt-1 h-9 w-full" />
              </label>
              <label className="text-xs text-af-text-2">Effect
                <select value={publicCustom.effect} onChange={(e) => setPublicCustom({ ...publicCustom, effect: e.target.value })} className="af-field mt-1 w-full px-2 text-xs">
                  <option value="none">None</option>
                  <option value="glow">Glow</option>
                  <option value="neon">Neon</option>
                  <option value="gradient">Gradient</option>
                </select>
              </label>
            </div>
            <button type="button" disabled={publicSaving} onClick={async () => {
              const supabase = createClient();
              if (!supabase) return;
              setPublicSaving(true); setPublicError(""); setPublicMsg("");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error } = await (supabase as any).rpc("update_profile_customisation", { p_config: publicCustom });
              if (error) setPublicError(error.message); else setPublicMsg("Saved.");
              setPublicSaving(false);
            }} className="mt-3 min-h-9 rounded-md bg-af-brand px-4 text-xs font-semibold text-white disabled:opacity-50">{publicSaving ? "Saving�" : "Save public customisation"}</button>
          </div>
          <div className="mt-4 rounded-lg border border-af-border bg-af-surface-2 p-4">
            <h3 className="text-sm font-semibold text-af-text">Planned benefits (not yet available)</h3>
            <ul className="mt-2 space-y-1 text-xs text-af-muted">
              <li>Profile customisation and display-name colours</li>
              <li>Extra bookmark folders</li>
              <li>Advanced search filters</li>
              <li>Analytics dashboard</li>
              <li>Monthly boosts</li>
              <li>Anniversary badges retained after expiry</li>
            </ul>
            <p className="mt-3 text-xs text-af-muted">Payment processing is not yet configured. No charges are made. Upgrade options will appear here when billing is enabled.</p>
          </div>
        </section>
    </Shell>
  );
}
