"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type Profile = { username: string; display_name: string | null; bio: string | null; location: string | null; website: string | null; avatar_url: string | null; banner_url: string | null };

export default function Settings() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<Profile>({ username: "", display_name: "", bio: "", location: "", website: "", avatar_url: null, banner_url: null });
  const [form, setForm] = useState<Profile>({ username: "", display_name: "", bio: "", location: "", website: "", avatar_url: null, banner_url: null });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle().then(({ data }: any) => {
      if (data) {
        const p: Profile = {
          username: data.username || "",
          display_name: data.display_name || "",
          bio: data.bio || "",
          location: data.location || "",
          website: data.website || "",
          avatar_url: data.avatar_url || null,
          banner_url: data.banner_url || null,
        };
        setSaved(p);
        setForm(p);
      }
    });
  }, [user]);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  async function compressImage(file: File): Promise<File> {
    if (file.size < 5 * 1024 * 1024) return file;
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 2048;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas not supported")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }));
        }, "image/webp", 0.8);
      };
      img.onerror = () => reject(new Error("Invalid image"));
      img.src = URL.createObjectURL(file);
    });
  }

  async function upload(file: File, bucket: string) {
    const supabase = createClient();
    if (!supabase || !user) throw new Error("Not signed in");
    if (!file.type.startsWith("image/")) throw new Error("File must be an image");
    const processed = await compressImage(file);
    if (processed.size >= 5 * 1024 * 1024) throw new Error("Image must be under 5MB");
    const ext = processed.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, processed, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) throw new Error("File must be an image");
      setAvatarPreview(URL.createObjectURL(file));
      const url = await upload(file, "avatars");
      setForm((f) => ({ ...f, avatar_url: url }));
      setMsg("");
    } catch (err: any) { setError(err.message); setAvatarPreview(null); }
  }

  async function onBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) throw new Error("File must be an image");
      setBannerPreview(URL.createObjectURL(file));
      const url = await upload(file, "banners");
      setForm((f) => ({ ...f, banner_url: url }));
      setMsg("");
    } catch (err: any) { setError(err.message); setBannerPreview(null); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    const supabase = createClient();
    if (!supabase || !user) { setError("Sign in required."); return; }
    const usernameClean = form.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/i.test(usernameClean)) { setError("Username must be 3-20 characters (letters, numbers, underscore)."); return; }
    if (usernameClean !== saved.username) {
      const { data: existing } = await supabase.from("profiles").select("id").ilike("username", usernameClean).neq("id", user.id).maybeSingle();
      if (existing) { setError("That username is already taken."); return; }
    }
    setLoading(true);
    const { error } = await supabase.from("profiles").update({ username: usernameClean, display_name: form.display_name, bio: form.bio, location: form.location, website: form.website, avatar_url: form.avatar_url, banner_url: form.banner_url }).eq("id", user.id);
    setLoading(false);
    if (error) setError(error.message);
    else { setSaved({ ...form, username: usernameClean }); setMsg("Profile saved."); }
  }

  function cancel() {
    setForm(saved);
    setAvatarPreview(null);
    setBannerPreview(null);
    setMsg("");
    setError("");
  }

  if (!user) return <Shell><PageHeader title="Settings" /><EmptyState title="Sign in to manage settings" body="Account settings require authentication." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Settings" />
      <section className="p-4 max-w-2xl">
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-sm text-af-muted">Manage how your profile appears to others.</p>
        <form onSubmit={save} className="mt-6 space-y-6">
          <div className="rounded-xl border border-af-border bg-af-surface p-4">
            <label className="block cursor-pointer">
              <div className="h-32 rounded-lg bg-af-surface-2 overflow-hidden flex items-center justify-center">
                {(bannerPreview || form.banner_url) ? <img src={bannerPreview || form.banner_url!} alt="" className="h-full w-full object-cover" /> : <span className="text-sm text-af-muted">Choose banner image</span>}
              </div>
              <input type="file" accept="image/*" onChange={onBannerChange} className="hidden" />
            </label>
            <p className="mt-2 text-xs text-af-muted">PNG, JPG or WebP, up to 5MB.</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="cursor-pointer">
              <div className="h-16 w-16 rounded-full bg-af-surface-2 overflow-hidden flex items-center justify-center">
                {(avatarPreview || form.avatar_url) ? <img src={avatarPreview || form.avatar_url!} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-af-muted">+</span>}
              </div>
              <input type="file" accept="image/*" onChange={onAvatarChange} className="hidden" />
            </label>
            <div>
              <p className="text-sm font-medium">Avatar</p>
              <p className="text-xs text-af-muted">Click to choose an image. PNG, JPG or WebP, up to 5MB.</p>
            </div>
          </div>
          <div>
            <label className="block text-xs text-af-muted mb-1">Username</label>
            <input value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-af-muted mb-1">Display name</label>
            <input value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-af-muted mb-1">Bio</label>
            <textarea value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" rows={4} maxLength={160} />
            <div className="text-xs text-af-muted text-right">{(form.bio || "").length}/160</div>
          </div>
          <div>
            <label className="block text-xs text-af-muted mb-1">Location</label>
            <input value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-af-muted mb-1">Website</label>
            <input value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} className="w-full rounded-lg border border-af-border bg-af-surface px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-af-danger">{error}</p>}
          {msg && <p className="text-sm text-af-muted">{msg}</p>}
          <div className="flex gap-3">
            <button disabled={loading || !dirty} className="rounded-full bg-af-accent px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-40">{loading ? "Saving..." : "Save"}</button>
            <button type="button" onClick={cancel} disabled={loading} className="rounded-full border border-af-border px-4 py-1.5 text-sm font-semibold hover:bg-af-surface-2">Cancel</button>
          </div>
        </form>
      </section>
    </Shell>
  );
}
