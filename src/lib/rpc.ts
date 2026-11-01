import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type RpcError = { message: string } | null;

export async function callRpc<T = unknown>(
  supabase: SupabaseClient<Database>,
  name: string,
  params: unknown,
): Promise<{ data: T | null; error: RpcError }> {
  const rpc = supabase as unknown as {
    rpc: (fn: string, p?: unknown) => Promise<{ data: T | null; error: RpcError }>;
  };
  return rpc.rpc(name, params);
}
