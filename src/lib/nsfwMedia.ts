export function storagePathFromPublicUrl(url: string): string | null {
  if (!/\/object\/public\/media\//.test(url)) return null;
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

export function isNsfwReconciliationCandidate(post: { classification?: string | null; media_urls?: string[] | null; media_reconciled_at?: string | null }): boolean {
  if (post.classification !== "NSFW") return false;
  if (post.media_reconciled_at) return false;
  const urls = post.media_urls ?? [];
  return urls.some((u) => /\/object\/public\/media\//.test(u));
}
