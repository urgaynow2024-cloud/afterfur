import { canViewPost } from "@/lib/postPrivacy";

export type FeedPrivacyContext = {
  viewerId: string | null;
  followMap: Map<string, "pending" | "accepted" | "rejected" | "none">;
  blockedSet: Set<string>;
};

export function canShowPostInFeed(
  post: { author_id: string },
  profile: { is_private?: boolean | null } | null | undefined,
  ctx: FeedPrivacyContext
): boolean {
  if (ctx.blockedSet.has(post.author_id)) return false;
  const isPrivate = !!profile?.is_private;
  let followStatus: "pending" | "accepted" | "rejected" | "none" | null = "none";
  if (ctx.viewerId && post.author_id) {
    if (ctx.viewerId === post.author_id) {
      followStatus = null;
    } else {
      followStatus = ctx.followMap.get(post.author_id) ?? "none";
    }
  } else {
    followStatus = "none";
  }
  return canViewPost({
    authorId: post.author_id,
    viewerId: ctx.viewerId,
    profileIsPrivate: isPrivate,
    followStatus,
    blocked: ctx.blockedSet.has(post.author_id),
  });
}
