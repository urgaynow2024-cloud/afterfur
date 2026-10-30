import type { Metadata } from "next";
import { cache } from "react";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const fetchProfile = cache(async (username: string) => {
  const url = `${supabaseUrl}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id,username,display_name,bio,avatar_url`;
  const res = await fetch(url, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    next: { revalidate: 300 }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data.length ? data[0] : null;
});

const fetchCount = cache(async (table: string, column: string, value: string) => {
  const url = `${supabaseUrl}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}&select=*`;
  const res = await fetch(url, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, Prefer: "count=exact" },
    next: { revalidate: 300 }
  });
  const range = res.headers.get("content-range");
  if (range) {
    const total = range.split("/")[1];
    return total && total !== "*" ? Number(total) : 0;
  }
  return 0;
});

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) {
    return { title: "Profile not found | AfterFur", description: "This AfterFur profile is unavailable." };
  }
  const [posts, followers, following] = await Promise.all([
    fetchCount("posts", "author_id", profile.id),
    fetchCount("follows", "following_id", profile.id),
    fetchCount("follows", "follower_id", profile.id)
  ]);
  const title = `${profile.display_name || profile.username} (@${profile.username}) | AfterFur`;
  const description = `${profile.bio || "View " + (profile.display_name || profile.username) + "'s profile on AfterFur."}

Posts: ${posts} · Followers: ${followers} · Following: ${following}`;
  const url = `https://afterfur.site/${profile.username}`;
  const image = profile.avatar_url || undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "profile", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary" : "summary", title, description, images: image ? [image] : undefined }
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
