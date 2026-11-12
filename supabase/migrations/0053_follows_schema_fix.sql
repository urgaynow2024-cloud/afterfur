-- 0053_follows_schema_fix.sql
-- Add missing columns and constraints to follows table (idempotent re-application of STAGE_21B).
-- Columns: status, created_at
-- Includes CHECK constraint and index.
-- Forward-only, idempotent, preserves existing data.

-- ---------------------------------------------------------------------------
-- 1. status column: NOT NULL DEFAULT 'accepted' CHECK ('pending','accepted','rejected')
-- ---------------------------------------------------------------------------
alter table public.follows
  add column if not exists status text not null default 'accepted';

-- Backfill any NULLs
update public.follows set status = 'accepted' where status is null;

-- Ensure NOT NULL
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'follows' and column_name = 'status'
      and is_nullable = 'YES'
  ) then
    alter table public.follows alter column status set not null;
  end if;
end;
$$;

-- Ensure DEFAULT
alter table public.follows alter column status set default 'accepted';

-- Ensure CHECK constraint
do $$
declare v_constraint_name text;
begin
  for v_constraint_name in
    select conname from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c'
      and n.nspname = 'public'
      and c.relname = 'follows'
      and pg_get_constraintdef(con.oid, true) ilike '%status%'
  loop
    execute 'alter table public.follows drop constraint if exists ' || quote_ident(v_constraint_name);
  end loop;
end;
$$;

alter table public.follows
  add constraint follows_status_check check (status in ('pending', 'accepted', 'rejected'));

-- Index on status
create index if not exists follows_status_idx on public.follows(status);

-- ---------------------------------------------------------------------------
-- 2. created_at column: timestamptz NOT NULL DEFAULT now()
-- ---------------------------------------------------------------------------
alter table public.follows
  add column if not exists created_at timestamptz not null default now();

-- Backfill any NULLs
update public.follows set created_at = now() where created_at is null;

-- Ensure NOT NULL
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'follows' and column_name = 'created_at'
      and is_nullable = 'YES'
  ) then
    alter table public.follows alter column created_at set not null;
  end if;
end;
$$;

-- Ensure DEFAULT
alter table public.follows alter column created_at set default now();

-- ---------------------------------------------------------------------------
-- 3. Comments
-- ---------------------------------------------------------------------------
comment on column public.follows.status is
  'Follow request status: pending (requested), accepted (mutual follow), rejected (declined). Default: accepted for backward compatibility with existing follows.';
comment on column public.follows.created_at is 'Timestamp when the follow relationship was created.';

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
do $$
declare
  v_count int;
  v_nullable text;
  v_default text;
begin
  -- Verify status column
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'follows' and column_name = 'status';

  select is_nullable into v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'follows' and column_name = 'status';

  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'follows' and column_name = 'status';

  if v_count <> 1 then
    raise exception 'follows.status column missing';
  end if;
  if v_nullable <> 'NO' then
    raise exception 'follows.status is nullable';
  end if;
  if v_default not like '%accepted%' then
    raise exception 'follows.status default incorrect: %', v_default;
  end if;

  -- Verify created_at column
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'follows' and column_name = 'created_at';

  select is_nullable into v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'follows' and column_name = 'created_at';

  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'follows' and column_name = 'created_at';

  if v_count <> 1 then
    raise exception 'follows.created_at column missing';
  end if;
  if v_nullable <> 'NO' then
    raise exception 'follows.created_at is nullable';
  end if;

  -- Verify CHECK constraint
  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = 'follows'
      and con.conname = 'follows_status_check'
  ) then
    raise exception 'follows_status_check constraint missing';
  end if;

  -- Verify index
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'follows' and indexname = 'follows_status_idx') then
    raise exception 'follows_status_idx missing';
  end if;

  raise notice 'follows schema verified: status, created_at, CHECK, index';
end;
$$;