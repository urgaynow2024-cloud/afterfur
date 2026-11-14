import { createClient } from "@/lib/supabase/client";

/**
 * Build request headers with the active account's Supabase access token.
 * Used by client-side moderation views to call server routes that verify the
 * bearer JWT server-side. Never includes secrets.
 */
export async function getAuthHeaders(json = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  try {
    const supabase = createClient();
    if (!supabase) return headers;
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Ignore: request will be rejected as unauthenticated by the API.
  }
  return headers;
}