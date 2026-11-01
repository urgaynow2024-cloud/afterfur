-- STAGE 21B PROFILE PRIVACY ROLLBACK
drop policy if exists "profiles_privacy_restrictive" on public.profiles;
drop policy if exists "posts_privacy_restrictive" on public.posts;
alter table public.follows drop constraint if exists follows_status_check;
alter table public.follows drop column if exists status;
alter table public.profiles drop column if exists is_private;
