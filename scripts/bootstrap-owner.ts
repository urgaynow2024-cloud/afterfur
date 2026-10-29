// One-time server-side administrative bootstrap script for AfterFur staff badges.
//
// Grants `afterfur_staff_admin: true` in Supabase Auth `app_metadata` for a
// verified owner account, enabling access to /staff/badges.
//
// Security:
//   - Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local only.
//   - The service-role key never leaves this process and is never printed.
//   - No HTTP route is created; nothing is exposed to the browser.
//   - Ordinary users cannot self-escalate: the service-role key is required.
//   - Safe to rerun: reports already-admin without changing metadata.
//
// Usage (Windows PowerShell):
//   1. Confirm .env.local contains SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
//   2. Run:  npx tsx scripts/bootstrap-owner.ts "<owner-user-uuid>"
//      Or interactively (no argument):  npx tsx scripts/bootstrap-owner.ts
//   3. Type YES to confirm before any metadata is written.
//   4. Verify: sign in as the owner, open /settings, confirm "Manage staff badges"
//      appears, then open /staff/badges and grant/revoke a staff badge.
//
// Do not run this script during implementation. Run it only after you have
// supplied and confirmed the intended owner Supabase Auth user UUID.

import * as fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as readline from "node:readline";

const ENV_FILE = ".env.local";

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

type AdminUserResponse = { data: { user: { app_metadata: Record<string, unknown> | null; id: string; email: string | null } | null }; error: { message: string } | null } | { data: { user: null }; error: { message: string } };

type SupabaseWithAdmin = SupabaseClient & {
  auth: {
    admin: {
      getUserById: (uid: string) => Promise<AdminUserResponse>;
      updateUserById: (uid: string, attrs: { app_metadata: Record<string, unknown> }) => Promise<AdminUserResponse>;
    };
  };
};

export function loadEnv(path: string): Env {
  let text: string;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch {
    throw new Error(`Could not read ${path}. Create it with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
  }
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
  const missing = ["SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variables in ${path}: ${missing.join(", ")}`);
  }
  // SUPABASE_URL takes precedence; NEXT_PUBLIC_SUPABASE_URL is an accepted fallback.
  if (!env.SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL) {
    env.SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (!env.SUPABASE_URL) {
    throw new Error(`Missing required environment variable in ${path}: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)`);
  }
  return env as Env;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function maskKey(key: string): string {
  if (!key) return "<unset>";
  if (key.length <= 8) return "***";
  return key.slice(0, 4) + "…" + key.slice(-4);
}

function prompt(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(message, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const argOwnerId = process.argv.slice(2)[0];

  let env: Env;
  try {
    env = loadEnv(ENV_FILE);
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  console.log("AfterFur owner bootstrap");
  console.log(`Supabase URL: ${env.SUPABASE_URL}`);
  console.log(`Service-role key: ${maskKey(env.SUPABASE_SERVICE_ROLE_KEY)}`);
  console.log("");

  let ownerId: string | null = null;
  if (argOwnerId) {
    if (!isUuid(argOwnerId)) {
      console.error(`ERROR: "${argOwnerId}" is not a valid UUID.`);
      process.exit(1);
    }
    ownerId = argOwnerId;
  } else {
    const input = await prompt("Enter the owner Supabase Auth user UUID: ");
    if (!isUuid(input)) {
      console.error(`ERROR: "${input}" is not a valid UUID.`);
      process.exit(1);
    }
    ownerId = input;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseWithAdmin;

  // 1. Verify the Auth user exists.
  const { data: getData, error: getError } = await supabase.auth.admin.getUserById(ownerId!);
  if (getError || !getData?.user) {
    console.error(`ERROR: Could not retrieve Auth user ${ownerId}: ${getError?.message ?? "not found"}`);
    process.exit(1);
  }
  const user = getData.user;
  console.log(`Auth user found: ${user.id} (${user.email ?? "no email"})`);
  console.log(`Current app_metadata: ${JSON.stringify(user.app_metadata ?? {})}`);

  const alreadyAdmin = user.app_metadata?.afterfur_staff_admin === true;
  if (alreadyAdmin) {
    console.log("This account is already a staff administrator. No changes made.");
    process.exit(0);
  }

  // 2. Preserve existing app_metadata; only add/overwrite the staff flag.
  const existingAppMetadata: Record<string, unknown> = user.app_metadata ?? {};
  const nextAppMetadata = { ...existingAppMetadata, afterfur_staff_admin: true };

  // 3. Explicit confirmation before changing privileges.
  console.log("");
  console.log("About to set app_metadata.afterfur_staff_admin = true on:");
  console.log(`  user_id: ${user.id}`);
  console.log(`  email:   ${user.email ?? "no email"}`);
  console.log("Preserved metadata keys:", Object.keys(existingAppMetadata));
  console.log("");
  const confirm = await prompt('Type "YES" to confirm: ');
  if (confirm !== "YES") {
    console.log("Aborted. No privileges were changed.");
    process.exit(0);
  }

  // 4. Write app_metadata via the service-role Admin API.
  const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
    ownerId!,
    { app_metadata: nextAppMetadata },
  );
  if (updateError || !updateData?.user) {
    console.error(`ERROR: Failed to update app_metadata: ${updateError?.message ?? "unknown error"}`);
    process.exit(1);
  }

  const updated = updateData.user.app_metadata?.afterfur_staff_admin === true;
  if (!updated) {
    console.error("ERROR: Update returned success but afterfur_staff_admin is not set. Aborted.");
    process.exit(1);
  }

  console.log("");
  console.log("Bootstrap complete.");
  console.log(`  user_id:   ${updateData.user.id}`);
  console.log(`  email:     ${updateData.user.email ?? "no email"}`);
  console.log(`  staff_admin: true`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Sign in as this account in the browser.");
  console.log("  2. Open /settings and confirm the 'Manage staff badges' link appears.");
  console.log("  3. Open /staff/badges and grant/revoke a staff badge to confirm access.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
