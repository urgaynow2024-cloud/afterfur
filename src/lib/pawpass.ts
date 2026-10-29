import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type PawPassStatus = "active" | "cancel_at_period_end" | "past_due" | "expired" | "refunded";
export type PawPassEntitlement = { active: boolean; status: PawPassStatus; currentPeriodEnd: string | null };

export function parsePawPassEntitlement(value: unknown): PawPassEntitlement | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { is_active?: unknown; status?: unknown; current_period_end?: unknown };
  const allowed: PawPassStatus[] = ["active", "cancel_at_period_end", "past_due", "expired", "refunded"];
  if (typeof row.is_active !== "boolean" || typeof row.status !== "string" || !allowed.includes(row.status as PawPassStatus)) return null;
  if (row.current_period_end !== null && typeof row.current_period_end !== "string") return null;
  return { active: row.is_active, status: row.status as PawPassStatus, currentPeriodEnd: row.current_period_end };
}

export async function loadMyPawPassEntitlement(client: SupabaseClient<Database>): Promise<{ entitlement: PawPassEntitlement | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("get_my_pawpass_entitlement");
    if (error) return { entitlement: null, error: error.message };
    const entitlement = parsePawPassEntitlement(data?.[0]);
    return { entitlement, error: null };
  } catch {
    return { entitlement: null, error: "Could not load PawPass status." };
  }
}
