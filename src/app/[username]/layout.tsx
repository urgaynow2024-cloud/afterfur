import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: profile } = await supabase.from("profiles").select("id,username,display_name,bio,avatar_url").eq("username", username).maybeSingle();
  if (!profile) {
    return { title: "Profile not found | AfterFur", description: "This AfterFur profile is unavailable." };
  }
  const [{ count: posts }, { count: followers }, { count: following }] = await Promise.all([
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("author_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id)
  ]);
  const title = `${profile.display_name || profile.username} (@${profile.username}) | AfterFur`;
  const description = `${profile.bio || "View " + (profile.display_name || profile.username) + "'s profile on AfterFur."}

Posts: ${posts ?? 0} · Followers: ${followers ?? 0} · Following: ${following ?? 0}`;
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
