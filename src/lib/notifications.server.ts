import { createServerClient } from "@/lib/supabase/server";
import { isNotificationEnabled } from "@/lib/notificationPreferences";

export async function createFollowNotification(opts: { followerId: string; followingId: string; isRequest: boolean }) {
  const supabase = createServerClient();
  if (!supabase) return;
  try {
    if (opts.followerId === opts.followingId) return;
    // Check blocks
    const { data: b1 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", opts.followerId).eq("blocked_id", opts.followingId).limit(1);
    if ((b1||[]).length) return;
    const { data: b2 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", opts.followingId).eq("blocked_id", opts.followerId).limit(1);
    if ((b2||[]).length) return;

    const type = opts.isRequest ? "follow_request" : "follow";
    const prefKey = opts.isRequest ? "follow_requests" : "follows";
    if (!(await isNotificationEnabled(opts.followingId, prefKey as any))) return;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", opts.followingId)
      .eq("type", type)
      .contains("payload", { actor_id: opts.followerId })
      .limit(1);
    if ((existing||[]).length) return;

    await supabase.from("notifications").insert({
      user_id: opts.followingId,
      type,
      payload: { actor_id: opts.followerId },
      read: false,
    });
  } catch {}
}

export async function createFollowAcceptedNotification(opts: { followerId: string; followingId: string }) {
  const supabase = createServerClient();
  if (!supabase) return;
  try {
    if (opts.followerId === opts.followingId) return;
    const { data: b1 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", opts.followerId).eq("blocked_id", opts.followingId).limit(1);
    if ((b1||[]).length) return;
    const { data: b2 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", opts.followingId).eq("blocked_id", opts.followerId).limit(1);
    if ((b2||[]).length) return;
    if (!(await isNotificationEnabled(opts.followerId, "follows"))) return;

    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", opts.followerId)
      .eq("type", "follow_accepted")
      .contains("payload", { actor_id: opts.followingId })
      .limit(1);
    if ((existing||[]).length) return;

    await supabase.from("notifications").insert({
      user_id: opts.followerId,
      type: "follow_accepted",
      payload: { actor_id: opts.followingId },
      read: false,
    });
  } catch {}
}

export async function createMessageNotification(opts: { actorId: string; recipientId: string; conversationId: string }) {
  const supabase = createServerClient();
  if (!supabase) return;
  try {
    if (opts.actorId === opts.recipientId) return;

    // Bidirectional block check.
    const { data: b1 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", opts.actorId).eq("blocked_id", opts.recipientId).limit(1);
    if ((b1||[]).length) return;
    const { data: b2 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", opts.recipientId).eq("blocked_id", opts.actorId).limit(1);
    if ((b2||[]).length) return;

    // Notification preference.
    if (!(await isNotificationEnabled(opts.recipientId, "messages"))) return;

    // Muted conversation check.
    const { data: mute } = await supabase.from("conversation_mutes").select("id").eq("conversation_id", opts.conversationId).eq("user_id", opts.recipientId).limit(1);
    if ((mute||[]).length) return;

    // Duplicate prevention: same actor + conversation already has an unread notification.
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", opts.recipientId)
      .eq("type", "message")
      .eq("read", false)
      .contains("payload", { actor_id: opts.actorId, conversation_id: opts.conversationId })
      .limit(1);
    if ((existing||[]).length) return;

    await supabase.from("notifications").insert({
      user_id: opts.recipientId,
      type: "message",
      payload: { actor_id: opts.actorId, conversation_id: opts.conversationId },
      read: false,
    });
  } catch {}
}
