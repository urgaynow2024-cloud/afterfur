"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
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
    else router.push("/");
  }

  return (
    <div className="min-h-screen bg-af-bg md:grid md:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
      <section className="hidden flex-col justify-between border-r border-af-border bg-af-surface p-10 md:flex xl:p-16">
        <div>
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-af-brand">After</span>Fur
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

      <section className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-4 sm:p-8 md:min-h-screen">
        <div className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-af-muted">Sign in to continue to AfterFur.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="signin-email" className="mb-1 block text-xs font-medium text-af-text-2">Email</label>
              <input id="signin-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="af-field w-full px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="signin-password" className="mb-1 block text-xs font-medium text-af-text-2">Password</label>
              <div className="relative">
                <input id="signin-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} type={showPw ? "text" : "password"} required className="af-field w-full px-3 pr-16 text-sm" />
                <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded px-2 text-xs text-af-muted hover:bg-af-surface-2 hover:text-af-text">
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <Link href="/forgot-password" className="text-af-accent hover:underline">Forgot password?</Link>
            </div>
            {error && <p role="alert" className="rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{error}</p>}
            <button disabled={loading} className="min-h-11 w-full rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-sm text-af-muted">
            New here? <Link href="/signup" className="font-medium text-af-brand-soft hover:underline">Create an account</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
