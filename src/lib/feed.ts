export type FeedPost = { id: string; created_at: string; [key: string]: unknown };

export function addPostToFeed<T extends FeedPost>(posts: T[], post: T): T[] {
  return [post, ...posts.filter((existing) => existing.id !== post.id)].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function submitAndPublishPost<T>(
  insert: () => Promise<{ data: T | null; error: { message: string } | null }>,
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
