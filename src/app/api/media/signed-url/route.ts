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
  post_id: string | null;
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
  id: string;
  classification: string | null;
};

const DEFAULT_EXPIRES = 300;
const MAX_EXPIRES = 3600;

function safeDiagEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AF_MOD_DIAG === "1";
}

function diag(event: string, fields: Record<string, unknown>) {
  if (!safeDiagEnabled()) return;
  try {
    console.info(`[media-signed-url] ${event}`, JSON.stringify(fields));
  } catch {}
}

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

function supabaseErrorInfo(error: any): Record<string, unknown> {
  return {
    code: error?.code ?? error?.error_code ?? error?.status,
    message: error?.message ?? error?.error ?? String(error),
    details: error?.details ?? error?.hint ?? undefined,
    name: error?.name,
  };
}

async function getAuthenticatedUserId(request: Request): Promise<{ id: string | null; diag: Record<string, unknown> }> {
  const result: Record<string, unknown> = { step: "getVerifiedUser" };
  try {
    const user = await getVerifiedUser(request);
    if (user) {
      result.ok = true;
      result.userId = user.id;
      diag("auth_result", result);
      return { id: user.id, diag: result };
    }
    result.ok = false;
    result.reason = "no_user";
    diag("auth_result", result);
    return { id: null, diag: result };
  } catch (error) {
    result.ok = false;
    result.error = supabaseErrorInfo(error);
    diag("auth_result", result);
    return { id: null, diag: result };
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserId(request);
  diag("request_start", { path: request.url, hasAuth: Boolean(auth.id) });

  const requesterId = auth.id;
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
  diag("supabase_client", { configured: Boolean(supabase) });
  if (!supabase) return serverError("Supabase is not configured on the server.");

  // Check if user is enforced/banned.
  const { data: enforcedData, error: enforcedError } = await (supabase as any).rpc("is_user_enforced", {
    p_user_id: requesterId,
  });
  diag("enforced_check", { error: enforcedError ? supabaseErrorInfo(enforcedError) : null, data: Boolean(enforcedData) });
  if (enforcedError || enforcedData) {
    return forbidden("This content is unavailable.");
  }

  // Look up the media record.
  const { data: media, error: mediaError } = await supabase
    .from("media")
    .select("id,storage_path,bucket_id,owner_id,media_type,post_id")
    .eq("storage_path", path)
    .maybeSingle<MediaRow>();

  diag("media_lookup", {
    error: mediaError ? supabaseErrorInfo(mediaError) : null,
    found: Boolean(media),
    mediaId: media?.id ?? null,
    storagePath: media?.storage_path ?? null,
    bucketId: media?.bucket_id ?? null,
    ownerId: media?.owner_id ?? null,
  });

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

    diag("profile_lookup", {
      error: profileError ? supabaseErrorInfo(profileError) : null,
      found: Boolean(profile),
      isPrivate: profile?.is_private ?? null,
    });

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

    diag("follow_check", {
      error: followError ? supabaseErrorInfo(followError) : null,
      followStatus: follow?.status ?? null,
    });

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

    diag("block_check", {
      error: blockError ? supabaseErrorInfo(blockError) : null,
      blockCount: (blockRows ?? []).length,
    });

    if (blockError) return serverError();
    if ((blockRows ?? []).length > 0) {
      return forbidden("This content is unavailable.");
    }
  }

  // Explicit NSFW/classification authorization.
  // Use the media record's post_id to find the associated post directly.
  // Fall back to scanning the owner's posts for the path in media_urls for
  // legacy media records that lack a post_id.
  let classifications: (string | null)[] = [];
  if (media.post_id) {
    const { data: postRows, error: postError } = await supabase
      .from("posts")
      .select("id,classification")
      .eq("id", media.post_id)
      .limit(1);

    diag("post_lookup", {
      error: postError ? supabaseErrorInfo(postError) : null,
      found: Boolean(postRows?.[0]),
      postId: media.post_id,
      classification: postRows?.[0]?.classification ?? null,
    });

    if (postError) return serverError();
    classifications = (postRows ?? []).map((p: PostRow) => p.classification ?? null);
  } else {
    // Legacy media without post_id: scan the owner's posts for a matching path.
    const { data: ownerPosts, error: ownerPostsError } = await supabase
      .from("posts")
      .select("id,classification,media_urls")
      .eq("author_id", ownerId)
      .limit(50);

    diag("post_lookup", {
      error: ownerPostsError ? supabaseErrorInfo(ownerPostsError) : null,
      found: false,
      postId: null,
      reason: "legacy media without post_id; scanning owner posts",
      scannedCount: (ownerPosts ?? []).length,
    });

    if (ownerPostsError) return serverError();
    const match = (ownerPosts ?? []).find((p: any) =>
      Array.isArray(p.media_urls) && p.media_urls.includes(path),
    );
    if (match) classifications.push(match.classification ?? null);
  }

  if (classifications.length === 0) {
    // Cannot determine classification from associated posts: handle safely.
    // Deny for private signed-URL access rather than assuming SFW.
    diag("classification_result", { result: "denied_no_classification" });
    return forbidden("This content is unavailable.");
  } else {
    const hasUnclassified = classifications.some((c) => c === null || c === undefined || c === "");
    if (hasUnclassified) {
      // Unclassified/NULL classification is handled safely: deny for private
      // signed-URL access. Frontend blur/reveal is not a security control.
      diag("classification_result", { result: "denied_unclassified" });
      return forbidden("This content is unavailable.");
    }
    // NSFW and SFW: authenticated registered users may view permitted media.
    // ad_creator is required for NSFW POSTING, not for viewing.
    diag("classification_result", { result: "allowed", classifications });
  }

  const requestedExpires = typeof body.expiresInSeconds === "number" ? body.expiresInSeconds : DEFAULT_EXPIRES;
  const expiresInSeconds = Math.max(60, Math.min(MAX_EXPIRES, Math.floor(requestedExpires || DEFAULT_EXPIRES)));

  const { data, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);

  diag("storage_sign", {
    error: signedError ? supabaseErrorInfo(signedError) : null,
    hasSignedUrl: Boolean(data?.signedUrl),
    bucket,
  });

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
