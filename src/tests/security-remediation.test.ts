import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function readMigration(name: string) {
  return fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", name), "utf8");
}

describe("Security remediation migration: rate_limits privilege hardening (0046)", () => {
  const sql = readMigration("0046_harden_rate_limits_privileges.sql");

  it("revokes direct table privileges from public, anon, authenticated", () => {
    expect(sql).toMatch(/revoke all privileges on table public\.rate_limits from public/i);
    expect(sql).toMatch(/revoke all privileges on table public\.rate_limits from anon/i);
    expect(sql).toMatch(/revoke all privileges on table public\.rate_limits from authenticated/i);
  });

  it("preserves explicit service_role table access", () => {
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.rate_limits to service_role/i);
  });

  it("documents application RPC-only access pattern and verification SQL", () => {
    expect(sql).toMatch(/check_rate_limit RPC/i);
    expect(sql).toMatch(/information_schema\.role_table_grants/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });
});

describe("Security remediation: storage/signed URL authorization routes", () => {
  it("media signed URL route requires verified user and checks ownership/privacy/follow/block/classification", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/media/signed-url/route.ts"), "utf8");
    expect(route).toMatch(/getVerifiedUser/);
    expect(route).toMatch(/is_user_enforced/);
    expect(route).toMatch(/from\("media"\)/);
    expect(route).toMatch(/bucket !== media\.bucket_id/);
    expect(route).toMatch(/follows/);
    expect(route).toMatch(/blocks/);
    expect(route).toMatch(/classification/);
    expect(route).toMatch(/createSignedUrl/);
    expect(route).not.toMatch(/error\.message/);
  });

  it("message attachment signed URL route enforces membership before minting URL", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/messages/attachments/signed-url/route.ts"), "utf8");
    expect(route).toMatch(/getVerifiedUser/);
    expect(route).toMatch(/message_attachments/);
    expect(route).toMatch(/conversation_participants/);
    expect(route).toMatch(/createSignedUrl/);
  });

  it("attachment registration route validates membership/message and avoids raw DB error leakage", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/messages/attachments/route.ts"), "utf8");
    expect(route).toMatch(/conversation_participants/);
    expect(route).toMatch(/messages/);
    expect(route).toMatch(/eq\("sender_id", userId\)|conversation_id/);
    expect(route).not.toMatch(/membershipError\.message|messageError\.message/);
  });
});

describe("Security remediation: security-definer function hardening (static review)", () => {
  it("check_rate_limit is definer with restricted search_path and limited EXECUTE grants", () => {
    const sql = readMigration("0045_enforcement_and_rate_limiting.sql");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public/i);
    expect(sql).toMatch(/revoke all on function public\.check_rate_limit\(text, text, integer, integer\) from public, anon/i);
    expect(sql).toMatch(/grant execute on function public\.check_rate_limit\(text, text, integer, integer\) to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.check_rate_limit\(text, text, integer, integer\) to service_role/i);
  });

  it("is_user_enforced is definer, restricted search_path, non-public execute", () => {
    const sql = readMigration("0044_posts_rls_hardening.sql");
    expect(sql).toMatch(/create or replace function public\.is_user_enforced/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public/i);
    expect(sql).toMatch(/revoke all on function public\.is_user_enforced\(uuid\) from public, anon/i);
  });

  it("sync_staff_role_badge is service_role-only execute with definer/search_path", () => {
    const sql = readMigration("0038_sync_staff_role_badges.sql");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public/i);
    expect(sql).toMatch(/revoke all on function public\.sync_staff_role_badge\(uuid, uuid, text, text\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.sync_staff_role_badge\(uuid, uuid, text, text\) to service_role/i);
  });
});
