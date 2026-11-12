-- 0052_add_moderation_columns.sql
-- Add moderation columns to posts and replies (idempotent re-application of 0034).
-- Columns: moderation_status, moderated_at, moderated_by, moderation_reason
-- Includes CHECK constraints, FKs, and indexes.
-- Forward-only, idempotent, preserves existing data.

-- ---------------------------------------------------------------------------
-- 1. posts moderation columns
-- ---------------------------------------------------------------------------

-- moderation_status: NOT NULL DEFAULT 'visible' CHECK ('visible','removed')
alter table public.posts
  add column if not exists moderation_status text not null default 'visible';

-- Backfill any NULLs (defensive)
update public.posts set moderation_status = 'visible' where moderation_status is null;

-- Ensure NOT NULL
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'moderation_status'
      and is_nullable = 'YES'
  ) then
    alter table public.posts alter column moderation_status set not null;
  end if;
end;
$$;

-- Ensure DEFAULT
alter table public.posts alter column moderation_status set default 'visible';

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
      and c.relname = 'posts'
      and pg_get_constraintdef(con.oid, true) ilike '%moderation_status%'
  loop
    execute 'alter table public.posts drop constraint if exists ' || quote_ident(v_constraint_name);
  end loop;
end;
$$;

alter table public.posts
  add constraint posts_moderation_status_check check (moderation_status in ('visible', 'removed'));

-- moderated_at: nullable timestamptz
alter table public.posts
  add column if not exists moderated_at timestamptz;

-- moderated_by: nullable uuid FK to profiles(id)
alter table public.posts
  add column if not exists moderated_by uuid;

-- Add FK if not exists
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = 'posts'
      and kcu.column_name = 'moderated_by'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'profiles'
      and ccu.column_name = 'id'
  ) then
    alter table public.posts
      add constraint posts_moderated_by_fkey
      foreign key (moderated_by) references public.profiles(id) on delete set null;
  end if;
end;
$$;

-- moderation_reason: nullable text
alter table public.posts
  add column if not exists moderation_reason text;

-- Index on moderation_status
create index if not exists posts_moderation_status_idx on public.posts(moderation_status);

-- ---------------------------------------------------------------------------
-- 2. replies moderation columns
-- ---------------------------------------------------------------------------

alter table public.replies
  add column if not exists moderation_status text not null default 'visible';

update public.replies set moderation_status = 'visible' where moderation_status is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'replies' and column_name = 'moderation_status'
      and is_nullable = 'YES'
  ) then
    alter table public.replies alter column moderation_status set not null;
  end if;
end;
$$;

alter table public.replies alter column moderation_status set default 'visible';

do $$
declare v_constraint_name text;
begin
  for v_constraint_name in
    select conname from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c'
      and n.nspname = 'public'
      and c.relname = 'replies'
      and pg_get_constraintdef(con.oid, true) ilike '%moderation_status%'
  loop
    execute 'alter table public.replies drop constraint if exists ' || quote_ident(v_constraint_name);
  end loop;
end;
$$;

alter table public.replies
  add constraint replies_moderation_status_check check (moderation_status in ('visible', 'removed'));

alter table public.replies
  add column if not exists moderated_at timestamptz;

alter table public.replies
  add column if not exists moderated_by uuid;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = 'replies'
      and kcu.column_name = 'moderated_by'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'profiles'
      and ccu.column_name = 'id'
  ) then
    alter table public.replies
      add constraint replies_moderated_by_fkey
      foreign key (moderated_by) references public.profiles(id) on delete set null;
  end if;
end;
$$;

alter table public.replies
  add column if not exists moderation_reason text;

create index if not exists replies_moderation_status_idx on public.replies(moderation_status);

-- ---------------------------------------------------------------------------
-- 3. Comments
-- ---------------------------------------------------------------------------
comment on column public.posts.moderation_status is
  'Moderator visibility state: visible (default) or removed. Removed content is hidden from ordinary surfaces.';
comment on column public.posts.moderated_at is 'Timestamp when moderation action was taken.';
comment on column public.posts.moderated_by is 'Moderator who took the action (FK to profiles).';
comment on column public.posts.moderation_reason is 'Reason for moderation action.';

comment on column public.replies.moderation_status is
  'Moderator visibility state: visible (default) or removed. Removed content is hidden from ordinary surfaces.';
comment on column public.replies.moderated_at is 'Timestamp when moderation action was taken.';
comment on column public.replies.moderated_by is 'Moderator who took the action (FK to profiles).';
comment on column public.replies.moderation_reason is 'Reason for moderation action.';

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  -- Verify posts columns
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'posts'
    and column_name in ('moderation_status','moderated_at','moderated_by','moderation_reason');
  if v_count <> 4 then
    raise exception 'posts missing moderation columns: found % of 4', v_count;
  end if;

  -- Verify replies columns
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name = 'replies'
    and column_name in ('moderation_status','moderated_at','moderated_by','moderation_reason');
  if v_count <> 4 then
    raise exception 'replies missing moderation columns: found % of 4', v_count;
  end if;

  -- Verify CHECK constraints
  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = 'posts'
      and con.conname = 'posts_moderation_status_check'
  ) then
    raise exception 'posts_moderation_status_check missing';
  end if;

  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = 'replies'
      and con.conname = 'replies_moderation_status_check'
  ) then
    raise exception 'replies_moderation_status_check missing';
  end if;

  -- Verify FKs
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and tc.table_name = 'posts'
      and kcu.column_name = 'moderated_by' and ccu.table_name = 'profiles' and ccu.column_name = 'id'
  ) then
    raise exception 'posts.moderated_by FK missing';
  end if;

  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public' and tc.table_name = 'replies'
      and kcu.column_name = 'moderated_by' and ccu.table_name = 'profiles' and ccu.column_name = 'id'
  ) then
    raise exception 'replies.moderated_by FK missing';
  end if;

  -- Verify indexes
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'posts' and indexname = 'posts_moderation_status_idx') then
    raise exception 'posts_moderation_status_idx missing';
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'replies' and indexname = 'replies_moderation_status_idx') then
    raise exception 'replies_moderation_status_idx missing';
  end if;

  raise notice 'Moderation columns verified on posts and replies';
end;
$$;