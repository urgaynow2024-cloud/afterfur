import type { Metadata } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type PostMetadataRow = { id: string; content: string; media_urls: string[] | null; author_id: string };
type ProfileMetadataRow = { username: string; display_name: string | null };

async function fetchPublicRows<T>(resource: string, search: Record<string, string>): Promise<T[]> {
  if (!supabaseUrl || !supabaseAnonKey) return [];
  try {
    const url = new URL(`/rest/v1/${resource}`, supabaseUrl);
    for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const rows: unknown = await response.json();
    return Array.isArray(rows) ? rows as T[] : [];
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ username: string; id: string }> }): Promise<Metadata> {
  const { username, id } = await params;
  const [post] = await fetchPublicRows<PostMetadataRow>("posts", {
    select: "id,content,media_urls,author_id",
    id: `eq.${id}`,
    limit: "1",
  });
  if (!post) return { title: "Post not found | AfterFur", description: "This AfterFur post is unavailable." };
  const [profile] = await fetchPublicRows<ProfileMetadataRow>("profiles", {
    select: "username,display_name",
    id: `eq.${post.author_id}`,
    limit: "1",
  });
  if (!profile || profile.username !== username) return { title: "Post not found | AfterFur", description: "This AfterFur post is unavailable." };
  const title = `${profile.display_name || profile.username} on AfterFur`;
  const description = String(post.content || "").slice(0, 200) || "View this post on AfterFur.";
  const url = `https://afterfur.site/${profile.username}/status/${post.id}`;
  const image = Array.isArray(post.media_urls) ? post.media_urls[0] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined }
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
