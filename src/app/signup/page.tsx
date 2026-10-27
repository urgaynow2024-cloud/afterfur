"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SignUpState = "idle" | "submitting" | "confirm-email" | "success" | "error";

const SIGNUP_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  }) as Promise<T>;
}

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<SignUpState>("idle");
  const [info, setInfo] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "submitting") return;
    setError("");
    setInfo("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      setState("error");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) {
      setError("Username must be 3-20 characters (letters, numbers, underscore).");
      setState("error");
      return;
    }
    if (!ageOk || !termsOk) {
      setError("Please confirm age eligibility and accept the terms.");
      setState("error");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      setState("error");
      return;
    }

    setState("submitting");

    try {
      const usernameClean = username.trim().toLowerCase();
      const emailClean = email.trim().toLowerCase();

      // Check if username already taken to give clearer errors
      const existingProfileResult: any = await withTimeout(
        supabase.from("profiles").select("id").ilike("username", usernameClean).maybeSingle() as any,
        SIGNUP_TIMEOUT_MS,
        "Request timed out. Please check your connection and try again."
      );
      if (existingProfileResult?.data) {
        setError("That username is already taken.");
        setState("error");
        return;
      }

      const signUpResult: any = await withTimeout(
        supabase.auth.signUp({
          email: emailClean,
          password,
          options: {
            data: { username: usernameClean },
            emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
          },
        }) as any,
        SIGNUP_TIMEOUT_MS,
        "Sign up timed out. Please check your connection and try again."
      );

      const authError = (signUpResult as any)?.error;
      const authData: any = (signUpResult as any)?.data;

      if (authError) {
        const msg = authError.message || "Sign up failed.";
        // If user already exists, don't claim new account creation failed
        if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("user already")) {
          setError("An account with this email may already exist. Try signing in instead.");
        } else {
          setError(msg);
        }
        setState("error");
        return;
      }

      const userId = authData?.user?.id;
      const session = authData?.session;

      if (userId && session) {
        // Create profile if it doesn't exist
        try {
            const { error: profileError }: any = await withTimeout(
              supabase.from("profiles").insert({ id: userId, username: usernameClean }) as any,
              SIGNUP_TIMEOUT_MS,
              "Profile creation timed out."
            );
            if (profileError) {
              // If duplicate (trigger or race), that's okay - continue
              if (!profileError.message?.toLowerCase().includes("duplicate") && !profileError.code?.includes("23505")) {
                // Partial success: auth account created but profile failed
                setError("Account created but profile setup failed. You can sign in and complete your profile.");
                setState("error");
                return;
              }
            }
        } catch (profileErr: any) {
          // Don't block on profile creation timeout if auth succeeded with session
          console.error("Profile creation issue:", profileErr);
        }
        setState("success");
        router.push("/");
        return;
      }

      if (userId && !session) {
        // Email confirmation required. The database trigger creates the profile after confirmation.
        setInfo("Account created. Check your email for a confirmation link.");
        setState("confirm-email");
        return;
      }

      // Fallback
      setInfo("Check your email to confirm your account.");
      setState("confirm-email");
    } catch (err: any) {
      if (err?.message?.includes("timed out")) {
        setError(err.message);
      } else {
        setError(err?.message || "Something went wrong. Please try again.");
      }
      setState("error");
    }
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
            {info && state === "confirm-email" && (
              <div className="rounded-lg border border-af-accent/40 bg-af-accent/10 p-3 text-sm text-af-text">
                {info}
              </div>
            )}
            {state === "confirm-email" ? (
              <button type="button" onClick={() => router.push("/signin")} className="w-full rounded-lg bg-af-accent px-4 py-2.5 text-sm font-semibold text-black hover:bg-af-accent-hover transition">
                Go to Sign In
              </button>
            ) : (
              <button disabled={state === "submitting"} className="w-full rounded-lg bg-af-accent px-4 py-2.5 text-sm font-semibold text-black hover:bg-af-accent-hover disabled:opacity-40 transition">
                {state === "submitting" ? "Creating account..." : "Create account"}
              </button>
            )}
          </form>
          <p className="mt-4 text-sm text-af-muted">
            Already have an account? <a href="/signin" className="text-af-accent hover:underline">Sign in</a>
          </p>
        </div>
      </section>
    </div>
  );
}
