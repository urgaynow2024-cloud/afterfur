-- Fix badge notification trigger RLS issues.
-- The notify_badge_award trigger function (SECURITY DEFINER) needs to:
-- 1. Read from badge_registry (RLS enabled, no policies)
-- 2. Read from staff_badge_audit (RLS enabled, no policies for authenticated)
-- 3. Insert into notifications (RLS enabled, only SELECT policy)
-- Adding SET row_security = off ensures the function bypasses RLS regardless of owner.

create or replace function public.notify_badge_award()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
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

comment on function public.notify_badge_award() is
  'Trigger function for badge award notifications. Runs with row_security = off to bypass RLS on badge_registry, staff_badge_audit, and notifications tables.';