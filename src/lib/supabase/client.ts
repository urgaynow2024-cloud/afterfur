import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let instance: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient(): any {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!instance) instance = createSupabaseClient(url, key);
  return instance;
}
