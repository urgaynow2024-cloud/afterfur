export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_MEDIA_BYTES = 30 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export type MediaClassification = "image" | "video" | "gif";

export function classifyMedia(file: File): MediaClassification | null {
  if (ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return file.type === "image/gif" ? "gif" : "image";
  }
  if (ACCEPTED_VIDEO_TYPES.includes(file.type)) return "video";
  return null;
}

export function classifyMediaUrl(url: string): MediaClassification {
  const lower = url.toLowerCase();
  if (lower.endsWith(".gif") || /\.gif(?:$|\?)/i.test(url)) return "gif";
  if (/\.(mp4|webm|mov)(?:$|\?)/i.test(url)) return "video";
  return "image";
}

export function isVideoUrl(url: string): boolean {
  return classifyMediaUrl(url) === "video";
}

export function isGifUrl(url: string): boolean {
  return classifyMediaUrl(url) === "gif";
}

export function isImageUrl(url: string): boolean {
  return classifyMediaUrl(url) === "image";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

export function validateMediaFile(file: File): string | null {
  const kind = classifyMedia(file);
  if (!kind) return "Unsupported file type. Choose an image (PNG, JPG, WebP, GIF) or video (MP4, WebM, MOV).";
  if (kind === "gif") return null;
  if (kind === "image" && file.size > MAX_IMAGE_BYTES) {
    return `Image is ${formatBytes(file.size)}. Compress it to under ${formatBytes(MAX_IMAGE_BYTES)} or choose a smaller file.`;
  }
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) {
    return `Video is ${formatBytes(file.size)}. Keep it under ${formatBytes(MAX_VIDEO_BYTES)}.`;
  }
  return null;
}

export function validateMediaSelection(files: File[]): string | null {
  let total = 0;
  for (const file of files) {
    const err = validateMediaFile(file);
    if (err) return err;
    total += file.size;
  }
  if (total > MAX_TOTAL_MEDIA_BYTES) {
    return `Total media size is ${formatBytes(total)}. Keep the combined total under ${formatBytes(MAX_TOTAL_MEDIA_BYTES)}.`;
  }
  return null;
}

export function extensionFor(file: File): string {
  const name = file.name || "";
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "bin";
}

export function storagePathFor(user: { id: string }, file: File): string {
  const ext = extensionFor(file);
  const safe = file.type === "image/gif" ? "gif" : ext || "bin";
  return `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safe}`;
}

export function getPublicUrl(bucket: string, path: string, supabase: { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function createSignedMediaUrl(bucket: string, path: string, supabase: { storage: { from: (b: string) => { createSignedUrl: (p: string, expiresIn: number) => Promise<{ data: { signedUrl: string } | null; error: any }> } } }, expiresInSeconds = 3600): Promise<{ signedUrl: string | null; error: any }> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    return { signedUrl: null, error: error || new Error("Could not create signed URL") };
  }
  return { signedUrl: data.signedUrl, error: null };
}

/**
 * A "storage path" is a bare path like `userId/timestamp-random.ext` with no
 * scheme or host. It is what we store in the database for private media. A
 * public URL is anything else (e.g. `https://.../object/public/media/...`).
 */
export function isStoragePath(value: string): boolean {
  if (typeof value !== "string" || !value) return false;
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//");
}

/**
 * Extract the storage path from a Supabase Storage URL, or return the input
 * unchanged if it is already a bare path. Returns null for unrecognised URLs.
 *
 * Handles:
 *   .../object/public/<bucket>/<path>
 *   .../object/sign/<bucket>/<path>
 *   .../object/<bucket>/<path>
 */
export function storagePathFromUrl(url: string): string | null {
  if (isStoragePath(url)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  } catch {
    return null;
  }
  const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
  // Expected: ["storage", "v1", "object", "public"|"sign", <bucket>, <path...>]
  const objIdx = segments.indexOf("object");
  if (objIdx === -1 || objIdx + 2 >= segments.length) return null;
  return segments.slice(objIdx + 2).join("/");
}

/** Default signed-URL lifetime, in seconds, when resolving private media. */
export const DEFAULT_SIGNED_URL_EXPIRES = 300;

export async function compressImage(file: File, maxBytes = MAX_IMAGE_BYTES, maxDim = 2048): Promise<File> {
  if (file.type === "image/gif") return file;
  if (file.size <= maxBytes) return file;

  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
  let quality = 0.85;
  let blob: Blob | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", quality));
    if (!blob) throw new Error("Compression failed");
    if (blob.size <= maxBytes) break;
    quality *= 0.72;
  }
  if (!blob) throw new Error("Compression failed");
  return new File([blob], `${baseName}.webp`, { type: "image/webp" });
}