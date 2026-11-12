/**
 * GET /api/moderation/staff/search?q=...
 *   Administrator-only search of existing AfterFur accounts for staff appointment.
 *   Matches username/display name (safe). Does NOT return email or sensitive fields.
 *   Requires migration 0033 context for staff management access (admin auth still enforced).
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("administrator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/staff/search", 30, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").trim().replace(/[%(),]/g, "");
    if (q.length < 2) return NextResponse.json({ users: [] });

    // Safe fields only. Email is never selected/returned.
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .order("username", { ascending: true })
      .limit(12);

    if (error) {
      const code = String((error as any).code ?? "");
      if (code === "42P01" || code === "PGRST205") {
        return NextResponse.json({ error: "migration_required", message: "Database setup is incomplete. Apply required migrations." }, { status: 503 });
      }
      return NextResponse.json({ error: "search_failed" }, { status: 500 });
    }

    const ids = (data ?? []).map((p: any) => p.id).filter(Boolean);
    const { data: existingRoles } = ids.length
      ? await supabase.from("moderator_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as any[] };
    const roleMap = new Map(((existingRoles ?? []) as any[]).map((r) => [r.user_id, r.role]));

    const users = (data ?? []).map((p: any) => ({
      id: p.id,
      username: p.username ?? null,
      displayName: p.display_name ?? null,
      avatarUrl: p.avatar_url ?? null,
      existingRole: roleMap.get(p.id) ?? null,
    }));

    return NextResponse.json({ users });
  } catch (err: any) {
    if (err?.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err?.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
