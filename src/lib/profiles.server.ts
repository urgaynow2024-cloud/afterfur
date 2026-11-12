import { createServerClient } from "@/lib/supabase/server";
import { canViewProfile, type ProfileVisibilityInput } from "@/lib/profilePrivacy";

export type ProfileForViewer = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  website: string | null;
  location: string | null;
  is_private: boolean | null;
  profile_customisation?: Record<string, unknown> | null;
  created_at: string | null;
  [key: string]: unknown;
};

export type GetProfileForViewerResult = {
  profile: ProfileForViewer | null;
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

  // Return the full profile row (existing saved fields/settings) so the client can
  // render all previously stored profile data. Authorization is enforced below;
  // do not drop columns as a substitute for access control.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .ilike("username", opts.username)
    .maybeSingle();

  // TEMP DIAG (safe): profile visibility inputs/decision. No tokens/secrets.
  try {
    console.info("[profile-visibility][diag] lookup", {
      requestedUsername: opts.username,
      viewerIdPresent: Boolean(opts.viewerId),
      viewerId: opts.viewerId,
      profileFound: Boolean(profile),
      profileIdPresent: Boolean((profile as any)?.id),
      ownerId: (profile as any)?.id ?? null,
      storedUsername: (profile as any)?.username ?? null,
      is_private: (profile as any)?.is_private ?? null,
      is_private_type: profile ? typeof (profile as any).is_private : null,
      lookupError: profileError?.message ?? null,
    });
  } catch {}

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
    isPrivate: profile.is_private === true,
    ownerId: profile.id,
    viewerId: opts.viewerId,
    followStatus,
    blocked,
  });

  try {
    console.info("[profile-visibility][diag] decision", {
      requestedUsername: opts.username,
      ownerId: profile.id ?? null,
      viewerId: opts.viewerId,
      viewerAuthenticated: Boolean(opts.viewerId),
      is_private: profile.is_private ?? null,
      is_private_type: typeof profile.is_private,
      blocked,
      followStatus,
      allowed,
      reason: !allowed
        ? (blocked ? "blocked" : (profile.is_private === true ? "private_no_access" : "denied_other"))
        : (opts.viewerId && profile.id && opts.viewerId === profile.id ? "owner" : (profile.is_private === true ? "accepted_follower_or_owner" : "public")),
    });
  } catch {}

  if (!allowed) {
    return { profile: null, error: "forbidden" };
  }

  return { profile: profile as GetProfileForViewerResult["profile"], error: null };
}
