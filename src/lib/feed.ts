export type FeedPost = { id: string; created_at: string; [key: string]: unknown };
export type FeedVisibilityOptions = {
  userId?: string | null;
  followingIds: Set<string>;
  blockedIds: Set<string>;
  tab: "foryou" | "following";
};

export function isFeedPostVisible<T extends { author_id: string; profiles?: { is_private?: boolean | null } | null }>(
  post: T,
  options: FeedVisibilityOptions,
): boolean {
  if (options.blockedIds.has(post.author_id)) return false;
  const isPrivate = !!post.profiles?.is_private;
  const isSelf = post.author_id === options.userId;
  const isFollowing = options.followingIds.has(post.author_id);
  if (isPrivate && !isSelf && !isFollowing) return false;
  if (options.tab === "following" && !isFollowing) return false;
  return true;
}

export function filterVisibleFeedPosts<T extends { author_id: string; profiles?: { is_private?: boolean | null } | null }>(
  posts: T[],
  options: FeedVisibilityOptions,
): T[] {
  return posts.filter((post) => isFeedPostVisible(post, options));
}

function compareFeedPosts(a: FeedPost, b: FeedPost): number {
  const byTime = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  return byTime || b.id.localeCompare(a.id);
}

export function addPostToFeed<T extends FeedPost>(posts: T[], post: T): T[] {
  return [post, ...posts.filter((existing) => existing.id !== post.id)].sort(compareFeedPosts);
}

/** Keep successful local inserts if the initial list query completes afterward. */
export function mergeFeedPosts<T extends FeedPost>(current: T[], fetched: T[]): T[] {
  const byId = new Map(current.map((post) => [post.id, post]));
  for (const post of fetched) byId.set(post.id, post);
  return [...byId.values()].sort(compareFeedPosts);
}

export async function submitAndPublishPost<T>(
  insert: () => PromiseLike<{ data: T | null; error: { message: string } | null }>,
  publish: (post: T) => void,
): Promise<{ error: string | null }> {
  try {
    const { data, error } = await insert();
    if (error) return { error: error.message };
    if (!data) return { error: "The post was saved but no post data was returned." };
    publish(data);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not publish the post." };
  }
}
