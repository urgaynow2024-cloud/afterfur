"use client";
import { useEffect, useState } from "react";
import { Shell, PageHeader, EmptyState } from "@/components/Shell";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { loadMyMembershipStatus, isPrimeEntitlement, parsePawPassEntitlement } from "@/lib/pawpass";
import Link from "next/link";

type Profile = { username: string; display_name: string | null; bio: string | null; location: string | null; website: string | null; avatar_url: string | null; banner_url: string | null };

export default function EditProfile() {
  const { user } = useAuth();
  const [saved, setSaved] = useState<Profile>({ username: "", display_name: "", bio: "", location: "", website: "", avatar_url: null, banner_url: null });
  const [form, setForm] = useState<Profile>({ username: "", display_name: "", bio: "", location: "", website: "", avatar_url: null, banner_url: null });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isPrime, setIsPrime] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    let cancelled = false;
    void loadMyMembershipStatus(supabase).then(({ status }) => {
      if (cancelled) return;
      const prime = !!status && (status.status === "active" || status.status === "cancel_at_period_end") && !!status.currentPeriodEnd && new Date(status.currentPeriodEnd).getTime() > Date.now();
      setIsPrime(prime);
    });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const loadProfile = async () => {
        setProfileLoading(true);
        const supabase = createClient();
        if (!supabase || !user) { setProfileLoading(false); return; }
        const { data, error: loadError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
        if (cancelled) return;
        if (loadError || !data) {
          setError(loadError?.message ?? "Could not load your profile.");
          setProfileLoading(false);
          return;
        }
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
        setProfileLoading(false);
      };
      void loadProfile();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user]);

  async function compressImage(file: File): Promise<File> {
    const limit = isPrime ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.type === "image/gif") return file;
    if (file.size < limit) return file;
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

  async function isActualGif(file: File): Promise<boolean> {
    const buf = await file.slice(0, 6).arrayBuffer();
    const bytes = new Uint8Array(buf);
    return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
  }

  async function upload(file: File, bucket: string) {
    const supabase = createClient();
    if (!supabase || !user) throw new Error("Not signed in");
    if (!file.type.startsWith("image/")) throw new Error("File must be an image");
    if (file.type === "image/gif") {
      if (!(await isActualGif(file))) throw new Error("Invalid GIF file");
      if (file.size > (isPrime ? 10 * 1024 * 1024 : 5 * 1024 * 1024)) throw new Error("GIF must be under " + (isPrime ? "10MB" : "5MB"));
    }
    const processed = await compressImage(file);
    if (processed.size >= (isPrime ? 10 * 1024 * 1024 : 5 * 1024 * 1024)) throw new Error("Image must be under " + (isPrime ? "10MB" : "5MB"));
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
      if (file.type === "image/gif") {
        if (!isPrime) throw new Error("PawPass membership is required for animated GIF avatars.");
        if (!(await isActualGif(file))) throw new Error("Invalid GIF file");
      }
      setAvatarPreview(URL.createObjectURL(file));
      const url = await upload(file, "avatars");
      setForm((f) => ({ ...f, avatar_url: url }));
      setMsg("");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Could not upload avatar."); setAvatarPreview(null); }
  }

  async function onBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!file.type.startsWith("image/")) throw new Error("File must be an image");
      if (file.type === "image/gif") {
        if (!isPrime) throw new Error("PawPass membership is required for animated GIF banners.");
        if (!(await isActualGif(file))) throw new Error("Invalid GIF file");
      }
      setBannerPreview(URL.createObjectURL(file));
      const url = await upload(file, "banners");
      setForm((f) => ({ ...f, banner_url: url }));
      setMsg("");
    } catch (err: unknown) { setError(err instanceof Error ? err.message : "Could not upload banner."); setBannerPreview(null); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMsg("");
    const supabase = createClient();
    if (!supabase || !user) { setError("Sign in required."); return; }
    if (profileLoading) { setError("Wait for your profile settings to finish loading."); return; }
    const usernameClean = form.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/i.test(usernameClean)) { setError("Username must be 3-20 characters (letters, numbers, underscore)."); return; }
    if ((form.display_name || "").trim().length > 50) { setError("Display name must be 50 characters or fewer."); return; }
    if ((form.bio || "").length > 160) { setError("Bio must be 160 characters or fewer."); return; }
    if (form.website?.trim()) {
      try { const website = new URL(form.website.trim()); if (website.protocol !== "https:" && website.protocol !== "http:") throw new Error(); }
      catch { setError("Enter a valid website URL beginning with http:// or https://."); return; }
    }
    if (usernameClean !== saved.username) {
      const { data: existing, error: usernameError } = await supabase.from("profiles").select("id").ilike("username", usernameClean).neq("id", user.id).maybeSingle();
      if (usernameError) { setError(usernameError.message); return; }
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

  if (!user) return <Shell><PageHeader title="Edit profile" /><EmptyState title="Sign in to edit your profile" body="Account profile editing requires authentication." action={{ label: "Sign in", href: "/signin" }} /></Shell>;

  return (
    <Shell>
      <PageHeader title="Edit profile" subtitle="Change your avatar, banner, display name, username, bio and other public profile fields." />
      <Link href="/settings" className="mb-4 inline-flex items-center text-xs text-af-text-2 hover:text-af-text underline">Back to settings</Link>
      {profileLoading && <p role="status" className="mt-4 text-sm text-af-muted">Loading your profile </p>}
      <form onSubmit={save} className="mt-5 space-y-6" aria-busy={profileLoading}>
        <section className="overflow-hidden rounded-2xl border border-af-border bg-af-surface shadow-sm">
          <div className="border-b border-af-border px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-af-text">Profile media</h2>
            <p className="mt-1 text-sm leading-relaxed text-af-muted">Update the banner and avatar shown across your profile.</p>
          </div>
          <div className="p-5 sm:p-6">
            <div className="relative overflow-hidden rounded-xl border border-af-border bg-af-surface-2">
              <label className="group block cursor-pointer focus-within:ring-2 focus-within:ring-af-focus">
                <div className="relative h-40 sm:h-56 w-full overflow-hidden">
                  {(bannerPreview || form.banner_url) ? <img src={bannerPreview || form.banner_url!} alt="Profile banner preview" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /> : <div className="flex h-full w-full items-center justify-center text-sm text-af-muted">Choose banner image</div>}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <span className="rounded-full bg-af-surface/80 px-3 py-1.5 text-xs font-semibold text-af-text opacity-0 transition-opacity group-hover:opacity-100">Change banner</span>
                  </div>
                </div>
                <input type="file" accept="image/*" disabled={profileLoading || loading} onChange={onBannerChange} className="sr-only" aria-label="Choose profile banner image" />
              </label>
              <label className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-af-focus">
                <div className="h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full border-4 border-af-surface bg-af-surface-2 shadow-lg flex items-center justify-center">
                  {(avatarPreview || form.avatar_url) ? <img src={avatarPreview || form.avatar_url!} alt="Profile avatar preview" className="h-full w-full object-cover" /> : <span aria-hidden="true" className="text-2xl text-af-muted">+</span>}
                </div>
                <input type="file" accept="image/*" disabled={profileLoading || loading} onChange={onAvatarChange} className="sr-only" aria-label="Choose profile avatar image" />
              </label>
            </div>
            <p className="mt-3 text-xs text-af-muted">PNG, JPG or WebP. Animated GIF avatars and banners require PawPass. Up to 5MB.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-af-border bg-af-surface p-5 sm:p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-af-text">Identity</h2>
            <p className="mt-1 text-sm leading-relaxed text-af-muted">Your public name and unique handle.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-username" className="mb-1.5 block text-xs font-medium text-af-text-2">Username</label>
              <input id="edit-username" autoComplete="username" disabled={profileLoading || loading} value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} className="af-field w-full px-3 py-2 text-sm disabled:opacity-50" />
            </div>
            <div>
              <label htmlFor="edit-display-name" className="mb-1.5 block text-xs font-medium text-af-text-2">Display name</label>
              <input id="edit-display-name" autoComplete="name" maxLength={50} disabled={profileLoading || loading} value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="af-field w-full px-3 py-2 text-sm disabled:opacity-50" />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-af-border bg-af-surface p-5 sm:p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-af-text">About</h2>
            <p className="mt-1 text-sm leading-relaxed text-af-muted">Tell people a little about yourself.</p>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="edit-bio" className="mb-1.5 block text-xs font-medium text-af-text-2">Bio</label>
              <textarea id="edit-bio" disabled={profileLoading || loading} value={form.bio || ""} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="af-field min-h-28 w-full resize-y px-3 py-2 text-sm leading-relaxed disabled:opacity-50" rows={4} maxLength={160} />
              <div className="mt-1 text-right text-xs text-af-muted">{(form.bio || "").length}/160</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="edit-location" className="mb-1.5 block text-xs font-medium text-af-text-2">Location</label>
                <input id="edit-location" disabled={profileLoading || loading} value={form.location || ""} onChange={(e) => setForm({ ...form, location: e.target.value })} className="af-field w-full px-3 py-2 text-sm disabled:opacity-50" />
              </div>
              <div>
                <label htmlFor="edit-website" className="mb-1.5 block text-xs font-medium text-af-text-2">Website</label>
                <input id="edit-website" type="url" inputMode="url" disabled={profileLoading || loading} value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} className="af-field w-full px-3 py-2 text-sm disabled:opacity-50" />
              </div>
            </div>
          </div>
        </section>

        {error && <p role="alert" className="rounded-md border border-af-danger/40 bg-af-danger/10 p-3 text-sm text-af-danger">{error}</p>}
        {msg && <p role="status" className="rounded-md border border-af-border bg-af-surface-2 p-3 text-sm text-af-text-2">{msg}</p>}
        <div className="flex flex-wrap gap-3">
          <button disabled={profileLoading || loading || !dirty} className="min-h-10 rounded-md bg-af-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-af-brand-hover disabled:cursor-not-allowed disabled:opacity-40">{loading ? "Saving..." : "Save"}</button>
          <button type="button" onClick={cancel} disabled={loading} className="af-action-secondary disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
        </div>
      </form>
    </Shell>
  );
}
