-- Normalize AD Creator badge ID to ad_creator.
insert into public.badge_registry (id, category, display_name, display_order)
values ('ad_creator', 'creator', 'AD Creator', 655)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

-- Migrate any existing awards/assignments.
update public.user_badge_awards set badge_id = 'ad_creator' where badge_id = 'creator_ad';
update public.staff_badge_assignments set badge_id = 'ad_creator' where badge_id = 'creator_ad';

-- Remove the old duplicate badge id.
delete from public.badge_registry where id = 'creator_ad';
