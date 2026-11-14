"use client";

import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import PostCard from "@/components/PostCard";
import { usePostInteractions } from "@/components/PostInteractionProvider";
import { loadMyMembershipStatus } from "@/lib/pawpass";

type Post = { id: string; content: string; created_at: string; author_id: string; media_urls?: string[] | null; profiles?: { username: string; display_name: string | null; avatar_url: string | null } | null };
type BookmarkRow = { post_id: string };
type BookmarkAuthor = NonNullable<Post["profiles"]> & { id: string };

export default function Bookmarks() {
  const { user } = useAuth();
  const interactions = usePostInteractions();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [newFolder, setNewFolder] = useState("");
  const [folderError, setFolderError] = useState("");
  const [isPawPass, setIsPawPass] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!user) return;
    const timer = window.setTimeout(() => {
      const load = async () => {
        if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
        const { data, error } = await supabase.from("bookmarks").select("post_id").eq("user_id", user.id);
        if (error) { setError(error.message); setLoading(false); return; }
        const ids = ((data ?? []) as BookmarkRow[]).map((row) => row.post_id);
        if (ids.length === 0) { setPosts([]); setLoading(false); return; }
        const { data: rows, error: postsError } = await supabase.from("posts").select("*").in("id", ids);
        if (postsError) { setError(postsError.message); setLoading(false); return; }
        const savedPosts = (rows ?? []) as Post[];
        const authorIds = [...new Set(savedPosts.map((post) => post.author_id))];
        let profileMap = new Map<string, BookmarkAuthor>();
        if (authorIds.length) {
          const { data: authors, error: authorsError } = await supabase.from("profiles").select("*").in("id", authorIds);
          if (authorsError) { setError(authorsError.message); setLoading(false); return; }
          profileMap = new Map(((authors ?? []) as BookmarkAuthor[]).map((author) => [author.id, author]));
        }
        setPosts(savedPosts.map((post) => ({ ...post, profiles: profileMap.get(post.author_id) ?? null })));
        setLoading(false);
      };
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    let cancelled = false;
    void loadMyMembershipStatus(supabase).then(({ status }) => {
      if (cancelled) return;
      const active = !!status && (status.status === "active" || status.status === "cancel_at_period_end") && !!status.currentPeriodEnd && new Date(status.currentPeriodEnd).getTime() > Date.now();
      setIsPawPass(active);
    });
    const loadFolders = async () => {
      const { data: f } = await (supabase as any).from("bookmark_folders").select("id,name").eq("user_id", user.id).order("created_at", { ascending: true });
      if (!cancelled && f) setFolders(f as { id: string; name: string }[]);
      const { data: items } = await (supabase as any).from("bookmark_folder_items").select("folder_id").eq("user_id", user.id);
      if (!cancelled && items) {
        const counts: Record<string, number> = {};
        for (const row of items as { folder_id: string }[]) counts[row.folder_id] = (counts[row.folder_id] || 0) + 1;
        setFolderCounts(counts);
      }
    };
    void loadFolders();
    return () => { cancelled = true; };
  }, [user]);

  async function createFolder() {
    const supabase = createClient();
    if (!supabase || !user || !isPawPass) return;
    if (folders.length >= 5) { setFolderError("Folder limit reached."); return; }
    const name = newFolder.trim();
    if (!name) return;
    const { error } = await (supabase as any).rpc("create_bookmark_folder", { p_name: name });
    if (error) { setFolderError(error.message); return; }
    const { data: f } = await (supabase as any).from("bookmark_folders").select("id,name").eq("user_id", user.id).order("created_at", { ascending: true });
    setFolders((f ?? []) as { id: string; name: string }[]);
    setNewFolder("");
    setFolderError("");
  }

  async function renameFolder(id: string, name: string) {
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await (supabase as any).rpc("rename_bookmark_folder", { p_folder_id: id, p_name: name });
    if (!error) setFolders((f) => f.map((x) => (x.id === id ? { ...x, name } : x)));
  }

  async function deleteFolder(id: string) {
    const supabase = createClient();
    if (!supabase) return;
    const { error } = await (supabase as any).rpc("delete_bookmark_folder", { p_folder_id: id });
    if (!error) setFolders((f) => f.filter((x) => x.id !== id));
  }

  async function moveBookmarkToFolder(postId: string, folderId: string) {
    const supabase = createClient();
    if (!supabase || !folderId) return;
    await (supabase as any).rpc("add_bookmark_to_folder", { p_folder_id: folderId, p_post_id: postId });
  }

  if (!user) return <Shell compact={true}><PageHeader title="Bookmarks" /><EmptyState title="Sign in to view bookmarks" body="Saved posts appear here after you sign in." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  const visiblePosts = posts.filter((post) => !interactions?.available || interactions.bookmarked(post.id));

  return (
    <Shell compact={true}>
      <PageHeader title="Bookmarks" subtitle="Posts you saved for later." />
      {isPawPass && (
        <div className="px-4 py-4 sm:px-6">
          <div className="rounded-2xl border border-af-border bg-af-surface p-4">
            <h2 className="text-sm font-semibold text-af-text">Bookmark folders (PawPass)</h2>
            <div className="mt-3 flex gap-2">
              <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder name" className="af-field flex-1 text-sm" />
              <button type="button" onClick={createFolder} className="min-h-9 rounded-md bg-af-brand px-4 text-sm font-semibold text-white">Create</button>
            </div>
            {folderError && <p className="mt-2 text-xs text-af-danger">{folderError}</p>}
            <ul className="mt-3 space-y-2">
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-center justify-between gap-2 rounded-lg border border-af-border bg-af-surface-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <input
                      defaultValue={folder.name}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== folder.name) renameFolder(folder.id, e.target.value.trim()); }}
                      className="w-full bg-transparent text-sm text-af-text focus:outline-none"
                    />
                    <span className="block text-xs text-af-muted">{folderCounts[folder.id] || 0} posts</span>
                  </span>
                  <button type="button" onClick={() => deleteFolder(folder.id)} className="text-xs text-af-danger">Delete</button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {loading || !interactions?.ready ? (
        <div className="flex flex-col gap-3 px-4 py-6">
          <div className="h-24 animate-pulse rounded-2xl bg-af-surface-2" />
          <div className="h-24 animate-pulse rounded-2xl bg-af-surface-2" />
          <div className="h-24 animate-pulse rounded-2xl bg-af-surface-2" />
        </div>
      ) : error ? (
        <div className="px-6 py-10 text-center text-sm text-af-danger">{error}</div>
      ) : visiblePosts.length === 0 ? (
        <EmptyState title="Keep the good stuff close" body="Bookmark posts you want to find again." />
      ) : (
        <div className="divide-y divide-af-border">
          {visiblePosts.map((p) => (
            <div key={p.id} className="px-4 py-3 sm:px-5">
              {isPawPass && folders.length > 0 && (
                <div className="mb-2">
                  <select onChange={(e) => { if (e.target.value) moveBookmarkToFolder(p.id, e.target.value); }} className="af-field text-xs" aria-label="Move to folder">
                    <option value="">Move to folder…</option>
                    {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <PostCard post={p} />
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

export const dynamic = 'force-dynamic';