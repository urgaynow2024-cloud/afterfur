import type { Metadata } from "next";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function generateMetadata({ params }: { params: Promise<{ username: string; id: string }> }): Promise<Metadata> {
  const { username, id } = await params;
  await connection();
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: post } = await supabase.from("posts").select("id,content,media_urls,author_id").eq("id", id).maybeSingle();
  if (!post) return { title: "Post not found | AfterFur", description: "This AfterFur post is unavailable." };
  const { data: profile } = await supabase.from("profiles").select("username,display_name").eq("id", post.author_id).maybeSingle();
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
