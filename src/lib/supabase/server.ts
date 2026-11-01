/**
 * Server-only Supabase client.
 *
 * This module is intentionally NOT imported by any client component. It uses the
 * SUPABASE_SERVICE_ROLE_KEY, which must never be bundled into browser code.
 *
 * Route handlers and server actions import this client to perform privileged
 * operations (signed-URL generation for private storage, reading rows that the
 * anon client would be restricted from seeing). All identity and authorization
 * decisions are made explicitly in the caller using verified session data.
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

let instance: SupabaseClient<Database> | null = null;

export function createServerClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!instance) {
    instance = createClient<Database>(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return instance;
}