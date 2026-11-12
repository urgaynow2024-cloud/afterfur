/**
 * GET /api/messages/attachments/signed-url
 *
 * Mints a short-lived signed URL for downloading a message attachment.
 * Enforces conversation membership server-side before generating the URL.
 * The service-role client is used only on the server and never reaches the
 * browser.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

type SignedUrlQuery = {
  path?: string;
  bucket?: string;
  expiresInSeconds?: string;
};

const DEFAULT_EXPIRES = 300; // 5 minutes
const MAX_EXPIRES = 3600; // 1 hour

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const user = await getVerifiedUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(getRateLimitKey({ userId: user.id, ip: getClientIp(request) }), "/api/messages/attachments/signed-url", 30, 60);
    if (!rl.allowed) return rl.response;

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = user.id;

    const url = new URL(request.url);
    const path = url.searchParams.get("path");
    const bucket = url.searchParams.get("bucket") || "message_attachments";
    const expiresInSeconds = url.searchParams.get("expiresInSeconds");

    if (!path) return badRequest("A storage path is required.");

    // Reject path traversal.
    const segments = path.split("/");
    if (segments.length < 2 || segments.some((s) => s === "" || s === "." || s === "..")) {
      return badRequest("Invalid storage path.");
    }

    // Look up the attachment record to establish conversation membership.
    const { data: attachment, error: attachmentError } = await supabase
      .from("message_attachments")
      .select("conversation_id, uploader_id, storage_path, bucket_id, media_type")
      .eq("storage_path", path)
      .eq("bucket_id", bucket)
      .maybeSingle();

    if (attachmentError) return NextResponse.json({ error: "internal_error" }, { status: 500 });
    if (!attachment) return NextResponse.json({ error: "attachment_not_found" }, { status: 404 });

    // Verify the caller is a member of the conversation.
    const { data: membership, error: membershipError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", attachment.conversation_id)
      .eq("user_id", userId)
      .limit(1);

    if (membershipError) return NextResponse.json({ error: "internal_error" }, { status: 500 });
    if ((membership ?? []).length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const requestedExpires = expiresInSeconds ? parseInt(expiresInSeconds, 10) : DEFAULT_EXPIRES;
    const expires = Number.isFinite(requestedExpires) ? Math.max(60, Math.min(MAX_EXPIRES, requestedExpires)) : DEFAULT_EXPIRES;

    const { data, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(path, expires);
    if (signedError || !data?.signedUrl) return NextResponse.json({ error: "internal_error" }, { status: 500 });

    return NextResponse.json({
      signedUrl: data.signedUrl,
      bucket,
      path,
      mediaType: attachment.media_type ?? null,
      expiresInSeconds: expires,
    });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}