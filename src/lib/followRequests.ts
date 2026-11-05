import { SupabaseClient } from "@supabase/supabase-js";

export type IncomingFollowRequest = {
  followerId: string;
  createdAt: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export async function getIncomingFollowRequests(supabase: SupabaseClient): Promise<{ data: IncomingFollowRequest[]; error: string | null }> {
  const userId = await currentUserId(supabase);
  if (!userId) return { data: [], error: "Not authenticated." };

  const { data: rows, error } = await supabase
    .from("follows")
    .select("follower_id, created_at")
    .eq("following_id", userId)
    .eq("status", "pending");

  if (error) return { data: [], error: error.message };

  const ids = (rows ?? []).map((r: { follower_id: string }) => r.follower_id);
  if (ids.length === 0) return { data: [], error: null };

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);

  const byId = new Map((profiles ?? []).map((p: { id: string; username: string | null; display_name: string | null; avatar_url: string | null }) => [p.id, p]));
  const result: IncomingFollowRequest[] = (rows ?? []).map((r: { follower_id: string; created_at?: string }) => {
    const p = byId.get(r.follower_id);
    return {
      followerId: r.follower_id,
      createdAt: r.created_at ?? null,
      username: p?.username ?? null,
      displayName: p?.display_name ?? null,
      avatarUrl: p?.avatar_url ?? null,
    };
  });

  return { data: result, error: null };
}

async function isBlocked(supabase: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data: d1 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", a).eq("blocked_id", b).limit(1);
  if ((d1 ?? []).length > 0) return true;
  const { data: d2 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", b).eq("blocked_id", a).limit(1);
  return (d2 ?? []).length > 0;
}

export async function approveFollowRequest(supabase: SupabaseClient, followerId: string): Promise<{ ok: boolean; error: string | null }> {
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "Not authenticated." };
  if (!followerId) return { ok: false, error: "Invalid request." };

  if (await isBlocked(supabase, userId, followerId)) {
    return { ok: false, error: "Cannot approve a blocked account." };
  }

  const { data, error } = await supabase
    .from("follows")
    .update({ status: "accepted" })
    .eq("follower_id", followerId)
    .eq("following_id", userId)
    .eq("status", "pending")
    .select("follower_id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Request not found or already processed." };
  try {
    const { createFollowAcceptedNotification } = await import("@/lib/notifications.server");
    await createFollowAcceptedNotification({ followerId, followingId: userId });
  } catch {}
  return { ok: true, error: null };
}

export async function rejectFollowRequest(supabase: SupabaseClient, followerId: string): Promise<{ ok: boolean; error: string | null }> {
  const userId = await currentUserId(supabase);
  if (!userId) return { ok: false, error: "Not authenticated." };
  if (!followerId) return { ok: false, error: "Invalid request." };

  const { data, error } = await supabase
    .from("follows")
    .update({ status: "rejected" })
    .eq("follower_id", followerId)
    .eq("following_id", userId)
    .eq("status", "pending")
    .select("follower_id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Request not found or already processed." };
  return { ok: true, error: null };
}
