/**
 * Resolves a media reference into a usable URL for the browser.
 *
 * Public media (full http(s) URLs, e.g. legacy uploads in the public `media`
 * bucket, avatars and banners) is returned unchanged.
 *
 * Private media is stored as a bare storage path (e.g.
 * `userId/timestamp-random.ext`). These are resolved through the authorized
 * server route `/api/media/signed-url`, which verifies ownership, profile
 * privacy, follow status and Stage 21A blocking before minting a short-lived
 * signed URL.
 *
 * Results are cached in module scope so multiple components viewing the same
 * media do not each trigger an authorization round-trip. The cache is keyed by
 * the storage path and refreshed well before the signed URL expires.
 */

import { isStoragePath, storagePathFromUrl } from "@/lib/media";

const CACHE_TTL_MS = 45_000; // refresh 15 s before a 60 s signed URL expires
const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function isAvailableFetch(): boolean {
  return typeof fetch === "function";
}

function getCached(path: string): string | null {
  const hit = cache.get(path);
  if (hit) return hit;
  cache.delete(path);
  return null;
}

function setCached(path: string, url: string): void {
  cache.set(path, url);
  // Schedule a soft expiry so a stale entry is cleared without a re-render.
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      if (cache.get(path) === url) cache.delete(path);
    }, CACHE_TTL_MS);
  }
}

export async function resolveMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  // Public URLs (legacy public bucket, avatars, banners) are used directly.
  if (!isStoragePath(url)) return url;

  const path = storagePathFromUrl(url) ?? url;
  const cached = getCached(path);
  if (cached) return cached;

  const existing = inFlight.get(path);
  if (existing) return existing;

  if (!isAvailableFetch()) return null;

  const promise = (async () => {
    try {
      const response = await fetch("/api/media/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
        credentials: "same-origin",
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { signedUrl?: string | null };
      if (data?.signedUrl) {
        setCached(path, data.signedUrl);
        return data.signedUrl;
      }
      return null;
    } catch {
      return null;
    } finally {
      inFlight.delete(path);
    }
  })();

  inFlight.set(path, promise);
  return promise;
}

/** Invalidate cached signed URLs (e.g. after a sign-out). */
export function clearMediaUrlCache(): void {
  cache.clear();
  inFlight.clear();
}