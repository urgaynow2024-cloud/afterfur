-- 0055_rls_policy_composition.sql
-- Fix RLS policy composition for posts, profiles, follows, replies.
-- Ensures permissive (classification/privacy) and restrictive (block) policies compose correctly.
-- Forward-only, idempotent (DROP POLICY IF EXISTS before CREATE).

-- ============================================================
-- 1. POSTS - Classification + Block + Privacy + Ownership
-- ============================================================

-- Drop all existing policies to start clean
drop policy if exists "posts readable" on public.posts;
drop policy if exists "posts_read_sfw_public" on public.posts;
drop policy if exists "posts_read_nsfw_authenticated" on public.posts;
drop policy if exists "posts_block_restrictive" on public.posts;
drop policy if exists "posts_privacy_restrictive" on public.posts;
drop policy if exists "posts insert own" on public.posts;
drop policy if exists "posts update own" on public.posts;
drop policy if exists "posts delete own" on public.posts;

-- Permissive read: SFW posts visible to everyone (including anon)
create policy "posts_read_sfw_public"
  on public.posts for select
  using (classification = 'SFW' and moderation_status = 'visible');

-- Permissive read: NSFW posts visible to authenticated users only
create policy "posts_read_nsfw_authenticated"
  on public.posts for select
  to authenticated
  using (classification = 'NSFW' and moderation_status = 'visible' and auth.uid() is not null);

-- Restrictive read: Block enforcement (applies to ALL reads, AND'd with permissive above)
create policy "posts_block_restrictive"
  on public.posts
  as restrictive for select
  using (auth.uid() is null or not public.is_current_user_blocked(author_id));

-- Restrictive read: Privacy enforcement (applies to ALL reads, AND'd with permissive above)
create policy "posts_privacy_restrictive"
  on public.posts
  as restrictive for select
  using (
    author_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = author_id and p.is_private = false)
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = author_id
        and f.status = 'accepted'
    )
  );

-- Insert: Own posts only, NSFW requires ad_creator badge, no enforced users
create policy "posts insert own"
  on public.posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
    and (classification <> 'NSFW' or public.has_ad_badge(auth.uid()))
    and moderation_status = 'visible'
  );

-- Update: Own posts only, NSFW requires ad_creator badge, no enforced users
create policy "posts update own"
  on public.posts for update
  to authenticated
  using (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
  )
  with check (
    auth.uid() = author_id
    and (classification <> 'NSFW' or public.has_ad_badge(auth.uid()))
    and moderation_status = 'visible'
  );

-- Delete: Own posts only
create policy "posts delete own"
  on public.posts for delete
  to authenticated
  using (auth.uid() = author_id);

-- ============================================================
-- 2. PROFILES - Public read + Block + Privacy
-- ============================================================

drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles self insert" on public.profiles;
drop policy if exists "profiles_block_restrictive" on public.profiles;
drop policy if exists "profiles_privacy_restrictive" on public.profiles;

-- Permissive read: Public profiles (base)
create policy "profiles readable"
  on public.profiles for select
  using (true);

-- Restrictive: Block enforcement
create policy "profiles_block_restrictive"
  on public.profiles
  as restrictive for select
  using (auth.uid() is null or not public.is_current_user_blocked(id));

-- Restrictive: Privacy enforcement
create policy "profiles_privacy_restrictive"
  on public.profiles
  as restrictive for select
  using (
    auth.uid() = id
    or is_private = false
    or exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid()
        and f.following_id = id
        and f.status = 'accepted'
    )
  );

-- Update: Self only
create policy "profiles self update"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Insert: Self only (profile creation trigger handles initial insert)
create policy "profiles self insert"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- ============================================================
-- 3. FOLLOWS - Accepted public + Pending to recipient + Block enforcement
-- ============================================================

drop policy if exists "follows readable" on public.follows;
drop policy if exists "follows manage own" on public.follows;

-- Permissive read: Accepted follows visible to all; pending visible to recipient
create policy "follows readable"
  on public.follows for select
  using (
    status = 'accepted'
    or (status = 'pending' and following_id = auth.uid())
  );

-- Restrictive: Block enforcement (prevent reading follows involving blocked users)
-- Note: The follows_block_check trigger prevents creation, but this restricts reads
create policy "follows_block_restrictive"
  on public.follows
  as restrictive for select
  using (
    auth.uid() is null
    or not public.is_current_user_blocked(follower_id)
    or not public.is_current_user_blocked(following_id)
  );

-- Insert/Update/Delete: Self as follower only
create policy "follows manage own"
  on public.follows for all
  to authenticated
  using (auth.uid() = follower_id)
  with check (auth.uid() = follower_id);

-- ============================================================
-- 4. REPLIES - Similar to posts but without classification
-- ============================================================

drop policy if exists "replies readable" on public.replies;
drop policy if exists "replies insert own" on public.replies;
drop policy if exists "replies update own" on public.replies;
drop policy if exists "replies delete own" on public.replies;
drop policy if exists "replies_block_restrictive" on public.replies;
drop policy if exists "replies_privacy_restrictive" on public.replies;

-- Permissive read: Visible replies (moderation_status = 'visible')
create policy "replies readable"
  on public.replies for select
  using (moderation_status = 'visible');

-- Restrictive: Block enforcement
create policy "replies_block_restrictive"
  on public.replies
  as restrictive for select
  using (auth.uid() is null or not public.is_current_user_blocked(author_id));

-- Restrictive: Privacy enforcement (via post author's profile)
create policy "replies_privacy_restrictive"
  on public.replies
  as restrictive for select
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.posts p
      join public.profiles pr on pr.id = p.author_id
      where p.id = replies.post_id
        and (pr.is_private = false
             or exists (
               select 1 from public.follows f
               where f.follower_id = auth.uid()
                 and f.following_id = p.author_id
                 and f.status = 'accepted'
             ))
    )
  );

-- Insert: Own replies only, no enforced users, check block on post author
create policy "replies insert own"
  on public.replies for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
    and not exists (
      select 1 from public.posts p
      where p.id = post_id
        and public.is_blocked(auth.uid(), p.author_id)
    )
  );

-- Update: Own replies only
create policy "replies update own"
  on public.replies for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Delete: Own replies only
create policy "replies delete own"
  on public.replies for delete
  to authenticated
  using (auth.uid() = author_id);

-- ============================================================
-- 5. BLOCKS - Already defined in 0048, verify no conflicts
-- ============================================================
-- 0048_blocks_table.sql defines blocks policies. No changes needed here.

-- ============================================================
-- 6. Verification
-- ============================================================
do $$
declare
  v_policy_count int;
begin
  -- Verify posts policies
  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'posts';
  if v_policy_count < 7 then
    raise exception 'posts policies incomplete: found % expected >= 7', v_policy_count;
  end if;

  -- Verify profiles policies
  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles';
  if v_policy_count < 5 then
    raise exception 'profiles policies incomplete: found % expected >= 5', v_policy_count;
  end if;

  -- Verify follows policies
  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'follows';
  if v_policy_count < 3 then
    raise exception 'follows policies incomplete: found % expected >= 3', v_policy_count;
  end if;

  -- Verify replies policies
  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'replies';
  if v_policy_count < 6 then
    raise exception 'replies policies incomplete: found % expected >= 6', v_policy_count;
  end if;

  raise notice 'RLS policy composition verified for posts, profiles, follows, replies';
end;
$$;