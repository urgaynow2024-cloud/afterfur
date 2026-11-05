"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { hasModerationNavAccess } from "@/lib/moderationClient";

export default function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const { user } = useAuth();
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    if (!user) {
      setCanModerate(false);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      if (id === requestId.current) setCanModerate(false);
      return;
    }
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        if (id === requestId.current) setCanModerate(false);
        return;
      }
      const res = await fetch("/api/moderation/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (id !== requestId.current) return;
      if (!res.ok) {
        setCanModerate(false);
        return;
      }
      const data = await res.json().catch(() => null);
      setCanModerate(hasModerationNavAccess(data));
    } catch {
      if (id === requestId.current) setCanModerate(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Re-check on auth state changes (login/logout/token refresh/role-relevant session changes).
    const supabase = createClient();
    if (!supabase) return;
    const sub = (supabase as any).auth?.onAuthStateChange?.(() => { void refresh(); });
    return () => { try { sub?.data?.subscription?.unsubscribe?.(); } catch {} };
  }, [refresh]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-af-text-2 transition-colors hover:bg-af-surface hover:text-af-text"
        aria-expanded={open}
      >
        <span aria-hidden="true" className="h-5 w-5 shrink-0 bg-current opacity-75" />
        More
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-af-border bg-af-surface p-2 shadow-lg">
          {canModerate && (
            <Link
              href="/moderator"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text"
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 shrink-0 bg-current opacity-80"
                style={{ maskImage: "url(/icons/afterfur/shield-check.svg)", maskPosition: "center", maskRepeat: "no-repeat", maskSize: "contain", WebkitMaskImage: "url(/icons/afterfur/shield-check.svg)", WebkitMaskPosition: "center", WebkitMaskRepeat: "no-repeat", WebkitMaskSize: "contain" } as any}
              />
              Moderation
            </Link>
          )}
          <Link href="/settings" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Settings and privacy</Link>
          <Link href="/privacy" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Privacy Policy</Link>
          <Link href="/terms" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Terms of Service</Link>
          <Link href="/safety" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm text-af-text-2 transition-colors hover:bg-af-surface-2 hover:text-af-text">Safety</Link>
        </div>
      )}
    </div>
  );
}
