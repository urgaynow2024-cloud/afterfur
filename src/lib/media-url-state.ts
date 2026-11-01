/**
 * React hooks for resolving media URLs that may be private storage paths.
 *
 * Public URLs (full http(s) URLs, e.g. legacy uploads in the public `media`
 * bucket, avatars and banners) are returned unchanged.
 *
 * Private media is stored as a bare storage path (e.g.
 * `userId/timestamp-random.ext`). These are resolved through the authorized
 * server route `/api/media/signed-url`, which verifies ownership, profile
 * privacy, follow status and Stage 21A blocking before minting a short-lived
 * signed URL.
 */

import { useEffect, useState } from "react";
import { isStoragePath } from "@/lib/media";
import { resolveMediaUrl } from "@/lib/media-resolver";

export type MediaUrlState = {
  url: string | null;
  loading: boolean;
  error: boolean;
};

export function useResolvedMediaUrl(url: string | null | undefined): MediaUrlState {
  const [state, setState] = useState<MediaUrlState>(() => {
    if (!url) return { url: null, loading: false, error: false };
    if (!isStoragePath(url)) return { url, loading: false, error: false };
    return { url: null, loading: true, error: false };
  });

  useEffect(() => {
    if (!url) {
      setState({ url: null, loading: false, error: false });
      return;
    }
    if (!isStoragePath(url)) {
      setState({ url, loading: false, error: false });
      return;
    }
    let cancelled = false;
    setState({ url: null, loading: true, error: false });
    resolveMediaUrl(url)
      .then((resolved) => {
        if (cancelled) return;
        setState({ url: resolved, loading: false, error: !resolved });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ url: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

export type ResolvedMediaItem = {
  original: string;
  resolved: string | null;
  loading: boolean;
  error: boolean;
};

export type MediaArrayState = {
  items: ResolvedMediaItem[];
  loading: boolean;
};

/**
 * Resolves an array of media URLs. Public URLs are returned immediately;
 * private storage paths are resolved through the authorized route. The
 * returned array always matches the input order.
 */
export function useResolvedMediaUrls(urls: readonly string[] | null | undefined): MediaArrayState {
  const [state, setState] = useState<MediaArrayState>(() => {
    const list = urls ?? [];
    return {
      items: list.map((url) => {
        if (!isStoragePath(url)) return { original: url, resolved: url, loading: false, error: false };
        return { original: url, resolved: null, loading: true, error: false };
      }),
      loading: list.some((url) => isStoragePath(url)),
    };
  });

  useEffect(() => {
    const list = urls ?? [];
    const privateUrls = list.filter((url) => isStoragePath(url));
    if (privateUrls.length === 0) {
      setState({
        items: list.map((url) => ({ original: url, resolved: url, loading: false, error: false })),
        loading: false,
      });
      return;
    }
    let cancelled = false;
    setState((current) => ({
      items: current.items.map((item) => ({ ...item, loading: true, error: false })),
      loading: true,
    }));
    Promise.all(privateUrls.map((url) => resolveMediaUrl(url).then((resolved) => ({ url, resolved }))))
      .then((results) => {
        if (cancelled) return;
        const resolvedByOriginal = new Map(results.map((r) => [r.url, r.resolved]));
        setState({
          items: list.map((url) => {
            if (!isStoragePath(url)) return { original: url, resolved: url, loading: false, error: false };
            const resolved = resolvedByOriginal.get(url) ?? null;
            return { original: url, resolved, loading: false, error: !resolved };
          }),
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState((current) => ({
          items: current.items.map((item) => ({ ...item, loading: false, error: true })),
          loading: false,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [urls]);

  return state;
}