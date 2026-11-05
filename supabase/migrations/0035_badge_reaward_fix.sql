-- Stage 33/35: Badge re-award fix and canonical manual badge management.
-- Fixes re-award-after-removal reliability by (1) making manage_staff_badge
-- idempotent and explicit about grant/revoke outcomes, (2) supporting the full
-- MANUAL_BADGE_IDS set used by /staff/badges, and (3) ensuring re-awarded
-- manual badges can generate a notification (staff_badge_assignments rows are
-- deleted on revoke, so a re-grant is a new award event).
--
-- Does NOT weaken permissions: still requires require_afterfur_staff_admin().
-- Does NOT delete historical audit records (staff_badge_audit remains append-only).
-- Does NOT change existing badge display semantics beyond allowing valid re-awards.
-- Not applied to production automatically.

-- Canonical manual badge RPC. Later migrations must not silently revert this.
create or replace function public.manage_staff_badge(
  p_target_id uuid,
  p_badge_id text,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_manual_badges text[] := array[
    'staff_founder','staff_moderator','staff_developer','staff_tester',
    'access_age_verified','access_approved',
    'creator_featured','achievement_event_winner','community_helper',
    'web_designer','ad_creator'
  ];
begin
  perform public.require_afterfur_staff_admin();

  -- Verified platform owners (admin claim) may self-assign. The guard remains
  -- explicit for future callers, though require_afterfur_staff_admin enforces
  -- the claim today.
  if v_actor_id = p_target_id and coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff badges cannot be assigned to yourself' using errcode = '42501';
  end if;

  if p_badge_id is null or not (p_badge_id = any(v_manual_badges)) then
    raise exception 'Unknown manual badge' using errcode = '22023';
  end if;

  if p_badge_id = 'web_designer' and not exists (
    select 1 from public.staff_badge_assignments
    where user_id = v_actor_id and badge_id = 'staff_founder'
  ) then
    raise exception 'Founder access required' using errcode = '42501';
  end if;

  if p_action not in ('grant', 'revoke') then
    raise exception 'Action must be grant or revoke' using errcode = '22023';
  end if;

  if not exists(select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;

  if p_action = 'grant' then
    -- Prevent duplicate active assignments. If an active row exists, return
    -- false (no-op) without creating audit/history noise.
    if exists (
      select 1 from public.staff_badge_assignments
      where user_id = p_target_id and badge_id = p_badge_id
    ) then
      return false;
    end if;

    insert into public.staff_badge_assignments(user_id, badge_id, assigned_by)
      values (p_target_id, p_badge_id, v_actor_id);

  else
    -- Revoke removes the active assignment but preserves history in
    -- staff_badge_audit. Re-award is possible because the active row is gone.
    delete from public.staff_badge_assignments
    where user_id = p_target_id and badge_id = p_badge_id;

    if not found then
      return false;
    end if;
  end if;

  insert into public.staff_badge_audit(actor_id, target_id, badge_id, action)
    values (v_actor_id, p_target_id, p_badge_id, p_action);

  return true;
end;
$function$;

revoke all on function public.manage_staff_badge(uuid, text, text) from public, anon;
grant execute on function public.manage_staff_badge(uuid, text, text) to authenticated;

comment on function public.manage_staff_badge(uuid,text,text) is
  'Admin-only manual badge grant/revoke. Grant is no-op for duplicate active assignments; revoke removes active assignment and preserves audit history; re-grant is allowed after revoke.';

-- Ensure the badge assignment check constraint matches the manual badge set.
alter table public.staff_badge_assignments
  drop constraint if exists staff_badge_assignments_badge_id_check;
alter table public.staff_badge_assignments
  add constraint staff_badge_assignments_badge_id_check
  check (badge_id in (
    'staff_founder','staff_moderator','staff_developer','staff_tester',
    'access_age_verified','access_approved',
    'creator_featured','achievement_event_winner','community_helper',
    'web_designer','ad_creator'
  ));

-- Badge award notification trigger: preserve dedupe for automatic system awards
-- in user_badge_awards, but allow a fresh notification when a manual staff badge
-- is re-awarded (a new insert after revoke/delete is a new event).
create or replace function public.notify_badge_award()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_badge_name text;
  v_icon text;
  v_message text;
  v_is_reaward boolean := false;
begin
  select display_name, coalesce((select mark from public.badge_registry where id = new.badge_id), '') into v_badge_name, v_icon
    from public.badge_registry where id = new.badge_id;
  if v_badge_name is null then v_badge_name := new.badge_id; end if;

  if tg_table_name = 'staff_badge_assignments' then
    select exists (
      select 1 from public.staff_badge_audit a
      where a.target_id = new.user_id and a.badge_id = new.badge_id and a.action = 'grant'
    ) into v_is_reaward;
  end if;

  v_message := case new.badge_id
    when 'ad_creator' then 'Congratulations! You''ve earned the AD Creator badge for reaching 500 followers!'
    else case when v_is_reaward then 'You''ve received the ' || v_badge_name || ' badge again.' else 'You''ve received a new badge: ' || v_badge_name || '!' end
  end;

  -- Dedupe only for non-reaward/system-style cases. Re-awarded manual badges
  -- represent a new moderator action and should notify again.
  if v_is_reaward or not exists (
    select 1 from public.notifications
    where user_id = new.user_id and type = 'badge'
      and payload @> jsonb_build_object('badge_id', new.badge_id)
  ) then
    insert into public.notifications (user_id, type, payload, read)
    values (new.user_id, 'badge', jsonb_build_object('system', true, 'badge_id', new.badge_id, 'badge_name', v_badge_name, 'icon', v_icon, 'message', v_message, 'reaward', v_is_reaward), false);
  end if;

  return new;
end;
$function$;

drop trigger if exists notify_badge_award_user on public.user_badge_awards;
create trigger notify_badge_award_user
after insert on public.user_badge_awards
for each row
execute function public.notify_badge_award();

drop trigger if exists notify_badge_award_staff on public.staff_badge_assignments;
create trigger notify_badge_award_staff
after insert on public.staff_badge_assignments
for each row
execute function public.notify_badge_award();
