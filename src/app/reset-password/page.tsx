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
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Set new password</h1>
      {done ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-af-muted">{msg}</p>
          <button onClick={() => router.push("/signin")} className="rounded-full bg-af-accent px-4 py-2 text-sm font-semibold text-black">Go to sign in</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="New password" disabled={loading} className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="Confirm password" disabled={loading} className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
          {error && <p className="text-sm text-af-danger">{error}</p>}
          <button disabled={loading} className="w-full rounded-full bg-af-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-40">
            {loading ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
    </main>
  );
}
