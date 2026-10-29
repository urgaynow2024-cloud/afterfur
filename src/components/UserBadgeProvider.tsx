"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

type BadgeContextValue = { badgesFor: (userId: string) => string[] | null; requestBadges: (userId: string) => void; refreshBadges: (userId: string) => void };
const BadgeContext = createContext<BadgeContextValue | null>(null);

export function UserBadgeProvider({ children }: { children: ReactNode }) {
  const [badges, setBadges] = useState<Record<string, string[]>>({});
  const loaded = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const timer = useRef<number | null>(null);

  const flush = useCallback(async () => {
    timer.current = null;
    const userIds = [...pending.current];
    pending.current.clear();
    if (!userIds.length) return;
    const supabase = createClient();
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc("get_public_badges", { p_user_ids: userIds });
      if (error) return;
      const next: Record<string, string[]> = Object.fromEntries(userIds.map((id) => [id, []]));
      for (const row of data ?? []) {
        (next[row.user_id] ??= []).push(row.badge_id);
      }
      userIds.forEach((id) => loaded.current.add(id));
      setBadges((current) => ({ ...current, ...next }));
    } catch {
      // Public badges are optional decoration; a temporary lookup failure leaves the row hidden.
    }
  }, []);

  const requestBadges = useCallback((userId: string) => {
    if (!userId || loaded.current.has(userId) || pending.current.has(userId)) return;
    pending.current.add(userId);
    if (pending.current.size >= 100) {
      void flush();
    } else if (timer.current === null) {
      timer.current = window.setTimeout(() => { void flush(); }, 0);
    }
  }, [flush]);

  const refreshBadges = useCallback((userId: string) => {
    loaded.current.delete(userId);
    setBadges((current) => { const next = { ...current }; delete next[userId]; return next; });
    requestBadges(userId);
  }, [requestBadges]);

  const badgesFor = useCallback((userId: string) => badges[userId] ?? null, [badges]);
  return <BadgeContext.Provider value={{ badgesFor, requestBadges, refreshBadges }}>{children}</BadgeContext.Provider>;
}

export function useUserBadges(userId: string | null | undefined): string[] | null {
  const context = useContext(BadgeContext);
  useEffect(() => {
    if (userId) context?.requestBadges(userId);
  }, [context, userId]);
  if (!context) return null;
  return userId ? context.badgesFor(userId) : null;
}

export function useRefreshUserBadges(): (userId: string) => void {
  return useContext(BadgeContext)?.refreshBadges ?? (() => undefined);
}
