"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else window.location.href = "/";
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
          <h1 className="text-4xl font-bold leading-tight">Your community.<br/>Your space.</h1>
          <p className="mt-4 text-af-muted max-w-md">
            An 18+ social platform built for furry creators and the community. Share art, connect with people, and control what you see.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-af-muted">
            <li>• Creator-first profiles and posts</li>
            <li>• Human-reviewed moderation</li>
            <li>• No AI-generated content</li>
            <li>• Granular content controls</li>
          </ul>
        </div>
        <div className="text-xs text-af-muted">© AfterFur</div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-af-border bg-af-surface p-8 shadow-xl">
          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-af-muted">Sign in to continue to AfterFur.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-af-muted mb-1">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="w-full rounded-lg border border-af-border bg-af-surface-2 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-af-accent" />
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
            <div className="flex items-center justify-between text-xs">
              <a href="/forgot-password" className="text-af-accent hover:underline">Forgot password?</a>
            </div>
            {error && <p className="text-sm text-af-danger">{error}</p>}
            <button disabled={loading} className="w-full rounded-lg bg-af-accent px-4 py-2.5 text-sm font-semibold text-black hover:bg-af-accent-hover disabled:opacity-40 transition">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-sm text-af-muted">
            New here? <a href="/signup" className="text-af-accent hover:underline">Create an account</a>
          </p>
        </div>
      </section>
    </div>
  );
}
