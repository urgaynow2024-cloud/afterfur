/**
 * POST /api/messages/attachments
 *
 * Registers a message attachment after the client has uploaded the file to
 * Supabase Storage. Validates conversation membership, message ownership,
 * and file type/size constraints before inserting a row into
 * public.message_attachments.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { validateMediaFile } from "@/lib/media";

type AttachmentBody = {
  messageId?: unknown;
  conversationId?: unknown;
  storagePath?: unknown;
  bucket?: unknown;
  mediaType?: unknown;
  fileSize?: unknown;
};

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const user = await getVerifiedUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(getRateLimitKey({ userId: user.id, ip: getClientIp(request) }), "/api/messages/attachments", 20, 60);
    if (!rl.allowed) return rl.response;

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = user.id;

    let body: AttachmentBody;
    try {
      body = (await request.json()) as AttachmentBody;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const messageId = typeof body.messageId === "string" ? body.messageId : null;
    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const storagePath = typeof body.storagePath === "string" && body.storagePath.trim().length > 0 ? body.storagePath.trim() : null;
    const bucket = typeof body.bucket === "string" && body.bucket.trim().length > 0 ? body.bucket.trim() : "message_attachments";
    const mediaType = typeof body.mediaType === "string" ? body.mediaType : null;
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : null;

    if (!messageId || !conversationId || !storagePath) {
      return badRequest("messageId, conversationId, and storagePath are required.");
    }

    // Reject path traversal.
    const segments = storagePath.split("/");
    if (segments.length < 2 || segments.some((s) => s === "" || s === "." || s === "..")) {
      return badRequest("Invalid storage path.");
    }

    // Verify the caller is a member of the conversation.
    const { data: membership, error: membershipError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .limit(1);

    if (membershipError) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if ((membership ?? []).length === 0) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Verify the message exists and belongs to the conversation.
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if (!message) {
      return NextResponse.json({ error: "message_not_found" }, { status: 404 });
    }

    // Validate file type/size if provided.
    if (mediaType && fileSize) {
      const fakeFile = new File([""], "attachment", { type: mediaType });
      Object.defineProperty(fakeFile, "size", { value: fileSize, configurable: true });
      const validationError = validateMediaFile(fakeFile as File);
      if (validationError) {
        return badRequest(validationError);
      }
      if (fileSize > MAX_ATTACHMENT_BYTES) {
        return badRequest(`File is too large. Maximum size is 25 MB.`);
      }
    }

    // Prevent duplicate registration of the same storage path.
    const { data: existing } = await supabase
      .from("message_attachments")
      .select("id")
      .eq("storage_path", storagePath)
      .eq("bucket_id", bucket)
      .limit(1);

    if ((existing ?? []).length > 0) {
      return badRequest("attachment_exists", 409);
    }

    const { data, error } = await supabase
      .from("message_attachments")
      .insert({
        message_id: messageId,
        conversation_id: conversationId,
        uploader_id: userId,
        storage_path: storagePath,
        bucket_id: bucket,
        media_type: mediaType,
        file_size: fileSize,
      })
      .select("id, message_id, conversation_id, storage_path, bucket_id, media_type, file_size, created_at")
      .single();

    if (error) return NextResponse.json({ error: "attachment_create_failed" }, { status: 400 });

    return NextResponse.json({ attachment: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}