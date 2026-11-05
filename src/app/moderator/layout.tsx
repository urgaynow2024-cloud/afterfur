"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Shell } from "@/components/Shell";

const NAV = [
  { href: "/moderator/dashboard", label: "Dashboard" },
  { href: "/moderator/reports", label: "Reports" },
  { href: "/moderator/users", label: "Users" },
  { href: "/moderator/content", label: "Content" },
  { href: "/moderator/appeals", label: "Appeals" },
  { href: "/moderator/staff", label: "Staff" },
  { href: "/moderator/audit-logs", label: "Audit logs" },
  { href: "/moderator/settings", label: "Settings" },
];

export default function ModeratorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<"loading" | "ok" | "denied" | "unauthorized">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      if (!supabase) { if (!cancelled) setState("denied"); return; }

      // Get a verified session token for server-side authorization. The server is
      // authoritative (trusted app_metadata.afterfur_staff_admin / moderator_roles).
      let { data: sessionData } = await supabase.auth.getSession();
      let token = sessionData?.session?.access_token;
      if (!token) {
        // Try refresh in case a valid session exists but access token is stale/missing.
        try { const r = await supabase.auth.refreshSession(); token = r.data.session?.access_token; } catch {}
      }
      if (!token) { if (!cancelled) setState("unauthorized"); return; }

      try {
        const res = await fetch("/api/moderation/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (cancelled) return;
        if (res.ok) { setState("ok"); return; }
        if (res.status === 401) { setState("unauthorized"); return; }
        // 403/other: deny (server-side check failed).
        setState("denied");
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") {
    return (
      <Shell>
        <div className="p-8 text-center text-af-muted">Checking moderator access…</div>
      </Shell>
    );
  }

  if (state === "unauthorized") {
    return (
      <Shell>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-af-text">Sign in required</h1>
          <p className="mt-2 text-sm text-af-muted">Sign in with an authorised staff account to access moderation.</p>
          <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-af-brand px-5 text-sm font-semibold text-white">Return home</Link>
        </div>
      </Shell>
    );
  }

  if (state === "denied") {
    return (
      <Shell>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-af-text">Moderator access required</h1>
          <p className="mt-2 text-sm text-af-muted">This area is restricted to authorised staff. All moderation APIs are protected server-side. If your account was just granted access, sign out and sign in again to refresh your session.</p>
          <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-af-brand px-5 text-sm font-semibold text-white">Return home</Link>
        </div>
      </Shell>
    );
  }

  return (
    <div className="min-h-screen bg-af-bg">
      <div className="border-b border-af-border bg-af-surface/60">
        <div className="mx-auto max-w-[var(--af-shell-width)] px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-af-muted">AfterFur Moderation</div>
          <nav className="flex flex-wrap gap-1.5" aria-label="Moderator navigation">
            {NAV.map((n) => {
              const active = pathname === n.href || pathname?.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-af-brand/15 text-af-brand-soft ring-1 ring-af-brand/25" : "text-af-text-2 hover:bg-af-surface hover:text-af-text"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
