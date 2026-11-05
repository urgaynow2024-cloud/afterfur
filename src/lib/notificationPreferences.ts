import { createServerClient } from "@/lib/supabase/server";

export type NotificationPrefs = {
  likes: boolean;
  replies: boolean;
  reposts: boolean;
  follows: boolean;
  follow_requests: boolean;
  mentions: boolean;
  messages: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  likes: true,
  replies: true,
  reposts: true,
  follows: true,
  follow_requests: true,
  mentions: true,
  messages: true,
};

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const supabase = createServerClient();
  if (!supabase) return DEFAULT_PREFS;
  try {
    const { data } = await supabase.from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
    if (!data) return DEFAULT_PREFS;
    const d = data as any;
    return {
      likes: d.likes ?? true,
      replies: d.replies ?? true,
      reposts: d.reposts ?? true,
      follows: d.follows ?? true,
      follow_requests: d.follow_requests ?? true,
      mentions: d.mentions ?? true,
      messages: d.messages ?? true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function isNotificationEnabled(userId: string, type: keyof NotificationPrefs): Promise<boolean> {
  const prefs = await getNotificationPrefs(userId);
  return !!prefs[type];
}
