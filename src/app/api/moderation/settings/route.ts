/**
 * GET /api/moderation/settings
 *   Returns the authenticated user's moderator UI preferences.
 *   Requires moderator role or above.
 *
 * PUT /api/moderation/settings
 *   Updates the authenticated user's moderator UI preferences.
 *   Requires moderator role or above.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/settings", 60, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data } = await supabase.rpc("get_my_ui_preferences", {});
    const stored = (data ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      queueAutoRefresh: stored.queue_auto_refresh ?? true,
      notifyNewReports: stored.notify_new_reports ?? true,
      notifyNewAppeals: stored.notify_new_appeals ?? true,
      showResolvedReports: stored.show_resolved_reports ?? false,
      itemsPerPage: stored.items_per_page ?? 20,
    });
  } catch (err: any) {
    if (err.status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err.status === 403) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/settings", 20, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const prefs = {
      queue_auto_refresh: !!body.queueAutoRefresh,
      notify_new_reports: !!body.notifyNewReports,
      notify_new_appeals: !!body.notifyNewAppeals,
      show_resolved_reports: !!body.showResolvedReports,
      items_per_page: typeof body.itemsPerPage === "number" ? body.itemsPerPage : 20,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.rpc("update_ui_preferences", { p_preferences: prefs });
    if (error) {
      return NextResponse.json({ error: "internal_error" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err.status === 403) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}