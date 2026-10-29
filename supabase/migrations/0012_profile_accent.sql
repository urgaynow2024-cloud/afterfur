-- PawPass Milestone 1: Profile accent colour (Prime benefit).
-- Adds a server-authoritative profile_accent column and an RPC for Prime users
-- to update it. Non-Prime users cannot save non-default accents.

alter table public.profiles add column if not exists profile_accent text;

-- Allowlist of valid accent values (null = default).
-- The RPC enforces this; the column itself stores the chosen value.

create or replace function public.update_profile_accent(p_accent text)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user_id uuid := auth.uid();
declare v_is_prime boolean;
declare v_allowed text[] := array['default', 'purple', 'blue', 'emerald', 'amber', 'rose'];
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_accent is not null and not (p_accent = any(v_allowed)) then
    raise exception 'Invalid accent value' using errcode = '22023';
  end if;
  -- Prime entitlement check: only active members may set non-default accents.
  select exists (
    select 1 from public.pawpass_entitlements e
    where e.user_id = v_user_id
      and e.status in ('active', 'cancel_at_period_end')
      and e.current_period_end is not null
      and e.current_period_end > now()
  ) into v_is_prime;
  if p_accent is not null and p_accent <> 'default' and not v_is_prime then
    raise exception 'PawPass Prime membership required for custom accent colours' using errcode = '42501';
  end if;
  update public.profiles set profile_accent = nullif(p_accent, 'default') where id = v_user_id;
  return true;
end;
$function$;

revoke all on function public.update_profile_accent(text) from public;
grant execute on function public.update_profile_accent(text) to authenticated;

create or replace function public.get_my_profile_accent()
returns text
language sql security definer set search_path = pg_catalog, public
as $function$
  select profile_accent from public.profiles where id = auth.uid();
$function$;

revoke all on function public.get_my_profile_accent() from public;
grant execute on function public.get_my_profile_accent() to authenticated;
