/**
 * PrivateMediaItem is a thin compatibility wrapper around MediaItem.
 *
 * MediaItem already resolves private storage paths through the authorized
 * `/api/media/signed-url` route, so this wrapper exists so that callers that
 * previously imported `MediaItem` from `@/components/post/private-media-item`
 * continue to work.
 */

"use client";

import { MediaItem } from "@/components/post/media-item";

export { MediaItem };