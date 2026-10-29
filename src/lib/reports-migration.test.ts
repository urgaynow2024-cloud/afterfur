import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(process.cwd(), "supabase/migrations/0024_user_reports.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("migration 0024_user_reports.sql — static review", () => {
  it("creates the reports table with required columns", () => {
    for (const column of [
      "id uuid primary key default gen_random_uuid()",
      "reporter_id uuid not null references public.profiles(id) on delete cascade",
      "target_type text not null check",
      "target_id uuid not null",
      "reason text not null check",
      "description text",
      "status text not null default 'pending' check",
      "reviewed_by uuid references public.profiles(id)",
      "reviewed_at timestamptz",
      "created_at timestamptz not null default now()",
    ]) {
      expect(migration).toContain(column);
    }
  });

  it("constrains target_type to post, reply, user", () => {
    expect(migration).toContain("target_type in ('post', 'reply', 'user')");
  });

  it("constrains reason to the nine supported values", () => {
    for (const reason of [
      "harassment",
      "hate_speech",
      "threats_violence",
      "sexual_content",
      "illegal_exploitation",
      "spam_scam_impersonation",
      "copyright",
      "privacy_doxxing",
      "other",
    ]) {
      expect(migration).toContain(reason);
    }
  });

  it("enforces one report per reporter per target per reason", () => {
    expect(migration).toContain(
      "unique (reporter_id, target_type, target_id, reason)",
    );
  });

  it("creates indexes for reporter, target, and status lookups", () => {
    expect(migration).toContain("reports_reporter_idx");
    expect(migration).toContain("reports_target_idx");
    expect(migration).toContain("reports_status_idx");
  });

  it("enables row level security", () => {
    expect(migration).toContain("alter table public.reports enable row level security");
  });

  it("restricts inserts to the authenticated reporter's own rows", () => {
    expect(migration).toContain("for insert");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("with check (auth.uid() = reporter_id)");
  });

  it("restricts reads to the reporter's own rows or staff app_metadata claim", () => {
    expect(migration).toContain("for select");
    expect(migration).toContain("using (auth.uid() = reporter_id)");
    expect(migration).toContain(
      "coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'",
    );
  });

  it("restricts updates to staff app_metadata claim only", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain(
      "coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'",
    );
  });

  it("does not trust client-supplied reporter identity", () => {
    // reporter_id is derived from auth.uid() inside the function, never a parameter
    const funcBody = migration.slice(
      migration.indexOf("create or replace function public.submit_report"),
    );
    expect(funcBody).not.toContain("p_reporter_id");
    expect(funcBody).toContain("v_actor_id uuid := auth.uid();");
    expect(funcBody).toContain("values (v_actor_id, p_target_type,");
  });

  it("revokes public/anon access and grants select to authenticated only", () => {
    expect(migration).toContain(
      "revoke all on public.reports from public, anon, authenticated;",
    );
    expect(migration).toContain("grant select on public.reports to authenticated;");
  });

  it("defines submit_report as SECURITY DEFINER with safe search_path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
  });

  it("revokes execute from public/anon and grants to authenticated", () => {
    expect(migration).toContain(
      "revoke all on function public.submit_report(text, uuid, text, text) from public, anon;",
    );
    expect(migration).toContain(
      "grant execute on function public.submit_report(text, uuid, text, text) to authenticated;",
    );
  });

  it("validates authentication inside submit_report", () => {
    const funcBody = migration.slice(
      migration.indexOf("create or replace function public.submit_report"),
    );
    expect(funcBody).toContain("if v_actor_id is null then");
    expect(funcBody).toContain("raise exception 'Authentication required.");
  });

  it("validates target existence for each target type", () => {
    const funcBody = migration.slice(
      migration.indexOf("create or replace function public.submit_report"),
    );
    expect(funcBody).toContain("perform 1 from public.posts where id = p_target_id;");
    expect(funcBody).toContain("perform 1 from public.replies where id = p_target_id;");
    expect(funcBody).toContain("perform 1 from public.profiles where id = p_target_id;");
  });

  it("rejects invalid reasons and oversized descriptions", () => {
    const funcBody = migration.slice(
      migration.indexOf("create or replace function public.submit_report"),
    );
    expect(funcBody).toContain("raise exception 'Invalid report reason.'");
    expect(funcBody).toContain("char_length(p_description) > 1000");
    expect(funcBody).toContain("Explanation is too long (maximum 1000 characters).");
  });

  it("handles duplicate submissions predictably via ON CONFLICT DO NOTHING", () => {
    const funcBody = migration.slice(
      migration.indexOf("create or replace function public.submit_report"),
    );
    expect(funcBody).toContain("on conflict (reporter_id, target_type, target_id, reason) do nothing");
    expect(funcBody).toContain("if not found then");
    expect(funcBody).toContain("raise exception 'You have already submitted a report for this.'");
  });

  it("returns the new report id as uuid", () => {
    expect(migration).toContain("returns uuid");
    expect(migration).toContain("return v_report_id;");
  });

  it("does not contain destructive table or data operations", () => {
    for (const destructive of [
      "drop table",
      "delete from",
      "truncate",
      "alter table public.reports drop",
    ]) {
      expect(migration.toLowerCase()).not.toContain(destructive);
    }
  });
});
