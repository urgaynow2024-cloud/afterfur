export type LikeResolution = {
  liked: boolean;
  error: string | null;
};

export function acquireInteractionLock(pending: Set<string>, key: string): boolean {
  if (pending.has(key)) return false;
  pending.add(key);
  return true;
}

export function releaseInteractionLock(pending: Set<string>, key: string): void {
  pending.delete(key);
}

export type PostCountField = "like_count" | "repost_count" | "reply_count";

export function parseLikeCountRows(rows: unknown, countField: PostCountField = "like_count"): Record<string, number> {
  if (!Array.isArray(rows)) return {};
  const result: Record<string, number> = {};
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as { post_id?: unknown; like_count?: unknown; repost_count?: unknown; reply_count?: unknown };
    const rawCount = candidate[countField];
    const count = typeof rawCount === "number" || typeof rawCount === "string"
      ? Number(rawCount)
      : Number.NaN;
    if (typeof candidate.post_id === "string" && Number.isSafeInteger(count) && count >= 0) {
      result[candidate.post_id] = count;
    }
  }
  return result;
}

export function reconcileLikeCountRows(
  current: Record<string, number>,
  requestedPostIds: string[],
  rows: unknown,
  countField: PostCountField = "like_count",
): Record<string, number> {
  const next = { ...current };
  for (const postId of requestedPostIds) delete next[postId];
  return { ...next, ...parseLikeCountRows(rows, countField) };
}

export function nextLikeState(current: boolean): boolean {
  return !current;
}

export function optimisticLikeCount(count: number | null, currentlyLiked: boolean): number | null {
  if (count === null) return null;
  return Math.max(0, count + (currentlyLiked ? -1 : 1));
}

export function reconcileLikeCount(countBeforeToggle: number | null, previous: boolean, confirmed: boolean): number | null {
  if (countBeforeToggle === null || previous === confirmed) return countBeforeToggle;
  return Math.max(0, countBeforeToggle + (confirmed ? 1 : -1));
}

/** Resolve an optimistic toggle against the confirmed row returned by Supabase. */
export function resolveLikeToggle(
  previous: boolean,
  desired: boolean,
  confirmed: boolean | null,
  mutationError: string | null,
  verificationError: string | null,
): LikeResolution {
  if (confirmed !== null) {
    return {
      liked: confirmed,
      error: mutationError && confirmed !== desired ? mutationError : null,
    };
  }
  if (mutationError) return { liked: previous, error: mutationError };
  return { liked: desired, error: verificationError };
}
