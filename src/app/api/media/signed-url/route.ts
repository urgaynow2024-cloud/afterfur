import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

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

type PostRow = {
  classification: string | null;
};

const DEFAULT_EXPIRES = 300;
const MAX_EXPIRES = 3600;

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
function unauthorized(message = "Authentication required.") {
  return NextResponse.json({ error: message }, { status: 401 });
}
function forbidden(message = "This content is unavailable.") {
  return NextResponse.json({ error: message }, { status: 403 });
}
function notFound(message = "Media not found.") {
  return NextResponse.json({ error: message }, { status: 404 });
}
function serverError(message = "Could not generate a signed URL.") {
  return NextResponse.json({ error: message }, { status: 500 });
}
async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const user = await getVerifiedUser(request);
  return user?.id ?? null;
}

export async function POST(request: Request) {
  const requesterId = await getAuthenticatedUserId(request);
  const rlKey = getRateLimitKey({ userId: requesterId, ip: getClientIp(request) });
  const rl = await rateLimit(rlKey, "/api/media/signed-url", 30, 60);
  if (!rl.allowed) return rl.response!;
  if (!requesterId) return unauthorized();

  let body: SignedUrlBody;
  try {
    body = (await request.json()) as SignedUrlBody;
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const path = typeof body.path === "string" && body.path.trim().length > 0 ? body.path.trim() : null;
  if (!path) return badRequest("A media storage path is required.");

  const segments = path.split("/");
  if (segments.length < 2 || segments.some((s) => s === "" || s === "." || s === "..")) {
    return badRequest("Invalid media path.");
  }

  const supabase = createServerClient();
  if (!supabase) return serverError("Supabase is not configured on the server.");

  const { data: enforcedData, error: enforcedError } = await (supabase as any).rpc("is_user_enforced", {
    p_user_id: requesterId,
  });
  if (enforcedError || enforcedData) {
    return forbidden("This content is unavailable.");
  }

  const { data: media, error: mediaError } = await supabase
    .from("media")
    .select("id,storage_path,bucket_id,owner_id,media_type")
    .eq("storage_path", path)
    .maybeSingle<MediaRow>();

  if (mediaError) return serverError();
  if (!media) return notFound("Media not found.");

  const ownerId = media.owner_id;
  const bucket = typeof body.bucket === "string" && body.bucket.trim() ? body.bucket.trim() : media.bucket_id;
  if (bucket !== media.bucket_id) return forbidden();

  const isOwner = ownerId === requesterId;

  let isPrivate = false;
  if (!isOwner) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id,is_private")
      .eq("id", ownerId)
      .maybeSingle<ProfileRow>();

    if (profileError) return serverError();
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

    if (followError) return serverError();
    if (!follow || follow.status !== "accepted") return forbidden("This account is private.");
  }

  // Bidirectional block scoped to (requester, owner) pair only.
  if (!isOwner) {
    const { data: blockRows, error: blockError } = await supabase
      .from("blocks")
      .select("blocker_id,blocked_id")
      .or(
        `and(blocker_id.eq.${requesterId},blocked_id.eq.${ownerId}),and(blocker_id.eq.${ownerId},blocked_id.eq.${requesterId})`
      )
      .limit(1);

    if (blockError) return serverError();
    if ((blockRows ?? []).length > 0) {
      return forbidden("This content is unavailable.");
    }
  }

  // Explicit NSFW/classification authorization.
  const { data: postRows, error: postError } = await supabase
    .from("posts")
    .select("id,classification")
    .filter("media_urls", "cs", `["${path}"]`)
    .limit(10);

  if (postError) return serverError();
  const classifications = (postRows ?? []).map((p: PostRow) => p.classification ?? null);

  if (classifications.length === 0) {
    // Cannot determine classification from associated posts: handle safely.
    // Deny for private signed-URL access rather than assuming SFW.
    return forbidden("This content is unavailable.");
  } else {
    const hasUnclassified = classifications.some((c) => c === null || c === undefined || c === "");
    if (hasUnclassified) {
      // Unclassified/NULL classification is handled safely: deny for private
      // signed-URL access. Frontend blur/reveal is not a security control.
      return forbidden("This content is unavailable.");
    }
    // NSFW and SFW: authenticated registered users may view permitted media.
    // ad_creator is required for NSFW POSTING, not for viewing.
  }

  const requestedExpires = typeof body.expiresInSeconds === "number" ? body.expiresInSeconds : DEFAULT_EXPIRES;
  const expiresInSeconds = Math.max(60, Math.min(MAX_EXPIRES, Math.floor(requestedExpires || DEFAULT_EXPIRES)));

  const { data, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (signedError || !data?.signedUrl) {
    return serverError();
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    bucket,
    path,
    mediaType: media.media_type ?? null,
    expiresInSeconds,
  });
}
