-- 0048_blocks_table.sql
-- Create the missing blocks table with full RLS, functions, and triggers.
-- Referenced by 15+ application files and STAGE_21A_FINAL_BLOCKING_MIGRATION.sql.
-- Forward-only, idempotent where possible.

-- ---------------------------------------------------------------------------
-- 1. blocks table
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self_block check (blocker_id <> blocked_id)
);

-- Indexes for common query patterns
create index if not exists blocks_blocker_idx on public.blocks(blocker_id);
create index if not exists blocks_blocked_idx on public.blocks(blocked_id);

-- Enable RLS
alter table public.blocks enable row level security;

-- RLS Policies
-- Users can read their own blocks (both as blocker and blocked)
drop policy if exists "blocks readable by blocker" on public.blocks;
create policy "blocks readable by blocker"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "blocks readable by blocked" on public.blocks;
create policy "blocks readable by blocked"
  on public.blocks for select
  to authenticated
  using (blocked_id = auth.uid());

-- Users can insert their own blocks (as blocker)
drop policy if exists "blocks insert own" on public.blocks;
create policy "blocks insert own"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

-- Users can delete their own blocks (as blocker)
drop policy if exists "blocks delete own" on public.blocks;
create policy "blocks delete own"
  on public.blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Core block-checking functions (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

-- is_blocked(blocker, blocked) - internal, service_role only
-- Returns true if a bidirectional block exists between the two users.
-- Drop first to avoid "cannot change name of input parameter" error if
-- existing function has different parameter names.
drop function if exists public.is_blocked(uuid, uuid) cascade;

create function public.is_blocked(p_blocker_id uuid, p_blocked_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_blocker_id and blocked_id = p_blocked_id)
       or (blocker_id = p_blocked_id and blocked_id = p_blocker_id)
  );
$function$;

revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_blocked(uuid, uuid) to service_role;

comment on function public.is_blocked(uuid, uuid) is
  'Internal bidirectional block check. Restricted to service_role. Use is_current_user_blocked for client access.';

-- is_current_user_blocked(other_user) - client-accessible
-- Returns true if current user has a bidirectional block with other_user.
-- Drop first to avoid parameter name conflicts.
drop function if exists public.is_current_user_blocked(uuid) cascade;

create function public.is_current_user_blocked(p_other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select case when auth.uid() is null then false else exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = p_other_user)
       or (blocker_id = p_other_user and blocked_id = auth.uid())
  ) end;
$function$;

revoke all on function public.is_current_user_blocked(uuid) from public, anon, authenticated;
grant execute on function public.is_current_user_blocked(uuid) to anon, authenticated;

comment on function public.is_current_user_blocked(uuid) is
  'Client-accessible bidirectional block check for RLS policies and application logic.';

-- ---------------------------------------------------------------------------
-- 3. Follow-blocking trigger function
-- ---------------------------------------------------------------------------
-- prevent_follow_when_blocked - prevents creating follows when a block exists
create or replace function public.prevent_follow_when_blocked()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_id uuid := auth.uid();
begin
  -- Only enforce for authenticated users (service_role bypasses via is_blocked grants)
  if v_actor_id is not null then
    if new.follower_id is distinct from v_actor_id then
      raise exception 'actor mismatch' using errcode = '42501';
    end if;
    -- Block if either direction exists
    if public.is_blocked(new.follower_id, new.following_id) then
      raise exception 'blocked' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.prevent_follow_when_blocked() from public, anon, authenticated;
grant execute on function public.prevent_follow_when_blocked() to authenticated;

comment on function public.prevent_follow_when_blocked() is
  'Trigger function: prevents follow insert/update when a block exists between the users.';

-- Trigger on follows table (created conditionally to avoid conflicts)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'follows_block_check'
  ) then
    create trigger follows_block_check
      before insert or update on public.follows
      for each row execute function public.prevent_follow_when_blocked();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Block-cascade trigger: remove follows when block created
-- ---------------------------------------------------------------------------
-- remove_follows_on_block - deletes follow relationships when a block is created
create or replace function public.remove_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  -- Delete follows in both directions between blocker and blocked
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$function$;

revoke all on function public.remove_follows_on_block() from public, anon, authenticated;
grant execute on function public.remove_follows_on_block() to authenticated;

comment on function public.remove_follows_on_block() is
  'Trigger function: removes follow relationships in both directions when a block is created.';

-- Trigger on blocks table (created conditionally)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'blocks_remove_follows'
  ) then
    create trigger blocks_remove_follows
      after insert on public.blocks
      for each row execute function public.remove_follows_on_block();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
revoke all on public.blocks from public, anon, authenticated;
grant select, insert, delete on public.blocks to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Comments
-- ---------------------------------------------------------------------------
comment on table public.blocks is
  'User blocks: bidirectional relationship preventing interaction. When A blocks B, neither can follow, like, repost, reply, or message the other.';
comment on column public.blocks.blocker_id is 'User who initiated the block.';
comment on column public.blocks.blocked_id is 'User who is blocked.';
comment on column public.blocks.created_at is 'Timestamp when the block was created.';