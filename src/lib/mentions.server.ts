import { createServerClient } from "@/lib/supabase/server";
import { isNotificationEnabled } from "@/lib/notificationPreferences";

function extractMentions(text: string): string[] {
  const matches = text.match(/@([a-zA-Z0-9_]+)/g) || [];
  const set = new Set<string>();
  for (const m of matches) {
    const username = m.slice(1).toLowerCase();
    if (username) set.add(username);
  }
  return Array.from(set);
}

export async function createMentionNotifications(opts: { authorId: string; postId?: string; replyId?: string; content: string }) {
  const supabase = createServerClient();
  if (!supabase) return;
  try {
    const usernames = extractMentions(opts.content);
    if (usernames.length === 0) return;
    const { data: profiles } = await supabase.from("profiles").select("id,username").in("username", usernames);
    if (!profiles || profiles.length === 0) return;

    for (const p of profiles as any[]) {
      if (p.id === opts.authorId) continue;
      if (!(await isNotificationEnabled(p.id, "mentions"))) continue;
      // check blocks
      const { data: b1 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", opts.authorId).eq("blocked_id", p.id).limit(1);
      if ((b1||[]).length) continue;
      const { data: b2 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", p.id).eq("blocked_id", opts.authorId).limit(1);
      if ((b2||[]).length) continue;

      const payload: any = { actor_id: opts.authorId };
      if (opts.postId) payload.post_id = opts.postId;
      if (opts.replyId) payload.reply_id = opts.replyId;

      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", p.id)
        .eq("type", "mention")
        .contains("payload", payload)
        .limit(1);
      if ((existing||[]).length) continue;

      await supabase.from("notifications").insert({
        user_id: p.id,
        type: "mention",
        payload,
        read: false,
      });
    }
  } catch {}
}
