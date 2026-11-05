/**
 * POST /api/messages/[conversationId]/notify
 *
 * Creates a new-message notification for the other participant in a
 * conversation after a message is sent. Enforces conversation membership,
 * blocking, notification preferences, and muting server-side.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createMessageNotification } from "@/lib/notifications.server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const actorId = userData.user.id;

    // Verify the actor is a participant in the conversation.
    const { data: membership, error: membershipError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", actorId)
      .limit(1);

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 });
    }
    if ((membership ?? []).length === 0) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // Find the other participant (recipient).
    const { data: participants, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    if (participantsError) {
      return NextResponse.json({ error: participantsError.message }, { status: 500 });
    }

    const recipientId = (participants ?? [])
      .map((p: any) => p.user_id)
      .find((id: string) => id !== actorId);

    if (!recipientId) {
      return NextResponse.json({ error: "no_recipient" }, { status: 400 });
    }

    await createMessageNotification({ actorId, recipientId, conversationId });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
