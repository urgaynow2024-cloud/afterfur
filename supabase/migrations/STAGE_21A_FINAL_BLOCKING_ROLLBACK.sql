-- STAGE 21A FINAL BLOCKING ROLLBACK (corrected final)

-- Remove new restrictive policies
drop policy if exists "profiles_block_restrictive" on public.profiles;
drop policy if exists "posts_block_restrictive" on public.posts;

-- Remove new triggers
drop trigger if exists likes_block_check on public.likes;
drop trigger if exists reposts_block_check on public.reposts;
drop trigger if exists replies_block_check on public.replies;
drop trigger if exists notifications_block_check on public.notifications;

-- Remove new helper
drop function if exists public.is_current_user_blocked(uuid);
drop function if exists public.guard_like_block();
drop function if exists public.guard_repost_block();
drop function if exists public.guard_reply_block();
drop function if exists public.guard_notification_block();

-- Restore is_blocked grants
revoke all on function public.is_blocked(uuid, uuid) from service_role;
grant execute on function public.is_blocked(uuid, uuid) to public;

-- Restore original permissive policies
drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select using (true);

-- Restore original bidirectional policies
create policy "posts_block_bidirectional"
on public.posts
for select
using (not public.is_blocked(auth.uid(), author_id));

create policy "profiles_block_bidirectional"
on public.profiles
for select
using (
  id = auth.uid()
  or not public.is_blocked(auth.uid(), id)
);
