-- Stage 44: Posts RLS hardening and NSFW posting enforcement
--
-- 1. Replace the permissive public-read policy on `posts` with restrictive
--    policies so that:
--    - SFW posts remain readable by everyone (including unauthenticated users)
--    - NSFW posts are readable only by authenticated users
--    - Unclassified (NULL) posts are not publicly readable
--
-- 2. Add WITH CHECK conditions on INSERT and UPDATE so that setting
--    classification = 'NSFW' requires the ad_creator badge, enforced at the
--    database layer. This closes the direct-Supabase write bypass where the
--    client writes to `posts` without going through /api/posts.
--
-- 3. Enforce active bans/suspensions from user_enforcements on post INSERT
--    and UPDATE so banned/suspended users cannot create or modify posts.
--
-- 4. Add a supporting index on posts(classification).
--
-- Forward-only: does not delete data, does not modify existing rows.

-- ---------------------------------------------------------------------------
-- 0. Helper: check whether a user has an active ban or suspension.
-- ---------------------------------------------------------------------------
create or replace function public.is_user_enforced(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if p_user_id is null then
    return false;
  end if;
  return exists (
    select 1 from public.user_enforcements
    where user_id = p_user_id
      and type in ('ban', 'suspension')
      and (ends_at is null or ends_at > now())
  );
end;
$function$;

revoke all on function public.is_user_enforced(uuid) from public, anon;
grant execute on function public.is_user_enforced(uuid) to authenticated;

-- The posts API route (service-role client) calls has_ad_badge to gate NSFW
-- posts. Grant execute to service_role so server-side authorization works.
grant execute on function public.has_ad_badge(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 1. Drop the unrestricted permissive public-read policy.
-- ---------------------------------------------------------------------------
drop policy if exists "posts readable" on public.posts;

-- ---------------------------------------------------------------------------
-- 2. Permissive read policies: SFW for everyone, NSFW only for authenticated.
-- ---------------------------------------------------------------------------
create policy "posts_read_sfw_public" on public.posts
  for select
  using (classification = 'SFW');

create policy "posts_read_nsfw_authenticated" on public.posts
  for select
  to authenticated
  using (classification = 'NSFW' AND auth.uid() IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. Restrictive read policies (unchanged, kept for block + privacy).
--    These are AND'd with the permissive policies above.
-- ---------------------------------------------------------------------------
drop policy if exists "posts_block_restrictive" on public.posts;
create policy "posts_block_restrictive" on public.posts
  as restrictive for select
  using (auth.uid() is null or not public.is_current_user_blocked(author_id));

drop policy if exists "posts_privacy_restrictive" on public.posts;
create policy "posts_privacy_restrictive" on public.posts
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

-- ---------------------------------------------------------------------------
-- 4. Insert policy: ownership + badge enforcement for NSFW + enforcement check.
-- ---------------------------------------------------------------------------
drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
    and (classification <> 'NSFW' or public.has_ad_badge(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 5. Update policy: ownership + badge enforcement for NSFW + enforcement check.
-- ---------------------------------------------------------------------------
drop policy if exists "posts update own" on public.posts;
create policy "posts update own" on public.posts
  for update
  to authenticated
  using (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
  )
  with check (
    auth.uid() = author_id
    and (classification <> 'NSFW' or public.has_ad_badge(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 6. Delete policy: ownership (unchanged).
-- ---------------------------------------------------------------------------
drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own" on public.posts
  for delete
  to authenticated
  using (auth.uid() = author_id);

-- ---------------------------------------------------------------------------
-- 7. Supporting index for NSFW lookups.
-- ---------------------------------------------------------------------------
create index if not exists posts_classification_idx on public.posts(classification);

comment on policy "posts_read_sfw_public" on public.posts is
  'SFW posts are publicly readable (subject to block and privacy restrictive policies).';
comment on policy "posts_read_nsfw_authenticated" on public.posts is
  'NSFW posts are readable only by authenticated users (subject to block and privacy restrictive policies).';
comment on policy "posts insert own" on public.posts is
  'Insert own posts; NSFW classification requires ad_creator badge; enforced users cannot insert.';
comment on policy "posts update own" on public.posts is
  'Update own posts; changing to NSFW requires ad_creator badge; enforced users cannot update.';
