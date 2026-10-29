"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setLoading(true);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/reset-password` });
    setLoading(false);
    if (error) setError(error.message);
    else setMsg("If an account exists, a reset link has been sent.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-af-bg p-4 sm:p-8">
      <section className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 sm:p-8">
      <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
      <p className="mt-1 text-sm leading-relaxed text-af-muted">We’ll email a secure password reset link if an account matches.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label htmlFor="reset-email" className="block text-xs font-medium text-af-text-2">Email</label>
        <input id="reset-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="af-field w-full px-3 text-sm" />
        {error && <p role="alert" className="text-sm text-af-danger">{error}</p>}
        {msg && <p role="status" className="rounded-md border border-af-border bg-af-surface-2 p-3 text-sm text-af-text-2">{msg}</p>}
        <button disabled={loading} className="min-h-11 w-full rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
      <Link href="/signin" className="mt-4 inline-flex min-h-10 items-center text-sm font-medium text-af-brand-soft hover:underline">Back to sign in</Link>
      </section>
    </main>
  );
}
