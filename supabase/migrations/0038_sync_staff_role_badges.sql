-- Sync staff badges with moderator roles.
--
-- Adds `public.sync_staff_role_badge()`, a server-side RPC used by the staff
-- management API (`/api/moderation/staff`) to automatically grant or revoke
-- staff badges when a user is appointed, promoted, demoted or removed from
-- the staff team.
--
-- SECURITY: executable ONLY by the Supabase service_role. The staff management
-- API (which holds the service-role key) enforces administrator permissions
-- via requireModeratorRole("administrator") before calling this RPC and passes
-- the verified administrator's user id as p_actor_id. Ordinary authenticated
-- users cannot invoke this RPC directly. auth.uid()/auth.jwt() are NOT used
-- inside this function, because service_role execution has no end-user JWT
-- context; authorization is established by the API route, not by the RPC.
--
-- Grant is idempotent (no-op if the badge is already active). Revoke removes
-- the active assignment but preserves history in staff_badge_audit.
-- Unrelated badges are never touched. No accounts are deleted.
--
-- Additive migration: does not alter existing tables, functions or badges.

create or replace function public.sync_staff_role_badge(
  p_actor_id uuid,
  p_target_id uuid,
  p_badge_id text,
  p_action text
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_manual_staff_badges text[] := array[
    'staff_founder','staff_moderator','staff_developer','staff_tester'
  ];
begin
  -- Input validation: reject NULL and invalid inputs explicitly.
  if p_actor_id is null then
    raise exception 'Actor is required' using errcode = '22023';
  end if;

  if p_target_id is null then
    raise exception 'Target is required' using errcode = '22023';
  end if;

  if p_badge_id is null or not (p_badge_id = any(v_manual_staff_badges)) then
    raise exception 'Unknown staff badge' using errcode = '22023';
  end if;

  if p_action is null or p_action not in ('grant', 'revoke') then
    raise exception 'Action must be grant or revoke' using errcode = '22023';
  end if;

  if not exists(select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;

  if p_action = 'grant' then
    -- Idempotent: if the badge is already active, return false (no-op)
    -- without creating audit or notification noise.
    if exists (
      select 1 from public.staff_badge_assignments
      where user_id = p_target_id and badge_id = p_badge_id
    ) then
      return false;
    end if;

    insert into public.staff_badge_assignments(user_id, badge_id, assigned_by)
      values (p_target_id, p_badge_id, p_actor_id);
  else
    -- Revoke removes the active assignment but preserves history in
    -- staff_badge_audit. Re-grant is possible afterwards.
    delete from public.staff_badge_assignments
    where user_id = p_target_id and badge_id = p_badge_id;

    if not found then
      return false;
    end if;
  end if;

  insert into public.staff_badge_audit(actor_id, target_id, badge_id, action)
    values (p_actor_id, p_target_id, p_badge_id, p_action);

  return true;
end;
$function$;

revoke all on function public.sync_staff_role_badge(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sync_staff_role_badge(uuid, uuid, text, text) to service_role;

comment on function public.sync_staff_role_badge(uuid,uuid,text,text) is
  'Syncs a staff badge with a moderator role change. Executable only by service_role; the staff management API enforces administrator authorization and passes the verified administrator id as p_actor_id. Grant is no-op for duplicates; revoke removes the assignment and preserves audit history. Unrelated badges are never touched.';
