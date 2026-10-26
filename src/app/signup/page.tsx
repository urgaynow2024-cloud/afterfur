"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) { setError("Username must be 3-20 characters (letters, numbers, underscore)."); return; }
    if (!ageOk || !termsOk) { setError("Please confirm age eligibility and accept the terms."); return; }
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { username } } });
    setLoading(false);
    if (error) setError(error.message);
    else window.location.href = "/signin";
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <section className="hidden md:flex flex-col justify-between bg-gradient-to-br from-af-surface to-af-bg p-10 border-r border-af-border">
        <div>
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-af-accent">After</span>Fur
          </div>
          <p className="mt-1 text-sm text-af-muted">Social media, after dark.</p>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Join the community.</h1>
          <p className="mt-4 text-af-muted max-w-md">
            Create your account to share art, follow creators, and take part in the furry community.
          </p>
        </div>
        <div className="text-xs text-af-muted">© AfterFur</div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-af-border bg-af-surface p-8 shadow-xl">
          <h2 className="text-2xl font-semibold">Create your account</h2>
          <p className="mt-1 text-sm text-af-muted">You must be 18 or older to join AfterFur.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-af-muted mb-1">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full rounded-lg border border-af-border bg-af-surface-2 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-af-accent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-af-muted mb-1">Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full rounded-lg border border-af-border bg-af-surface-2 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-af-accent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-af-muted mb-1">Password</label>
              <div className="relative">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPw ? "text" : "password"} required className="w-full rounded-lg border border-af-border bg-af-surface-2 px-3 py-2.5 text-sm pr-16 focus:outline-none focus:ring-2 focus:ring-af-accent" />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-af-muted hover:text-af-text">
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-af-muted mb-1">Confirm password</label>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required className="w-full rounded-lg border border-af-border bg-af-surface-2 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-af-accent" />
            </div>
            <label className="flex items-start gap-2 text-xs text-af-muted">
              <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="mt-0.5" />
              I confirm I am 18 years of age or older.
            </label>
            <label className="flex items-start gap-2 text-xs text-af-muted">
              <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} className="mt-0.5" />
              I accept the <a href="/terms" className="text-af-accent hover:underline">Terms of Service</a> and <a href="/privacy" className="text-af-accent hover:underline">Privacy Policy</a>.
            </label>
            {error && <p className="text-sm text-af-danger">{error}</p>}
            <button disabled={loading} className="w-full rounded-lg bg-af-accent px-4 py-2.5 text-sm font-semibold text-black hover:bg-af-accent-hover disabled:opacity-40 transition">
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
          <p className="mt-4 text-sm text-af-muted">
            Already have an account? <a href="/signin" className="text-af-accent hover:underline">Sign in</a>
          </p>
        </div>
      </section>
    </div>
  );
}
