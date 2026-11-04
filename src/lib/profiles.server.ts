import { createServerClient } from "@/lib/supabase/server";
import { canViewProfile, type ProfileVisibilityInput } from "@/lib/profilePrivacy";

export type GetProfileForViewerResult = {
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    is_private: boolean;
  } | null;
  error: "no-server-client" | "not-found" | "forbidden" | string | null;
};

export async function getProfileForViewer(opts: {
  username: string;
  viewerId: string | null;
}): Promise<GetProfileForViewerResult> {
  const supabase = createServerClient();
  if (!supabase) {
    return { profile: null, error: "no-server-client" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,username,display_name,bio,avatar_url,is_private")
    .eq("username", opts.username)
    .maybeSingle();

  if (profileError || !profile) {
    return { profile: null, error: profileError?.message ?? "not-found" };
  }

  let blocked = false;
  if (opts.viewerId && profile.id) {
    const { data: block } = await supabase
      .from("blocks")
      .select("blocker_id")
      .eq("blocker_id", opts.viewerId)
      .eq("blocked_id", profile.id)
      .maybeSingle();
    blocked = !!block;
  }

  let followStatus: ProfileVisibilityInput["followStatus"] = "none";
  if (opts.viewerId && profile.id) {
    if (opts.viewerId === profile.id) {
      followStatus = null;
    } else {
      const { data: follow } = await supabase
        .from("follows")
        .select("status")
        .eq("follower_id", opts.viewerId)
        .eq("following_id", profile.id)
        .maybeSingle();
      if (follow?.status === "accepted" || follow?.status === "pending" || follow?.status === "rejected") {
        followStatus = follow.status;
      } else {
        followStatus = "none";
      }
    }
  } else {
    followStatus = "none";
  }

  const allowed = canViewProfile({
    isPrivate: !!profile.is_private,
    ownerId: profile.id,
    viewerId: opts.viewerId,
    followStatus,
    blocked,
  });

  if (!allowed) {
    return { profile: null, error: "forbidden" };
  }

  return { profile: profile as GetProfileForViewerResult["profile"], error: null };
}
