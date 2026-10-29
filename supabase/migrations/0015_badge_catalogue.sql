-- Badge catalogue expansion and manual badge management.
-- Depends on migrations 0011-0014.

-- Expand allowed badge categories.
alter table public.badge_registry
  drop constraint if exists badge_registry_category_check;
alter table public.badge_registry
  add constraint badge_registry_category_check
  check (category in ('staff', 'membership', 'milestone', 'trust', 'creator', 'achievement', 'community'));

insert into public.badge_registry (id, category, display_name, display_order) values
  ('access_after_dark', 'trust', 'After Dark', 600),
  ('access_age_verified', 'trust', 'Age Verified', 610),
  ('access_approved', 'trust', 'Approved', 620),
  ('web_designer', 'staff', 'Web Designer', 45),
  ('ad_creator', 'creator', 'AD Creator', 655),
  ('creator_featured', 'creator', 'Featured Creator', 660),
  ('community_helper', 'community', 'Community Helper', 700),
  ('achievement_event_winner', 'achievement', 'Event Winner', 750),
  ('early_supporter', 'membership', 'Early Supporter', 108),
  ('founding_50', 'membership', 'Founding 50', 109)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

-- Expand manual badge assignments to include all server-authorised manual badges.
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

-- Update manual badge management to allow the expanded catalogue.
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
  if p_badge_id = 'web_designer' and not exists (
      select 1 from public.staff_badge_assignments where user_id = v_actor_id and badge_id = 'staff_founder'
  ) then
    raise exception 'Founder access required' using errcode = '42501';
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

-- Award Founding 50 badge to successful founding claimants in public badge projection.
create or replace function public.get_public_badges(p_user_ids uuid[])
returns table(user_id uuid, badge_id text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user_id uuid; v_years integer; v_membership record; v_cutoff timestamptz;
begin
  if p_user_ids is null then return; end if;
  if cardinality(p_user_ids) > 100 then raise exception 'A maximum of 100 badge subjects may be requested'; end if;
  foreach v_user_id in array p_user_ids loop
    if v_user_id is null then continue; end if;
    select greatest(0, extract(year from age(now(), o.account_created_at))::integer)
      into v_years from public.badge_account_origins o where o.user_id = v_user_id;
    if v_years is not null and v_years > 0 then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
      select v_user_id, 'milestone_account_year_' || n, now()
      from generate_series(1, least(v_years, 50)) n
      on conflict (user_id, badge_id) do nothing;
    end if;
    select e.status, e.eligible_since, e.current_period_end, e.source into v_membership
      from public.pawpass_entitlements e where e.user_id = v_user_id;
    if v_membership.status in ('active', 'cancel_at_period_end') and v_membership.current_period_end is not null then
      v_cutoff := least(now(), v_membership.current_period_end);
      perform public.award_pawpass_months(v_user_id, v_membership.eligible_since, v_cutoff);
    end if;
  end loop;
   return query
     select s.user_id, s.badge_id from public.staff_badge_assignments s
     join public.badge_registry r on r.id = s.badge_id and r.is_public
     where s.user_id = any(p_user_ids)
     union
     select a.user_id, a.badge_id from public.user_badge_awards a
     join public.badge_registry r on r.id = a.badge_id and r.is_public
     where a.user_id = any(p_user_ids)
     union
     select e.user_id, 'pawpass_member'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_member' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now()
     union
     select e.user_id, 'pawpass_prime'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_prime' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now()
     union
     select c.user_id, 'founding_50'::text from public.pawpass_founding_claims c
     join public.badge_registry r on r.id = 'founding_50' and r.is_public
     where c.user_id = any(p_user_ids);
end;
$function$;
