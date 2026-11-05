import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export type ModerationContentState = { moderation_status?: string | null };

export async function getViewerId(): Promise<string | null> {
  const supabase = createServerClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function isStaffViewer(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const supabase = createServerClient();
  if (!supabase) return false;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const meta = (userData.user as any)?.app_metadata ?? {};
    if (meta.afterfur_staff_admin === true || meta.afterfur_staff_admin === "true") return true;
  } catch {}
  try {
    const { data } = await supabase.from("moderator_roles").select("role").eq("user_id", userId).maybeSingle();
    return Boolean((data as any)?.role);
  } catch {
    return false;
  }
}

export function isModerationHidden(row: ModerationContentState | null | undefined): boolean {
  return (row?.moderation_status ?? "visible") === "removed";
}

export async function filterVisibleForViewer<T extends ModerationContentState>(rows: T[]): Promise<T[]> {
  const viewerId = await getViewerId();
  const staff = await isStaffViewer(viewerId);
  if (staff) return rows;
  return rows.filter((r) => !isModerationHidden(r));
}

export async function assertVisibleOrStaff<T extends ModerationContentState>(row: T | null | undefined): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!row) return { ok: false, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  if (!isModerationHidden(row)) return { ok: true };
  const viewerId = await getViewerId();
  const staff = await isStaffViewer(viewerId);
  if (staff) return { ok: true };
  // Hide existence details from ordinary viewers.
  return { ok: false, response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
}
