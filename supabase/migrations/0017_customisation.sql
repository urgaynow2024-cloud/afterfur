-- Public profile customisation and private UI preferences.
-- Public styling is stored on profiles and is visible to everyone.
-- Private UI preferences are stored separately and are owner-only.

alter table public.profiles
  add column if not exists profile_customisation jsonb;

create table if not exists public.user_ui_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_ui_preferences enable row level security;
drop policy if exists "ui preferences own" on public.user_ui_preferences;
create policy "ui preferences own" on public.user_ui_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.user_ui_preferences from public, anon;
grant select, insert, update, delete on public.user_ui_preferences to authenticated;

create or replace function public.update_profile_customisation(p_config jsonb)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid(); v_is_prime boolean;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select public.is_prime_member(v_user) into v_is_prime;
  if not v_is_prime then raise exception 'PawPass Prime membership required' using errcode = '42501'; end if;
  -- Validate minimal safe shape: only known keys and hex/enum values.
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Invalid configuration' using errcode = '22023'; end if;
  update public.profiles set profile_customisation = p_config where id = v_user;
  return true;
end;
$function$;
revoke all on function public.update_profile_customisation(jsonb) from public, anon;
grant execute on function public.update_profile_customisation(jsonb) to authenticated;

create or replace function public.get_my_ui_preferences()
returns jsonb
language sql stable security definer set search_path = pg_catalog, public
as $function$
  select coalesce((select preferences from public.user_ui_preferences where user_id = auth.uid()), '{}'::jsonb);
$function$;
revoke all on function public.get_my_ui_preferences() from public, anon;
grant execute on function public.get_my_ui_preferences() to authenticated;

create or replace function public.update_ui_preferences(p_preferences jsonb)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then raise exception 'Invalid preferences' using errcode = '22023'; end if;
  insert into public.user_ui_preferences(user_id, preferences, updated_at)
    values (v_user, p_preferences, now())
    on conflict (user_id) do update set preferences = excluded.preferences, updated_at = now();
  return true;
end;
$function$;
revoke all on function public.update_ui_preferences(jsonb) from public, anon;
grant execute on function public.update_ui_preferences(jsonb) to authenticated;
