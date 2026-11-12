"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { clearModerationMeCache, fetchModerationMe, hasModerationNavAccess } from "@/lib/moderationClient";
import { ACCOUNT_SWITCH_EVENT } from "@/lib/accountSessions";

export default function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [canModerate, setCanModerate] = useState(false);
  const { user, loading, session } = useAuth();

  const refresh = useCallback(async (force = false) => {
    // Do not request moderation access before auth initialization/session restoration completes.
    if (loading) return;
    if (!user) {
      setCanModerate(false);
      clearModerationMeCache();
      return;
    }
    const supabase = createClient();
    if (!supabase?.auth?.getSession) return;
    try {
      // Prefer session already restored by AuthProvider; fall back to active client session.
      let token = session?.access_token ?? null;
      if (!token) {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData?.session?.access_token ?? null;
      }
      // Temporary missing session (restoration/refresh in flight) must not be treated as permanent denial.
      if (!token) return;
      const data = await fetchModerationMe(token, { force });
      if (data) setCanModerate(hasModerationNavAccess(data));
    } catch {
      // Keep previous state on transient failures.
    }
  }, [user, loading, session?.access_token]);

  useEffect(() => { void refresh(false); }, [refresh]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase?.auth?.onAuthStateChange) return;
    let last = 0;
    const sub = supabase.auth.onAuthStateChange((event) => {
      // TOKEN_REFRESHED can fire frequently; throttle and only force on meaningful auth changes.
      const now = Date.now();
      const force = event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED";
      if (!force && now - last < 15_000) return;
      last = now;
      void refresh(force);
    });
    const onSwitch = () => { clearModerationMeCache(); void refresh(true); };
    if (typeof window !== "undefined") window.addEventListener(ACCOUNT_SWITCH_EVENT, onSwitch);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener(ACCOUNT_SWITCH_EVENT, onSwitch);
      try { sub?.data?.subscription?.unsubscribe?.(); } catch {}
    };
  }, [refresh]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-af-text-2 transition-colors hover:bg-af-surface hover:text-af-text"
        aria-expanded={open}
      >
        <span aria-hidden="true" className="h-5 w-5 shrink-0 bg-current opacity-75" style={{ maskImage: "url(/icons/afterfur/more-horizontal.svg)", WebkitMaskImage: "url(/icons/afterfur/more-horizontal.svg)", maskPosition: "center", WebkitMaskPosition: "center", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskSize: "contain", WebkitMaskSize: "contain" }} />
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
