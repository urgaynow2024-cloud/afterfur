import { canViewProfile } from "@/lib/profilePrivacy";

export type PostPrivacyInput = {
  authorId: string | null;
  viewerId: string | null;
  profileIsPrivate: boolean;
  followStatus: "pending" | "accepted" | "rejected" | "none" | null;
  blocked: boolean;
  isReplyToPrivate?: boolean;
  isRepostOfPrivate?: boolean;
};

export function canViewPost(input: PostPrivacyInput): boolean {
  const base = canViewProfile({
    isPrivate: input.profileIsPrivate,
    ownerId: input.authorId,
    viewerId: input.viewerId,
    followStatus: input.followStatus,
    blocked: input.blocked,
  });
  if (!base) return false;
  if (input.isReplyToPrivate || input.isRepostOfPrivate) {
    // Replies/reposts cannot expose protected original content.
    return input.viewerId === input.authorId || input.followStatus === "accepted";
  }
  return true;
}
