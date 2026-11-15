"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getActiveClient, getLegacyClient } from "@/lib/accountSessions";
import { authDiag } from "@/lib/authDiag";

export function createClient(): SupabaseClient<Database> | null {
  const active = getActiveClient();
  const legacy = getLegacyClient();
  const result = active ?? legacy;
  authDiag("createClient", "createClient_call", {
    usedActive: Boolean(active),
    activeStorageKey: (active as any)?.storageKey ?? null,
    usedLegacy: Boolean(legacy) && !active,
    legacyStorageKey: (legacy as any)?.storageKey ?? null,
    resultStorageKey: (result as any)?.storageKey ?? null,
  });
  return result;
}
