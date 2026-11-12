import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getEmailProvider } from "@/lib/email";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const rl = await rateLimit(getRateLimitKey({ ip: getClientIp(request) }), "/api/account/reminder-worker", 10, 60);
  if (!rl.allowed) return rl.response!;
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provider = getEmailProvider();
  if (!provider) {
    return NextResponse.json({ error: "Email provider not configured" }, { status: 503 });
  }
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: requests, error } = await (supabase as any)
    .from("account_deletion_requests")
    .select("id,user_id,scheduled_deletion_at,reminder_sent_at,status,option")
    .eq("status", "pending")
    .eq("option", "scheduled_30d")
    .not("reminder_scheduled_at", "is", null)
    .lte("reminder_scheduled_at", new Date().toISOString())
    .is("reminder_sent_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; status: string; error?: string }[] = [];
  for (const req of requests ?? []) {
    const { data: claimed, error: claimError } = await (supabase as any)
      .from("account_deletion_requests")
      .update({ reminder_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", req.id)
      .is("reminder_sent_at", null)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) {
      results.push({ id: req.id, status: "skipped", error: claimError?.message ?? "Already claimed" });
      continue;
    }

    const { data: userData } = await supabase.auth.admin.getUserById(req.user_id);
    const email = userData?.user?.email;
    if (!email) {
      await (supabase as any).from("account_deletion_requests").update({ reminder_sent_at: null, updated_at: new Date().toISOString() }).eq("id", req.id);
      results.push({ id: req.id, status: "failed", error: "No email" });
      continue;
    }

    const result = await provider.send({
      to: email,
      subject: "Your AfterFur account will be deleted in 7 days",
      text: `Your account is scheduled for deletion on ${new Date(req.scheduled_deletion_at).toLocaleDateString()}. Sign in to cancel.`,
    });

    if (!result.ok) {
      await (supabase as any).from("account_deletion_requests").update({ reminder_sent_at: null, updated_at: new Date().toISOString() }).eq("id", req.id);
      results.push({ id: req.id, status: "failed", error: result.error });
    } else {
      results.push({ id: req.id, status: "sent" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
