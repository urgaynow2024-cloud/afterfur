"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { captureSessionToAccount, emitAccountSwitched } from "@/lib/accountSessions";

type SignUpState = "idle" | "submitting" | "confirm-email" | "success" | "error";
type UsernameLookup = { data: { id: string } | null; error: { message: string } | null };
type SignUpResponse = { data: { user: { id: string } | null; session: object | null }; error: { message: string } | null };
type ProfileInsertResponse = { error: { message: string; code?: string } | null };

const SIGNUP_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    clearTimeout(timer);
  }) as Promise<T>;
}

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
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
    if (!displayName.trim()) { setError("Display name is required."); setState("error"); return; }
    if (!/^[a-z0-9_]{3,20}$/i.test(username)) {
      setError("Username must be 3-20 characters (letters, numbers, underscore).");
      setState("error");
      return;
    }
    if (!termsOk) {
      setError("Please accept the terms.");
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
      const existingProfileResult = await withTimeout(
        Promise.resolve(supabase.from("profiles").select("id").ilike("username", usernameClean).maybeSingle()) as PromiseLike<UsernameLookup>,
        SIGNUP_TIMEOUT_MS,
        "Request timed out. Please check your connection and try again."
      );
      if (existingProfileResult?.data) {
        setError("That username is already taken.");
        setState("error");
        return;
      }

      const signupStartedAt = new Date().toISOString();
      const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || "unknown";

      const signUpResult = await withTimeout(
        Promise.resolve(supabase.auth.signUp({
          email: emailClean,
          password,
          options: {
            data: { username: usernameClean, terms_accepted_version: "0.4", terms_accepted_at: new Date().toISOString() },
            emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
          },
        })) as PromiseLike<SignUpResponse>,
        SIGNUP_TIMEOUT_MS,
        "Sign up timed out. Please check your connection and try again."
      );

      const authError = signUpResult.error;
      const authData = signUpResult.data;
      const user = authData?.user ?? null;
      const session = authData?.session ?? null;
      const identities = (user as { identities?: unknown[] } | null)?.identities;

      console.info("signup:diagnostic", {
        timestamp: signupStartedAt,
        projectRef,
        hasUser: !!user,
        hasUserId: !!user?.id,
        identitiesEmpty: Array.isArray(identities) ? identities.length === 0 : null,
        hasSession: !!session,
        hasError: !!authError,
        errorCode: (authError as { code?: string })?.code ?? null,
        errorMessage: authError?.message ?? null,
      });

      if (authError) {
        const msg = authError.message || "Sign up failed.";
        if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("user already")) {
          setError("An account with this email may already exist. Try signing in instead.");
        } else {
          setError(msg);
        }
        setState("error");
        return;
      }

      const userId = user?.id;

      // Duplicate-account detection: Supabase returns a user with empty identities for an already-registered email.
      if (userId && Array.isArray(identities) && identities.length === 0) {
        console.info("signup:diagnostic", { timestamp: new Date().toISOString(), projectRef, duplicateAccountSuspected: true });
        setError("An account with this email may already exist. Try signing in instead.");
        setState("error");
        return;
      }

      if (userId && session) {
        // Persist the new session under the active account's isolated storage
        // key so a reload/next navigation does not fall back to a client with no
        // session. Sign-up may have happened on the legacy/default client.
        try {
          const captured = await captureSessionToAccount(supabase);
          if (!("error" in captured)) emitAccountSwitched(captured.userId);
        } catch (captureErr) {
          console.info("signup:captureSession", captureErr);
        }
        try {
            const { error: profileError } = await withTimeout(
              Promise.resolve(supabase.from("profiles").insert({ id: userId, username: usernameClean, display_name: displayName.trim(), terms_accepted_version: "0.4", terms_accepted_at: new Date().toISOString() })) as PromiseLike<ProfileInsertResponse>,
              SIGNUP_TIMEOUT_MS,
              "Profile creation timed out."
            );
            if (profileError) {
              if (!profileError.message?.toLowerCase().includes("duplicate") && !profileError.code?.includes("23505")) {
                setError("Account created but profile setup failed. You can sign in and complete your profile.");
                setState("error");
                return;
              }
            }
        } catch (profileErr: unknown) {
          console.error("Profile creation issue:", profileErr);
        }
        setState("success");
        router.push("/");
        return;
      }

      if (userId && !session) {
        setInfo("Account created. Check your email for a confirmation link.");
        setState("confirm-email");
        return;
      }

      setInfo("Check your email to confirm your account.");
      setState("confirm-email");
    } catch (err: unknown) {
      if ((err as { message?: string })?.message?.includes("timed out")) {
        setError((err as { message?: string })?.message || "Something went wrong. Please try again.");
      } else {
        setError((err as { message?: string })?.message || "Something went wrong. Please try again.");
      }
      setState("error");
    }
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
          <h1 className="text-4xl font-bold leading-tight">Join the community.</h1>
          <p className="mt-4 text-af-muted max-w-md">
            Create your account to share art, follow creators, and take part in the furry community.
          </p>
        </div>
        <div className="text-xs text-af-muted">© AfterFur</div>
      </section>

      <section className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-4 sm:p-8 md:min-h-screen">
        <div className="w-full max-w-md rounded-xl border border-af-border bg-af-surface p-5 sm:p-8">
          <h2 className="text-xl font-semibold tracking-tight">Create your account</h2>
          <p className="mt-1 text-sm text-af-muted">You must be 18 or older to join AfterFur.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="signup-email" className="mb-1 block text-xs font-medium text-af-text-2">Email</label>
              <input id="signup-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className="af-field w-full px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="signup-username" className="mb-1 block text-xs font-medium text-af-text-2">Username</label>
              <input id="signup-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required className="af-field w-full px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="signup-display-name" className="mb-1 block text-xs font-medium text-af-text-2">Display name</label>
              <input id="signup-display-name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={60} className="af-field w-full px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-1 block text-xs font-medium text-af-text-2">Password</label>
              <div className="relative">
                <input id="signup-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} type={showPw ? "text" : "password"} required className="af-field w-full px-3 pr-16 text-sm" />
                <button type="button" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-1/2 min-h-9 -translate-y-1/2 rounded px-2 text-xs text-af-muted hover:bg-af-surface-2 hover:text-af-text">
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="signup-confirm" className="mb-1 block text-xs font-medium text-af-text-2">Confirm password</label>
              <input id="signup-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required className="af-field w-full px-3 text-sm" />
            </div>
            <label className="flex min-h-10 items-start gap-3 text-sm leading-relaxed text-af-text-2">
              <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} className="mt-1 h-4 w-4 accent-af-brand" />
              I accept the <Link href="/terms" className="text-af-accent hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-af-accent hover:underline">Privacy Policy</Link>.
            </label>
            <p className="text-xs leading-relaxed text-af-muted">
              Age verification is a separate, staff-reviewed process. You can submit a request from your profile after signing up. Adult-content (After Dark) access requires both age verification and age-assurance approval.
            </p>
            {error && <p role="alert" className="rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{error}</p>}
            {info && state === "confirm-email" && (
              <div role="status" className="rounded-md border border-af-border-strong bg-af-surface-2 p-3 text-sm leading-relaxed text-af-text">
                {info}
              </div>
            )}
            {state === "confirm-email" ? (
              <button type="button" onClick={() => router.push("/signin")} className="min-h-11 w-full rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover">
                Go to Sign In
              </button>
            ) : (
              <button disabled={state === "submitting"} className="min-h-11 w-full rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
                {state === "submitting" ? "Creating account..." : "Create account"}
              </button>
            )}
          </form>
          <p className="mt-4 text-sm text-af-muted">
            Already have an account? <Link href="/signin" className="text-af-accent hover:underline">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  );
}
