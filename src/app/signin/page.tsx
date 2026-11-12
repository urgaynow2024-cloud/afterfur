"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import {
  captureSessionToAccount,
  createTemporaryAuthClient,
  emitAccountSwitched,
  getClientForUser,
  getSavedAccount,
  readSavedAccounts,
  restoreAccountSession,
  setActiveUserId,
} from "@/lib/accountSessions";

function SignInInner() {
  const searchParams = useSearchParams();
  const switchId = searchParams.get("switch");
  const mode = searchParams.get("mode");
  const presetEmail = searchParams.get("email") || "";
  const reauth = searchParams.get("reauth") === "1";
  const { user, loading: authLoading, switchAccount } = useAuth();
  const savedTarget = switchId ? getSavedAccount(switchId) : null;
  const [email, setEmail] = useState(presetEmail || savedTarget?.email || "");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (presetEmail) setEmail(presetEmail);
    else if (savedTarget?.email) setEmail(savedTarget.email);
  }, [presetEmail, savedTarget?.email]);

  useEffect(() => {
    if (!switchId || reauth || mode === "add") return;
    if (user?.id === switchId) { router.replace("/"); return; }
    let cancelled = false;
    setStatus("Restoring saved session…");
    void restoreAccountSession(switchId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        emitAccountSwitched(switchId);
        router.replace("/");
        router.refresh();
        return;
      }
      setStatus("");
      setError(result.message || "Session expired. Please sign in again.");
    });
    return () => { cancelled = true; };
  }, [switchId, reauth, mode, user?.id, router]);

  const isAddFlow = mode === "add";
  const isSwitchFlow = Boolean(switchId) || reauth;
  const title = isAddFlow ? "Add an account" : isSwitchFlow ? "Switch account" : "Welcome back";
  const subtitle = isAddFlow
    ? "Authenticate this account once. It stays saved on this device so you can switch without re-entering your password while its session remains valid."
    : isSwitchFlow
      ? "If your saved session is still valid, AfterFur restores it automatically. Otherwise sign in again to continue."
      : "Sign in to continue to AfterFur.";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");
    setLoading(true);
    try {
      if (isAddFlow) {
        const temp = createTemporaryAuthClient();
        if (!temp) { setError("Supabase is not configured."); return; }
        const { error } = await temp.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setError(error.message); return; }
        const captured = await captureSessionToAccount(temp);
        if ("error" in captured) { setError(captured.error); return; }
        emitAccountSwitched(captured.userId);
        router.replace("/");
        router.refresh();
        return;
      }

      if (switchId) {
        const client = getClientForUser(switchId);
        if (!client) { setError("Supabase is not configured."); return; }
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setError(error.message); return; }
        setActiveUserId(switchId);
        emitAccountSwitched(switchId);
        router.replace("/");
        router.refresh();
        return;
      }

      const temp = createTemporaryAuthClient();
      if (!temp) { setError("Supabase is not configured."); return; }
      const { error } = await temp.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setError(error.message); return; }
      const captured = await captureSessionToAccount(temp);
      if ("error" in captured) { setError(captured.error); return; }
      emitAccountSwitched(captured.userId);
      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-af-bg md:grid md:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
      <section className="hidden flex-col justify-between border-r border-af-border bg-af-surface p-10 md:flex xl:p-16">
        <div>
          <div className="text-2xl font-bold tracking-tight"><span className="text-af-brand">After</span>Fur</div>
          <p className="mt-1 text-sm text-af-muted">Social media, after dark.</p>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Your community.<br/>Your space.</h1>
          <p className="mt-4 text-af-muted max-w-md">An 18+ social platform built for furry creators and the community. Share art, connect with people, and control what you see.</p>
        </div>
        <div className="text-xs text-af-muted">© AfterFur</div>
      </section>

      <section className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-4 sm:p-8 md:min-h-screen">
        <div className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-af-muted">{subtitle}</p>

          {user && isAddFlow ? (
            <div className="mt-4 rounded-lg border border-af-border bg-af-surface-2/40 p-3 text-sm text-af-text">
              Current account: <span className="font-medium">{user.email ?? user.id}</span>. Adding another account keeps this session saved and switches to the new account.
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="signin-email" className="mb-1 block text-xs font-medium text-af-text-2">Email</label>
              <input id="signin-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="af-field w-full px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="signin-password" className="mb-1 block text-xs font-medium text-af-text-2">Password</label>
              <div className="relative">
                <input id="signin-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} type={showPw ? "text" : "password"} required={!(switchId && !reauth && !isAddFlow)} disabled={loading || Boolean(status && !error)} className="af-field w-full px-3 pr-16 text-sm disabled:opacity-60" />
                <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded px-2 text-xs text-af-muted hover:bg-af-surface-2 hover:text-af-text">
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Link href="/forgot-password" className="text-af-accent hover:underline">Forgot password?</Link>
            </div>
            {status ? <p className="rounded-md border border-af-border bg-af-surface-2/40 p-3 text-sm text-af-text-2">{status}</p> : null}
            {error && <p role="alert" className="rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{error}</p>}
            <button disabled={loading || authLoading || Boolean(status && !error)} className="min-h-11 w-full rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Signing in..." : status && !error ? "Restoring..." : isAddFlow ? "Add account" : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-sm text-af-muted">New here? <Link href="/signup" className="font-medium text-af-brand-soft hover:underline">Create an account</Link></p>
        </div>
      </section>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-af-bg" />}>
      <SignInInner />
    </Suspense>
  );
}
