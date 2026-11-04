export type ProfileVisibilityInput = {
  isPrivate: boolean;
  ownerId: string | null;
  viewerId: string | null;
  followStatus: "pending" | "accepted" | "rejected" | "none" | null;
  blocked: boolean;
};

export function canViewProfile(input: ProfileVisibilityInput): boolean {
  const { isPrivate, ownerId, viewerId, followStatus, blocked } = input;
  if (blocked) return false;
  if (viewerId && ownerId && viewerId === ownerId) return true;
  if (!isPrivate) return true;
  return followStatus === "accepted";
}
