-- STAGE 21B PROFILE PRIVACY RECOVERY MIGRATION (idempotent, not executed)

alter table public.profiles
  add column if not exists is_private boolean not null default false;

alter table public.follows
  add column if not exists status text not null default 'accepted';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'follows_status_check'
  ) then
    alter table public.follows
      add constraint follows_status_check check (status in ('pending','accepted','rejected'));
  end if;
end;
$$;

create index if not exists follows_status_idx on public.follows(status);

-- Restore privacy restrictive policies (compose with Stage 21A)
drop policy if exists "profiles_privacy_restrictive" on public.profiles;
create policy "profiles_privacy_restrictive" on public.profiles
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
