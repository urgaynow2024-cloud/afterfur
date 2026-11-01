/**
 * POST /api/media/signed-url
 *
 * Authorizes a request for a short-lived signed URL to a private media asset.
 *
 * Security model:
 *   - Requires an authenticated Supabase session (verified via the anon client
 *     session cookie). We never trust a client-supplied user id.
 *   - The media record is looked up from the database using a trusted identifier
 *     (the storage path). Ownership is established from the database row, never
 *     from request body fields.
 *   - Private-profile access is granted only to the owner or an accepted
 *     follower. Pending, rejected, and unrelated users are denied.
 *   - Stage 21A blocking restrictions are enforced: a user who has blocked the
 *     media owner (or been blocked by them) cannot access the asset.
 *   - The signed URL is generated server-side with the service-role client
 *     only after authorization succeeds. The service-role key never reaches the
 *     browser.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/client";
import { createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignedUrlBody = {
  path?: unknown;
  bucket?: unknown;
  expiresInSeconds?: unknown;
};

type MediaRow = {
  id: string;
  storage_path: string;
  bucket_id: string;
  owner_id: string;
  media_type: string | null;
};

type ProfileRow = {
  id: string;
  is_private: boolean | null;
};

type FollowRow = {
  status: string;
};

type BlockRow = {
  blocker_id: string;
  blocked_id: string;
};

const DEFAULT_EXPIRES = 300; // 5 minutes
const MAX_EXPIRES = 3600; // 1 hour

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function unauthorized(message = "Authentication required.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

function forbidden(message = "This media is unavailable.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

function notFound(message = "Media not found.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

function serverError(message = "Could not generate a signed URL.") {
  return NextResponse.json({ error: message }, { status: 500 });
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

export async function POST(request: Request) {
  const requesterId = await getAuthenticatedUserId();
  if (!requesterId) return unauthorized();

  let body: SignedUrlBody;
  try {
    body = (await request.json()) as SignedUrlBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const path = typeof body.path === "string" && body.path.trim().length > 0 ? body.path.trim() : null;
  if (!path) return badRequest("A media storage path is required.");

  // Reject paths that escape the user-scoped folder. All media lives under
  // <owner_id>/... so the first path segment is the owner's id.
  const segments = path.split("/");
  if (segments.length < 2 || segments.some((s) => s === "" || s === "." || s === "..")) {
    return badRequest("Invalid media path.");
  }

  const supabase = createServerClient();
  if (!supabase) return serverError("Supabase is not configured on the server.");

  const { data: media, error: mediaError } = await supabase
    .from("media")
    .select("id,storage_path,bucket_id,owner_id,media_type")
    .eq("storage_path", path)
    .maybeSingle<MediaRow>();

  if (mediaError) return serverError(mediaError.message);
  if (!media) return notFound("Media not found.");

  // Trusted ownership from the database row.
  const ownerId = media.owner_id;
  const bucket = typeof body.bucket === "string" && body.bucket.trim() ? body.bucket.trim() : media.bucket_id;
  if (bucket !== media.bucket_id) return forbidden();

  const isOwner = ownerId === requesterId;

  // Public media in the public bucket is readable by anyone who is not blocked.
  // Private media requires owner or accepted-follower status.
  let isPrivate = false;
  if (!isOwner) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,is_private")
      .eq("id", ownerId)
      .maybeSingle<ProfileRow>();

    if (profileError) return serverError(profileError.message);
    if (!profile) return notFound("Media owner not found.");
    isPrivate = !!profile.is_private;
  }

  if (isPrivate) {
    const { data: follow, error: followError } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", requesterId)
      .eq("following_id", ownerId)
      .maybeSingle<FollowRow>();

    if (followError) return serverError(followError.message);
    if (!follow || follow.status !== "accepted") return forbidden("This account is private.");
  }

  // Stage 21A blocking: bidirectional block check enforced server-side.
  const { data: block, error: blockError } = await supabase
    .from("blocks")
    .select("blocker_id,blocked_id")
    .or(`blocker_id.eq.${requesterId},blocked_id.eq.${requesterId}`)
    .maybeSingle<BlockRow>();

  if (blockError) return serverError(blockError.message);
  if (block && (block.blocker_id === requesterId || block.blocked_id === requesterId)) {
    return forbidden("This content is unavailable.");
  }

  const requestedExpires = typeof body.expiresInSeconds === "number" ? body.expiresInSeconds : DEFAULT_EXPIRES;
  const expiresInSeconds = Math.max(60, Math.min(MAX_EXPIRES, Math.floor(requestedExpires || DEFAULT_EXPIRES)));

  const { data, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (signedError || !data?.signedUrl) {
    return serverError(signedError?.message || "Could not generate a signed URL.");
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    bucket,
    path,
    mediaType: media.media_type ?? null,
    expiresInSeconds,
  });
}