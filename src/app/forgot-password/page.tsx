"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Reset password</h1>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
        {error && <p className="text-sm text-af-danger">{error}</p>}
        {msg && <p className="text-sm text-af-muted">{msg}</p>}
        <button disabled={loading} className="w-full rounded-full bg-af-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>
    </main>
  );
}
