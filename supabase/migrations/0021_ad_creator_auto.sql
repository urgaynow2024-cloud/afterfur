-- Automatic AD Creator award at 500 followers, with a single SYSTEM notification.
create or replace function public.award_ad_creator_if_eligible(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_count integer;
  v_inserted boolean := false;
begin
  if p_user_id is null then return; end if;
  select count(distinct follower_id) into v_count
    from public.follows where following_id = p_user_id;
  if v_count < 500 then return; end if;
  insert into public.user_badge_awards (user_id, badge_id, awarded_at)
    values (p_user_id, 'ad_creator', now())
    on conflict (user_id, badge_id) do nothing;
  -- Notification is created by the universal badge notification trigger.
  return;
end;
$function$;

-- Trigger on new follows.
create or replace function public.trg_award_ad_creator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.award_ad_creator_if_eligible(new.following_id);
  return new;
end;
$function$;

drop trigger if exists award_ad_creator_on_follow on public.follows;
create trigger award_ad_creator_on_follow
after insert on public.follows
for each row
execute function public.trg_award_ad_creator();

-- Ensure AD Creator is manually manageable by authorised staff.
create or replace function public.manage_staff_badge(p_target_id uuid, p_badge_id text, p_action text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_actor_id uuid := auth.uid();
begin
  perform public.require_afterfur_staff_admin();
  if v_actor_id = p_target_id and coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff badges cannot be assigned to yourself' using errcode = '42501';
  end if;
  if p_badge_id not in ('staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester',
      'access_age_verified', 'access_approved', 'creator_featured', 'achievement_event_winner', 'community_helper',
      'web_designer', 'ad_creator') then
    raise exception 'Unknown manual badge' using errcode = '22023';
  end if;
  if p_action not in ('grant', 'revoke') then raise exception 'Action must be grant or revoke' using errcode = '22023'; end if;
  if not exists(select 1 from public.profiles where id = p_target_id) then raise exception 'Target account not found' using errcode = '22023'; end if;
  if p_action = 'grant' then
    insert into public.staff_badge_assignments(user_id, badge_id, assigned_by)
      values (p_target_id, p_badge_id, v_actor_id) on conflict (user_id, badge_id) do nothing;
    if not found then return false; end if;
  else
    delete from public.staff_badge_assignments where user_id = p_target_id and badge_id = p_badge_id;
    if not found then return false; end if;
  end if;
  insert into public.staff_badge_audit(actor_id, target_id, badge_id, action)
    values (v_actor_id, p_target_id, p_badge_id, p_action);
  return true;
end;
$function$;
revoke all on function public.manage_staff_badge(uuid, text, text) from public, anon;
grant execute on function public.manage_staff_badge(uuid, text, text) to authenticated;

-- Ensure check constraint allows ad_creator.
alter table public.staff_badge_assignments
  drop constraint if exists staff_badge_assignments_badge_id_check;
alter table public.staff_badge_assignments
  add constraint staff_badge_assignments_badge_id_check
  check (badge_id in (
    'staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester',
    'access_age_verified', 'access_approved',
    'creator_featured', 'achievement_event_winner', 'community_helper',
    'web_designer', 'ad_creator'
  ));
