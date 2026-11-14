/**
 * GET /api/moderation/reports/assignable
 *   List authorised moderators that a report can be assigned to.
 *   Requires moderator role or above (any moderator may assign a report).
 *   Returns safe profile fields only; never email or credentials.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

type SupabaseLikeError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

function isMissingRelationError(error: SupabaseLikeError): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") return true;
  const hay = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    (hay.includes("does not exist") && (hay.includes("relation") || hay.includes("table") || hay.includes("column"))) ||
    hay.includes("could not find the table")
  );
}

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/reports/assignable", 120, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("moderator_roles")
      .select("user_id, role, profile:profiles!moderator_roles_user_id_fkey(username, display_name)");

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          {
            error: "migration_required",
            code: "migration_required",
            message: "Moderator database setup is incomplete. Apply migration 0033 to the target database.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const moderators = ((data ?? []) as unknown as Array<{
      user_id: string;
      role: string;
      profile?: { username: string | null; display_name: string | null } | null;
    }>)
      .map((row) => {
        const profile = row.profile;
        if (!profile?.username) return null;
        return {
          id: row.user_id,
          username: profile.username,
          displayName: profile.display_name ?? null,
          role: row.role,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.username.localeCompare(b!.username));

    return NextResponse.json({ moderators, currentUserId: ctx.userId });
  } catch (err) {
    const status = typeof (err as { status?: unknown })?.status === "number" ? (err as { status: number }).status : undefined;
    if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}