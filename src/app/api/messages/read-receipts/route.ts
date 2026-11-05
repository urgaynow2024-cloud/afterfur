/**
 * POST /api/messages/read-receipts
 *
 * Marks a batch of messages as read for the authenticated caller within a
 * conversation. Enforces conversation membership server-side before calling
 * the `mark_messages_read` RPC.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type ReadReceiptBody = {
  conversationId?: unknown;
  messageIds?: unknown;
};

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;

    let body: ReadReceiptBody;
    try {
      body = (await request.json()) as ReadReceiptBody;
    } catch {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
    const messageIds = Array.isArray(body.messageIds)
      ? body.messageIds.filter((id): id is string => typeof id === "string")
      : [];

    if (!conversationId || messageIds.length === 0) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }

    // Verify membership before invoking the RPC (defense in depth; the RPC
    // also checks membership via RLS).
    const { data: membership, error: membershipError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .limit(1);

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
    if ((membership ?? []).length === 0) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error: rpcError } = await supabase.rpc("mark_messages_read", {
      p_conversation_id: conversationId,
      p_message_ids: messageIds,
    });

    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
