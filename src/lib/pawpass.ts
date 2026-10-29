import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type PawPassStatus = "active" | "cancel_at_period_end" | "past_due" | "expired" | "refunded";
export type MembershipSource = "paid" | "founding_reward" | "owner_granted" | "owner_test";
export type PlanInterval = "monthly" | "yearly" | null;

export type PawPassEntitlement = { active: boolean; status: PawPassStatus; currentPeriodEnd: string | null };

export type MembershipStatus = {
  source: MembershipSource;
  planInterval: PlanInterval;
  status: PawPassStatus;
  eligibleSince: string;
  currentPeriodEnd: string | null;
  isTest: boolean;
  grantReason: string | null;
};

export function parsePawPassEntitlement(value: unknown): PawPassEntitlement | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { is_active?: unknown; status?: unknown; current_period_end?: unknown };
  const allowed: PawPassStatus[] = ["active", "cancel_at_period_end", "past_due", "expired", "refunded"];
  if (typeof row.is_active !== "boolean" || typeof row.status !== "string" || !allowed.includes(row.status as PawPassStatus)) return null;
  if (row.current_period_end !== null && typeof row.current_period_end !== "string") return null;
  return { active: row.is_active, status: row.status as PawPassStatus, currentPeriodEnd: row.current_period_end };
}

export function isPrimeEntitlement(entitlement: PawPassEntitlement | null): boolean {
  if (!entitlement) return false;
  if (!entitlement.active) return false;
  if (entitlement.status !== "active" && entitlement.status !== "cancel_at_period_end") return false;
  if (!entitlement.currentPeriodEnd) return false;
  return new Date(entitlement.currentPeriodEnd).getTime() > Date.now();
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

export async function loadMyMembershipStatus(client: SupabaseClient<Database>): Promise<{ status: MembershipStatus | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("get_my_membership_status");
    if (error) return { status: null, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return { status: null, error: null };
    const r = row as Record<string, unknown>;
    const sources: MembershipSource[] = ["paid", "founding_reward", "owner_granted", "owner_test"];
    const statuses: PawPassStatus[] = ["active", "cancel_at_period_end", "past_due", "expired", "refunded"];
    if (typeof r.source !== "string" || !sources.includes(r.source as MembershipSource)) return { status: null, error: "Invalid membership source." };
    if (typeof r.status !== "string" || !statuses.includes(r.status as PawPassStatus)) return { status: null, error: "Invalid membership status." };
    if (typeof r.eligible_since !== "string") return { status: null, error: "Invalid membership dates." };
    if (r.plan_interval !== null && r.plan_interval !== "monthly" && r.plan_interval !== "yearly") return { status: null, error: "Invalid plan interval." };
    if (r.current_period_end !== null && typeof r.current_period_end !== "string") return { status: null, error: "Invalid membership dates." };
    return {
      status: {
        source: r.source as MembershipSource,
        planInterval: (r.plan_interval as PlanInterval) ?? null,
        status: r.status as PawPassStatus,
        eligibleSince: r.eligible_since,
        currentPeriodEnd: (r.current_period_end as string | null) ?? null,
        isTest: r.is_test === true,
        grantReason: typeof r.grant_reason === "string" ? r.grant_reason : null,
      },
      error: null,
    };
  } catch {
    return { status: null, error: "Could not load membership status." };
  }
}

export async function claimFoundingPrime(client: SupabaseClient<Database>): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await client.rpc("claim_founding_prime");
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Could not claim founding reward." };
  }
}

export async function loadFoundingStatus(client: SupabaseClient<Database>): Promise<{ claimed: boolean; claimedAt: string | null; expiresAt: string | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("get_my_founding_status");
    if (error) return { claimed: false, claimedAt: null, expiresAt: null, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") return { claimed: false, claimedAt: null, expiresAt: null, error: null };
    const r = row as Record<string, unknown>;
    return {
      claimed: r.claimed === true,
      claimedAt: typeof r.claimed_at === "string" ? r.claimed_at : null,
      expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      error: null,
    };
  } catch {
    return { claimed: false, claimedAt: null, expiresAt: null, error: "Could not load founding status." };
  }
}

export async function loadFoundingRemaining(client: SupabaseClient<Database>): Promise<{ remaining: number | null; error: string | null }> {
  try {
    const { data, error } = await client.rpc("get_founding_rewards_remaining");
    if (error) return { remaining: null, error: error.message };
    return { remaining: typeof data === "number" ? data : null, error: null };
  } catch {
    return { remaining: null, error: "Could not load founding reward availability." };
  }
}
