-- 0051_fix_classification_constraint.sql
-- Fix posts.classification to be NOT NULL with CHECK (classification IN ('SFW','NSFW')) DEFAULT 'SFW'.
-- Resolves conflict between 0001_initial (NOT NULL, no CHECK) and 0042 (nullable, CHECK allows NULL).
-- Forward-only, idempotent, preserves existing data.

-- ---------------------------------------------------------------------------
-- 1. Ensure column exists with correct base type
-- ---------------------------------------------------------------------------
-- If column doesn't exist at all (unlikely given 0001), add it correctly
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'classification'
  ) then
    alter table public.posts
      add column classification text not null default 'SFW';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Backfill any NULL values to 'SFW' (defensive: 0042 may have left NULLs)
-- ---------------------------------------------------------------------------
update public.posts
set classification = 'SFW'
where classification is null;

-- ---------------------------------------------------------------------------
-- 3. Ensure NOT NULL constraint
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'classification'
      and is_nullable = 'YES'
  ) then
    alter table public.posts
      alter column classification set not null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ensure correct CHECK constraint (classification IN ('SFW','NSFW'))
-- ---------------------------------------------------------------------------
-- Drop any existing CHECK constraint on classification that allows NULL
do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select conname from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c'
      and n.nspname = 'public'
      and c.relname = 'posts'
      and pg_get_constraintdef(con.oid, true) ilike '%classification%'
  loop
    execute 'alter table public.posts drop constraint if exists ' || quote_ident(v_constraint_name);
  end loop;
end;
$$;

-- Add the correct CHECK constraint
alter table public.posts
  add constraint posts_classification_check check (classification in ('SFW', 'NSFW'));

-- ---------------------------------------------------------------------------
-- 5. Ensure DEFAULT 'SFW'
-- ---------------------------------------------------------------------------
alter table public.posts
  alter column classification set default 'SFW';

-- ---------------------------------------------------------------------------
-- 6. Verify the final state
-- ---------------------------------------------------------------------------
do $$
declare
  v_nullable text;
  v_default text;
  v_check_def text;
begin
  select is_nullable, column_default
  into v_nullable, v_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'posts' and column_name = 'classification';

  select pg_get_constraintdef(con.oid, true)
  into v_check_def
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where con.contype = 'c'
    and n.nspname = 'public'
    and c.relname = 'posts'
    and con.conname = 'posts_classification_check';

  if v_nullable <> 'NO' then
    raise exception 'classification column is still nullable after migration';
  end if;

  if v_default not like '%SFW%' then
    raise exception 'classification default is not SFW: %', v_default;
  end if;

  if v_check_def not ilike '%SFW%' or v_check_def not ilike '%NSFW%' then
    raise exception 'classification CHECK constraint missing or incorrect: %', v_check_def;
  end if;

  raise notice 'posts.classification verified: NOT NULL, DEFAULT SFW, CHECK (SFW, NSFW)';
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Comments
-- ---------------------------------------------------------------------------
comment on column public.posts.classification is
  'Content classification: SFW (safe for work) or NSFW (not safe for work). Required, defaults to SFW.';