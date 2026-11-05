/**
 * GET /api/moderation/me
 *   Returns verified moderator context for the authenticated user.
 *   Uses trusted request auth (Authorization Bearer verified by Supabase Auth)
 *   and trusted app_metadata.afterfur_staff_admin / moderator_roles only.
 *   Never trusts user_metadata. Safe response (no tokens/secrets).
 */
import { NextResponse } from "next/server";
import { requireModeratorRole } from "@/lib/moderation";

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    return NextResponse.json({
      ok: true,
      userId: ctx.userId,
      role: ctx.role,
      isAdministrator: ctx.isAdministrator,
      canModerate: ctx.canModerate,
      canManageUsers: ctx.canManageUsers,
      canManageStaff: ctx.canManageStaff,
    });
  } catch (err: any) {
    if (err?.status === 401) return NextResponse.json({ error: "unauthorized", ok: false }, { status: 401 });
    if (err?.status === 403) return NextResponse.json({ error: "forbidden", ok: false, role: null }, { status: 403 });
    return NextResponse.json({ error: "internal_error", ok: false }, { status: 500 });
  }
}
