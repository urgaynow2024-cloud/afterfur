-- Ad badge posting permission.
--
-- Adds `public.has_ad_badge()`, a server-side function that reports whether a
-- user possesses the official Ad badge (`ad_creator`). The badge can be held
-- in either `staff_badge_assignments` (manual administrator award) or
-- `user_badge_awards` (automatic eligibility award), so both are checked.
--
-- Used by the posts API (`/api/posts`) to gate creation of Ad-section
-- (NSFW-classified) posts. Possession of the badge is the source of truth;
-- no secondary approval or eligibility flag is required.
--
-- Additive migration: does not alter existing tables, functions, badges, RLS
-- policies, or moderation rules.

create or replace function public.has_ad_badge(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_user_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.staff_badge_assignments
    where user_id = p_user_id and badge_id = 'ad_creator'
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.user_badge_awards
    where user_id = p_user_id and badge_id = 'ad_creator'
  ) then
    return true;
  end if;

  return false;
end;
$function$;

revoke all on function public.has_ad_badge(uuid) from public, anon;
grant execute on function public.has_ad_badge(uuid) to authenticated;

comment on function public.has_ad_badge(uuid) is
  'Returns true if the user holds the official Ad badge (ad_creator) in either staff_badge_assignments or user_badge_awards. Used to gate Ad-section post creation.';
