"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getActiveClient, getLegacyClient } from "@/lib/accountSessions";

export function createClient(): SupabaseClient<Database> | null {
  return getActiveClient() ?? getLegacyClient();
}
