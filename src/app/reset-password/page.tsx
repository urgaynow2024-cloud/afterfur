"use client";
import { useState } from "react";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getSession();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setMsg("Password updated successfully. Please sign in with your new password.");
    setTimeout(() => router.push("/signin"), 2000);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-af-bg p-4 sm:p-8">
      <section className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">Set new password</h1>
      {done ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-af-muted">{msg}</p>
          <button onClick={() => router.push("/signin")} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white hover:bg-af-brand-hover">Go to sign in</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label htmlFor="new-password" className="block text-xs font-medium text-af-text-2">New password</label>
          <input id="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required disabled={loading} className="af-field w-full px-3 text-sm" />
          <label htmlFor="confirm-password" className="block text-xs font-medium text-af-text-2">Confirm password</label>
          <input id="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required disabled={loading} className="af-field w-full px-3 text-sm" />
          {error && <p role="alert" className="text-sm text-af-danger">{error}</p>}
          <button disabled={loading} className="min-h-11 w-full rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
      </section>
    </main>
  );
}
