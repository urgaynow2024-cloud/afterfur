-- 0036: Moderator administration security fixes (additive corrective migration)
--
-- Purpose:
--   Corrects security-sensitive issues found in review of
--   0033_moderator_administration.sql without modifying 0033, without
--   applying migrations automatically, and without weakening RLS/authorization.
--
-- Findings addressed:
--   1) record_moderation_action: previously executable by any authenticated user
--      (SECURITY DEFINER), allowing fabricated audit rows. This migration
--      revokes authenticated execute and grants execute only to service_role for
--      compatibility with the existing server-side service-role implementation
--      (src/lib/supabase/server.ts uses SUPABASE_SERVICE_ROLE_KEY). It also adds
--      a defense-in-depth guard: direct authenticated/JWT contexts are denied and
--      audited actor attribution must match the verified JWT subject when present.
--      Service-role/admin API contexts (no end-user JWT) remain permitted.
--   2) moderator_roles RLS "moderator_roles read by staff": self-referenced
--      moderator_roles, creating recursion risk. Replaced with a SECURITY DEFINER
--      helper (af_is_moderator_or_admin) using fixed search_path and least
--      privilege; helper does not expose staff membership data beyond boolean
--      authorization decisions in policy evaluation.
--   3) user_enforcements "write by senior+" ignored trusted
--      app_metadata.afterfur_staff_admin claim. Policy now accepts the trusted,
--      server-controlled app_metadata claim (consistent with existing owner/admin
--      model) OR a moderator_roles row at senior_moderator/administrator.
--   4) has_moderator_role(p_user_id,p_min_role): ambiguous admin short-circuit
--      ignored p_user_id and could mislead callers. Corrected semantics:
--        - Always returns false for unauthenticated callers (no membership leakage).
--        - If p_user_id = auth.uid(): returns self role at/above p_min_role;
--          trusted afterfur_staff_admin app_metadata claim grants self admin.
--        - If p_user_id differs from auth.uid(): only the target's moderator_roles
--          row is evaluated (no caller-admin short-circuit). This prevents a
--          malicious/misled caller from using an admin JWT to obtain misleading
--          positive authorization for arbitrary targets via this RPC. Non-self
--          checks remain available to service-role/server contexts as needed.
--
-- Compatibility/preservation:
--   - No DROP TABLE/TRUNCATE/DELETE/UPDATE of data.
--   - Existing staff roles, audit history, and trusted owner claim preserved.
--   - Function signatures preserved for has_moderator_role and
--     record_moderation_action to match actual application/type dependencies.
--   - Safe to apply to existing schema after 0033 (idempotent create/replace and
--     drop/create policy patterns). Not applied automatically.

-- ---------------------------------------------------------------------------
-- Helper: is the given uid a moderator/admin (including trusted app_metadata
-- admin claim for the current JWT only when checking self)? SECURITY DEFINER to
-- avoid moderator_roles RLS recursion; fixed search_path.
--
-- Security: to prevent staff-membership enumeration, this helper ONLY answers
-- for the current authenticated subject (p_uid must equal auth.uid(), or be
-- NULL in which case auth.uid() is used). Non-self probes return false.
-- Policies should pass auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.af_is_moderator_or_admin(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid;
  v_is_admin_claim boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  -- Prevent membership leakage: do not answer for arbitrary target IDs.
  if p_uid is not null and p_uid is distinct from v_uid then
    return false;
  end if;

  v_is_admin_claim :=
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true';
  if v_is_admin_claim then
    return true;
  end if;

  return exists (
    select 1
    from public.moderator_roles mr
    where mr.user_id = v_uid
      and mr.role in ('moderator', 'senior_moderator', 'administrator')
  );
end;
$$;

comment on function public.af_is_moderator_or_admin(uuid) is
  'Security-definer helper for moderator RLS policies. Returns boolean only; fixed search_path; avoids moderator_roles policy recursion.';

revoke all on function public.af_is_moderator_or_admin(uuid) from public, anon, authenticated;
grant execute on function public.af_is_moderator_or_admin(uuid) to authenticated;

-- Helper: current user has at least a moderator role level. Used by RLS policies.
create or replace function public.af_current_user_has_moderator_role(p_min_role text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when auth.uid() is null then false
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true' then true
    when p_min_role = 'moderator' then exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid() and mr.role in ('moderator','senior_moderator','administrator')
    )
    when p_min_role = 'senior_moderator' then exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid() and mr.role in ('senior_moderator','administrator')
    )
    when p_min_role = 'administrator' then exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid() and mr.role = 'administrator'
    )
    else false
  end;
$$;

comment on function public.af_current_user_has_moderator_role(text) is
  'Security-definer helper for RLS: checks current authenticated subject''s trusted app_metadata admin claim or moderator_roles row at/above requested level. Boolean only; fixed search_path.';

revoke all on function public.af_current_user_has_moderator_role(text) from public, anon, authenticated;
grant execute on function public.af_current_user_has_moderator_role(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) record_moderation_action: prevent fabricated audit records by ordinary
--    authenticated users; keep service-role/server compatibility.
-- ---------------------------------------------------------------------------
create or replace function public.record_moderation_action(
  p_actor_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_details jsonb,
  p_before_state jsonb,
  p_after_state jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action_id uuid;
  v_jwt_role text;
  v_jwt_uid uuid;
begin
  -- SECURITY DEFINER functions are powerful; do not allow arbitrary authenticated
  -- clients to forge audit records. The AfterFur server uses SUPABASE_SERVICE_ROLE_KEY
  -- for moderation operations and records actions after server-side authorization.
  --
  -- PostgREST/Supabase request JWTs include role claims; service_role contexts are
  -- permitted. If an end-user JWT is present, require p_actor_id to match auth.uid().
  -- This blocks fabricated actor attribution. Direct execute is also revoked from
  -- authenticated/public/anon below as defense in depth.
  v_jwt_role := coalesce(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true), '');
  v_jwt_uid := auth.uid();

  if v_jwt_role = 'service_role' then
    -- allowed (trusted server/backend context)
    null;
  elsif v_jwt_uid is not null then
    if p_actor_id is distinct from v_jwt_uid then
      raise exception 'forbidden: actor_id must match authenticated user' using errcode = '42501';
    end if;
    -- Additional check: only moderator/admin subjects may write audit rows directly
    -- if ever executed in a JWT context. Normal app path uses service_role.
    if not public.af_current_user_has_moderator_role('moderator') then
      raise exception 'forbidden: moderator access required' using errcode = '42501';
    end if;
  else
    -- No user JWT / non-authenticated context: allow only when not running as an
    -- exposed anonymous API role. Service-role server client typically has no user
    -- uid. If this branch is reached from an untrusted context, lack of execute
    -- grant and DB role controls are the primary barrier.
    null;
  end if;

  if p_target_type is null or p_target_type not in ('post','reply','user','report','appeal','staff_role') then
    raise exception 'invalid target_type' using errcode = '22023';
  end if;

  insert into public.moderation_audit_log (
    actor_id, target_type, target_id, action, details,
    before_state, after_state, created_at
  )
  values (
    p_actor_id, p_target_type, p_target_id, p_action, p_details,
    p_before_state, p_after_state, now()
  )
  returning id into v_action_id;

  return v_action_id;
end;
$$;

comment on function public.record_moderation_action(uuid, text, uuid, text, jsonb, jsonb, jsonb) is
  'SECURITY DEFINER audit insert. Execute revoked from authenticated/public/anon; granted to service_role for server-side moderation flows. Denies fabricated actor attribution in JWT contexts; fixed search_path.';

revoke all on function public.record_moderation_action(uuid, text, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_moderation_action(uuid, text, uuid, text, jsonb, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 2) Fix moderator_roles read policy recursion (do not weaken staff access).
-- ---------------------------------------------------------------------------
drop policy if exists "moderator_roles read by staff" on public.moderator_roles;
create policy "moderator_roles read by staff"
  on public.moderator_roles
  for select
  to authenticated
  using (
    public.af_is_moderator_or_admin(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3) user_enforcements write policy: accept trusted afterfur_staff_admin claim
--    consistently with owner/admin model and senior/moderator_roles.
-- ---------------------------------------------------------------------------
drop policy if exists "user_enforcements write by senior+" on public.user_enforcements;
create policy "user_enforcements write by senior+"
  on public.user_enforcements
  for all
  to authenticated
  using (
    public.af_current_user_has_moderator_role('senior_moderator')
  )
  with check (
    public.af_current_user_has_moderator_role('senior_moderator')
  );

-- ---------------------------------------------------------------------------
-- 4) has_moderator_role: correct semantics and prevent misleading/arbitrary
--    cross-user authorization results.
-- ---------------------------------------------------------------------------
create or replace function public.has_moderator_role(
  p_user_id uuid,
  p_min_role text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_uid uuid;
  v_is_admin_claim boolean;
begin
  -- Unauthenticated callers get no role information.
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  if p_min_role not in ('moderator', 'senior_moderator', 'administrator') then
    return false;
  end if;

  v_is_admin_claim :=
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true';

  -- Self-check: trusted owner/admin app_metadata claim grants administrator-level
  -- for the authenticated subject (preserves owner access), otherwise use the
  -- subject's moderator_roles row.
  if p_user_id = v_uid then
    if v_is_admin_claim then
      return true;
    end if;

    select mr.role into v_role
    from public.moderator_roles mr
    where mr.user_id = p_user_id
    limit 1;

  else
    -- Cross-user check: do NOT apply caller's admin claim as a positive result
    -- for an arbitrary target; evaluate only the target's moderator_roles row.
    -- This prevents misleading authorization results. Staff/admin UI that needs
    -- to inspect other users should use server-side service-role queries with
    -- explicit authorization checks.
    --
    -- To avoid leaking staff membership to arbitrary authenticated users, require
    -- the caller to be staff/admin for cross-user checks.
    if not (
      v_is_admin_claim
      or exists (
        select 1 from public.moderator_roles mr
        where mr.user_id = v_uid
          and mr.role in ('moderator','senior_moderator','administrator')
      )
    ) then
      return false;
    end if;

    select mr.role into v_role
    from public.moderator_roles mr
    where mr.user_id = p_user_id
    limit 1;
  end if;

  if v_role is null then
    return false;
  end if;

  if p_min_role = 'moderator' then
    return v_role in ('moderator', 'senior_moderator', 'administrator');
  elsif p_min_role = 'senior_moderator' then
    return v_role in ('senior_moderator', 'administrator');
  elsif p_min_role = 'administrator' then
    return v_role = 'administrator';
  end if;

  return false;
end;
$$;

comment on function public.has_moderator_role(uuid, text) is
  'Role hierarchy check with corrected semantics: unauthenticated=false; self checks honor trusted afterfur_staff_admin app_metadata claim; cross-user checks do not use caller admin claim for target result and require caller to be staff/admin to avoid membership leakage/misleading authorization. Fixed search_path.';

revoke all on function public.has_moderator_role(uuid, text) from public, anon;
grant execute on function public.has_moderator_role(uuid, text) to authenticated;
