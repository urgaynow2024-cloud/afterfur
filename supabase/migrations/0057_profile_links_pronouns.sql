-- 0057_profile_links_pronouns.sql
-- Add optional pronouns column to profiles and a profile_links table for
-- managing multiple external links with labels and ordering.

-- ---------------------------------------------------------------------------
-- 1. pronouns column on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists pronouns text;

update public.profiles set pronouns = null where pronouns is null;

-- ---------------------------------------------------------------------------
-- 2. profile_links table
-- ---------------------------------------------------------------------------
create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  label text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile_links enable row level security;

drop policy if exists "profile_links own select" on public.profile_links;
create policy "profile_links own select" on public.profile_links
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profile_links own insert" on public.profile_links;
create policy "profile_links own insert" on public.profile_links
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profile_links own update" on public.profile_links;
create policy "profile_links own update" on public.profile_links
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "profile_links own delete" on public.profile_links;
create policy "profile_links own delete" on public.profile_links
  for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.profile_links from public, anon;
grant select on public.profile_links to authenticated;

create index if not exists profile_links_user_idx on public.profile_links(user_id, display_order);

-- ---------------------------------------------------------------------------
-- 3. Helper RPCs for managing profile links
-- ---------------------------------------------------------------------------

create or replace function public.upsert_profile_links(p_links jsonb)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' then raise exception 'Invalid links payload' using errcode = '22023'; end if;

  -- Only allow safe http(s) URLs; reject javascript:, data: and other unsafe schemes.
  if exists (
    select 1 from jsonb_array_elements(p_links) as elem
    where (elem->>'url') is not null
      and (elem->>'url') <> ''
      and lower((elem->>'url')) !~~ 'https?://%'
  ) then raise exception 'Unsafe link URL scheme. Only http:// and https:// links are allowed.' using errcode = '22023'; end if;

  -- Delete all existing links for this user; we re-insert the full ordered set.
  delete from public.profile_links where user_id = v_user;

  insert into public.profile_links(user_id, url, label, display_order)
  select
    v_user,
    (elem->>'url')::text,
    nullif(trim((elem->>'label')::text), ''),
    coalesce((elem->>'display_order')::integer, 0)
  from jsonb_array_elements(p_links) as elem
  where (elem->>'url') is not null and (elem->>'url') <> '';

  return true;
end;
$function$;
revoke all on function public.upsert_profile_links(jsonb) from public, anon;
grant execute on function public.upsert_profile_links(jsonb) to authenticated;

create or replace function public.get_my_profile_links()
returns jsonb
language sql stable security definer set search_path = pg_catalog, public
as $function$
  select coalesce(
    (select jsonb_agg(row_to_json(t) order by t.display_order, t.created_at)
     from (
       select id, url, label, display_order, created_at, updated_at
       from public.profile_links
       where user_id = auth.uid()
     ) t),
    '[]'::jsonb
  );
$function$;
revoke all on function public.get_my_profile_links() from public, anon;
grant execute on function public.get_my_profile_links() to authenticated;