-- 0054_profiles_schema_fix.sql
-- Add missing is_private column to profiles table (idempotent re-application of STAGE_21B).
-- Column: is_private boolean NOT NULL DEFAULT false
-- Forward-only, idempotent, preserves existing data.

-- ---------------------------------------------------------------------------
-- 1. is_private column
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_private boolean not null default false;

-- Backfill any NULLs
update public.profiles set is_private = false where is_private is null;

-- Ensure NOT NULL
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_private'
      and is_nullable = 'YES'
  ) then
    alter table public.profiles alter column is_private set not null;
  end if;
end;
$$;

-- Ensure DEFAULT
alter table public.profiles alter column is_private set default false;

-- ---------------------------------------------------------------------------
-- 2. Comments
-- ---------------------------------------------------------------------------
comment on column public.profiles.is_private is
  'Profile privacy flag. When true, profile and posts are only visible to the owner and accepted followers.';

-- ---------------------------------------------------------------------------
-- 3. Verification
-- ---------------------------------------------------------------------------
do $$
declare
  v_count int;
  v_nullable text;
  v_default text;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_private';

  select is_nullable into v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_private';

  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_private';

  if v_count <> 1 then
    raise exception 'profiles.is_private column missing';
  end if;
  if v_nullable <> 'NO' then
    raise exception 'profiles.is_private is nullable';
  end if;
  if v_default not like '%false%' then
    raise exception 'profiles.is_private default incorrect: %', v_default;
  end if;

  raise notice 'profiles.is_private verified: boolean NOT NULL DEFAULT false';
end;
$$;