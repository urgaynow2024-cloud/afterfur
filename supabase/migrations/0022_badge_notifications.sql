-- Universal SYSTEM notifications for newly awarded badges.
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
begin
  select display_name, coalesce((select mark from public.badge_registry where id = new.badge_id), '') into v_badge_name, v_icon
    from public.badge_registry where id = new.badge_id;
  if v_badge_name is null then v_badge_name := new.badge_id; end if;
  v_message := case new.badge_id
    when 'ad_creator' then 'Congratulations! You''ve earned the AD Creator badge for reaching 500 followers!'
    else 'You''ve received a new badge: ' || v_badge_name || '!'
  end;
  if not exists (
    select 1 from public.notifications
    where user_id = new.user_id and type = 'badge'
      and payload @> jsonb_build_object('badge_id', new.badge_id)
  ) then
    insert into public.notifications (user_id, type, payload, read)
    values (new.user_id, 'badge', jsonb_build_object('system', true, 'badge_id', new.badge_id, 'badge_name', v_badge_name, 'icon', v_icon, 'message', v_message), false);
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
