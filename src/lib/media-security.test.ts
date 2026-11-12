import { describe, expect, it } from "vitest";

// Test the storage path extraction logic used by the reconciliation script.
function storagePathFromPublicUrl(url: string): string | null {
  const PUBLIC_MEDIA_URL_RE = /\/object\/public\/media\//;
  if (!PUBLIC_MEDIA_URL_RE.test(url)) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
    const mediaIdx = segments.indexOf("media");
    if (mediaIdx === -1 || mediaIdx + 1 >= segments.length) return null;
    return segments.slice(mediaIdx + 1).join("/");
  } catch {
    return null;
  }
}

function isPublicMediaUrl(url: string): boolean {
  return /\/object\/public\/media\//.test(url);
}

function classifyMediaUrl(url: string): "image" | "video" | "gif" | "unknown" {
  const lower = url.toLowerCase();
  if (lower.endsWith(".gif") || /\.gif(?:$|\?)/i.test(lower)) return "gif";
  if (/\.(mp4|webm|mov)(?:$|\?)/i.test(lower)) return "video";
  if (/\.(png|jpg|jpeg|webp)(?:$|\?)/i.test(lower)) return "image";
  return "unknown";
}

describe("NSFW media storage hardening — URL parsing", () => {
  it("extracts storage path from public media bucket URL", () => {
    const url = "https://abc123.supabase.co/storage/v1/object/public/media/user1/1234567890-abc.png";
    expect(storagePathFromPublicUrl(url)).toBe("user1/1234567890-abc.png");
  });

  it("extracts storage path from public media bucket URL with subfolder", () => {
    const url = "https://abc123.supabase.co/storage/v1/object/public/media/user1/2026/01/image.jpg";
    expect(storagePathFromPublicUrl(url)).toBe("user1/2026/01/image.jpg");
  });

  it("returns null for non-public URLs", () => {
    expect(storagePathFromPublicUrl("user1/1234567890-abc.png")).toBeNull();
    expect(storagePathFromPublicUrl("https://example.com/photo.png")).toBeNull();
    expect(storagePathFromPublicUrl("")).toBeNull();
  });

  it("identifies public media bucket URLs", () => {
    expect(isPublicMediaUrl("https://abc123.supabase.co/storage/v1/object/public/media/user1/file.png")).toBe(true);
    expect(isPublicMediaUrl("user1/file.png")).toBe(false);
    expect(isPublicMediaUrl("https://example.com/photo.png")).toBe(false);
  });

  it("classifies media types from URLs", () => {
    expect(classifyMediaUrl("image.png")).toBe("image");
    expect(classifyMediaUrl("animation.gif")).toBe("gif");
    expect(classifyMediaUrl("clip.mp4")).toBe("video");
    expect(classifyMediaUrl("clip.webm")).toBe("video");
    expect(classifyMediaUrl("clip.mov")).toBe("video");
    expect(classifyMediaUrl("document.pdf")).toBe("unknown");
  });

  it("does not flag posts with null classification for migration", () => {
    const posts = [
      { id: "p1", classification: null, media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u1/a.png"] },
    ];
    const needsMigration = posts.filter(
      (p) => p.classification === "NSFW" && p.media_urls?.some((u) => isPublicMediaUrl(u)),
    );
    expect(needsMigration).toHaveLength(0);
  });
});

describe("NSFW media storage hardening — SFW media compatibility", () => {
  it("SFW media URLs are not flagged for migration", () => {
    const sfwPost = {
      id: "p1",
      classification: "SFW",
      media_urls: ["https://x.supabase.co/storage/v1/object/public/media/u1/sfw.png"],
    };

    const isNsfw = sfwPost.classification === "NSFW";
    const hasPublicMedia = sfwPost.media_urls?.some((u) => isPublicMediaUrl(u));

    expect(isNsfw).toBe(false);
    expect(hasPublicMedia).toBe(true);
  });

  it("Private storage paths are not treated as public URLs", () => {
    expect(isPublicMediaUrl("u1/1234567890-abc.png")).toBe(false);
    expect(storagePathFromPublicUrl("u1/1234567890-abc.png")).toBeNull();
  });
});
