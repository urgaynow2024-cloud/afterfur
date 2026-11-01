"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type NotificationContextValue = {
  unreadCount: number;
  refresh: () => void;
  notify: (notification: { id: string; read: boolean }) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const COUNT_KEY = "afterfur:notification-unread";

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const mountedRef = useRef(true);

  const applyCount = useCallback((next: number) => {
    if (!mountedRef.current) return;
    setUnreadCount((current) => (current === next ? current : next));
  }, []);

  const refresh = useCallback(() => {
    const supabase = createClient();
    if (!supabase || !user) { applyCount(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const { count, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false);
        if (cancelled) return;
        if (error) return;
        applyCount(count ?? 0);
      } catch {
        // Keep the previous count when the server is unreachable.
      }
    })();
    return () => { cancelled = true; };
  }, [user, applyCount]);

  const notify = useCallback((notification: { id: string; read: boolean }) => {
    setUnreadCount((current) => Math.max(0, current + (notification.read ? -1 : 1)));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (loading || !user) { applyCount(0); return; }
    const cleanup = refresh();
    return cleanup;
  }, [loading, user, refresh]);

  useEffect(() => {
    if (loading || !user) {
      if (subscriptionRef.current) { subscriptionRef.current.unsubscribe(); subscriptionRef.current = null; }
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    const channel = supabase
      .channel(`afterfur-notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { read?: boolean } | null;
          if (row && row.read === false) {
            setUnreadCount((current) => current + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { read?: boolean } | null;
          if (row && row.read === true) {
            setUnreadCount((current) => Math.max(0, current - 1));
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // Realtime is optional; polling fallback is handled by refresh().
        }
      });
    subscriptionRef.current = channel;
    return () => {
      if (subscriptionRef.current) { subscriptionRef.current.unsubscribe(); subscriptionRef.current = null; }
      supabase.removeChannel(channel);
    };
  }, [loading, user]);

  useEffect(() => () => {
    if (subscriptionRef.current) { subscriptionRef.current.unsubscribe(); subscriptionRef.current = null; }
  }, []);

  const value = { unreadCount, refresh, notify };
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationCount() {
  return useContext(NotificationContext);
}