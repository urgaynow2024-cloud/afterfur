-- STAGE 21A FINAL BLOCKING MIGRATION (corrected)

-- Dedicated current-user helper for RLS (SECURITY DEFINER)
create or replace function public.is_current_user_blocked(other uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select case when auth.uid() is null then false else exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  ) end;
$$;

revoke all on function public.is_current_user_blocked(uuid) from public;
grant execute on function public.is_current_user_blocked(uuid) to anon, authenticated;

-- Keep is_blocked internal: revoke from anon/authenticated, grant service_role only
revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_blocked(uuid, uuid) to service_role;

-- Resolve any pre-existing bidirectional block policies referencing is_blocked
drop policy if exists "posts_block_bidirectional" on public.posts;
drop policy if exists "profiles_block_bidirectional" on public.profiles;

-- Permissive baseline public read (preserve)
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles
  for select using (true);

drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts
  for select using (true);

-- Restrictive block-enforcement policies
drop policy if exists "profiles_block_restrictive" on public.profiles;
create policy "profiles_block_restrictive" on public.profiles
  as restrictive for select
  using (auth.uid() is null or not public.is_current_user_blocked(id));

drop policy if exists "posts_block_restrictive" on public.posts;
create policy "posts_block_restrictive" on public.posts
  as restrictive for select
  using (auth.uid() is null or not public.is_current_user_blocked(author_id));

-- Likes guard
create or replace function public.guard_like_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  post_author uuid;
begin
  if actor is not null then
    if new.user_id is distinct from actor then
      raise exception 'actor mismatch';
    end if;
  end if; -- service role: validated by target only
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is null then
    raise exception 'post not found';
  end if;
  if public.is_blocked(new.user_id, post_author) then
    raise exception 'blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists likes_block_check on public.likes;
create trigger likes_block_check
  before insert or update on public.likes
  for each row execute function public.guard_like_block();

-- Reposts guard
create or replace function public.guard_repost_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  post_author uuid;
begin
  if actor is not null then
    if new.user_id is distinct from actor then
      raise exception 'actor mismatch';
    end if;
  end if;
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is null then
    raise exception 'post not found';
  end if;
  if public.is_blocked(new.user_id, post_author) then
    raise exception 'blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists reposts_block_check on public.reposts;
create trigger reposts_block_check
  before insert or update on public.reposts
  for each row execute function public.guard_repost_block();

-- Replies guard
create or replace function public.guard_reply_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor uuid := auth.uid();
  post_author uuid;
begin
  if actor is not null then
    if new.author_id is distinct from actor then
      raise exception 'actor mismatch';
    end if;
  end if;
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is null then
    raise exception 'post not found';
  end if;
  if public.is_blocked(new.author_id, post_author) then
    raise exception 'blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists replies_block_check on public.replies;
create trigger replies_block_check
  before insert or update on public.replies
  for each row execute function public.guard_reply_block();

-- Notification guard preserving UUID validation
create or replace function public.guard_notification_block()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_text text;
  actor_uuid uuid;
begin
  actor_text := new.payload ->> 'actor_id';
  if actor_text is null then
    return new;
  end if;
  if actor_text = '' then
    raise exception 'malformed actor_id';
  end if;
  begin
    actor_uuid := actor_text::uuid;
  exception when others then
    raise exception 'invalid actor_id';
  end;
  if public.is_blocked(new.user_id, actor_uuid) then
    raise exception 'blocked';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_block_check on public.notifications;
create trigger notifications_block_check
  before insert or update on public.notifications
  for each row execute function public.guard_notification_block();

-- Preserve existing follow triggers/functions (do not replace)
-- Ensure follows_block_check exists using existing prevent_follow_when_blocked
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

-- Preserve blocks_remove_follows trigger
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
