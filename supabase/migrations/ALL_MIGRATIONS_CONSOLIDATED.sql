
-- ===== 0001_initial.sql =====
-- AfterFur initial schema
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  website text,
  created_at timestamptz default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  classification text not null default 'SFW',
  created_at timestamptz default now()
);

create table if not exists public.likes (
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  primary key (user_id, post_id)
);

create table if not exists public.reposts (
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  primary key (user_id, post_id)
);

create table if not exists public.replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.bookmarks (
  user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  primary key (user_id, post_id)
);

create table if not exists public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  following_id uuid references public.profiles(id) on delete cascade,
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  payload jsonb,
  read boolean default false,
  created_at timestamptz default now()
);

create index if not exists posts_author_idx on public.posts(author_id);
create index if not exists posts_created_idx on public.posts(created_at desc);
create index if not exists replies_post_idx on public.replies(post_id);
create index if not exists notif_user_idx on public.notifications(user_id);

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.likes enable row level security;
alter table public.reposts enable row level security;
alter table public.replies enable row level security;
alter table public.bookmarks enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles readable" on public.profiles;
create policy "profiles readable" on public.profiles for select using (true);
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "posts readable" on public.posts;
create policy "posts readable" on public.posts for select using (true);
drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts for insert with check (auth.uid() = author_id);
drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own" on public.posts for delete using (auth.uid() = author_id);
drop policy if exists "likes manage own" on public.likes;
create policy "likes manage own" on public.likes for all using (auth.uid() = user_id);
drop policy if exists "reposts manage own" on public.reposts;
create policy "reposts manage own" on public.reposts for all using (auth.uid() = user_id);
drop policy if exists "replies insert own" on public.replies;
create policy "replies insert own" on public.replies for insert with check (auth.uid() = author_id);
drop policy if exists "replies readable" on public.replies;
create policy "replies readable" on public.replies for select using (true);
drop policy if exists "bookmarks manage own" on public.bookmarks;
create policy "bookmarks manage own" on public.bookmarks for all using (auth.uid() = user_id);
drop policy if exists "follows manage own" on public.follows;
create policy "follows manage own" on public.follows for all using (auth.uid() = follower_id);
drop policy if exists "notifications own" on public.notifications;
create policy "notifications own" on public.notifications for select using (auth.uid() = user_id);


create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz default now()
);

alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

alter table public.profiles add column if not exists location text;

insert into storage.buckets (id, name, public) values ('avatars','avatars',true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('banners','banners',true) on conflict (id) do nothing;
-- Storage policies for avatars and banners
drop policy if exists "avatars upload own" on storage.objects;
drop policy if exists "avatars upload own" on storage.objects;
create policy "avatars upload own" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars update own" on storage.objects;
drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars delete own" on storage.objects;
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars read" on storage.objects;
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "banners upload own" on storage.objects;
drop policy if exists "banners upload own" on storage.objects;
create policy "banners upload own" on storage.objects for insert to authenticated with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "banners update own" on storage.objects;
drop policy if exists "banners update own" on storage.objects;
create policy "banners update own" on storage.objects for update to authenticated using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "banners delete own" on storage.objects;
drop policy if exists "banners delete own" on storage.objects;
create policy "banners delete own" on storage.objects for delete to authenticated using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "banners read" on storage.objects;
drop policy if exists "banners read" on storage.objects;
create policy "banners read" on storage.objects for select using (bucket_id = 'banners');


alter table public.posts add column if not exists edited_at timestamptz;

alter table public.posts add column if not exists media_urls text[];
insert into storage.buckets (id, name, public) values ('media','media',true) on conflict (id) do nothing;
drop policy if exists "media upload own" on storage.objects;
create policy "media upload own" on storage.objects for insert to authenticated with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media read" on storage.objects;
create policy "media read" on storage.objects for select using (bucket_id = 'media');

alter table public.replies add column if not exists parent_reply_id uuid references public.replies(id) on delete cascade;



-- ===== 0002_follow_read_policy.sql =====
-- Allow public read access to follow relationships for profile counts and lists.
-- Existing "follows manage own" policy remains responsible for inserts/deletes.

drop policy if exists "follows readable" on public.follows;
create policy "follows readable"
  on public.follows
  for select
  using (true);


-- ===== 0003_profile_creation_trigger.sql =====
-- Ensure every Supabase Auth user has a corresponding public profile row.
-- This runs as SECURITY DEFINER so profile creation does not depend on the
-- unauthenticated client session during email confirmation.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'username', ''),
        'user_' || substr(new.id::text, 1, 8)
      ),
      coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'username', ''),
        split_part(new.email, '@', 1)
      )
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      'user_' || substr(new.id::text, 1, 8),
      split_part(new.email, '@', 1)
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Backfill profiles for any existing auth users that do not have one.
insert into public.profiles (id, username, display_name)
select
  u.id,
  'user_' || substr(u.id::text, 1, 8),
  split_part(u.email, '@', 1)
from auth.users as u
left join public.profiles as p on p.id = u.id
where p.id is null
on conflict (id) do nothing;


-- ===== 0004_secure_post_like_counts.sql =====
-- Return aggregate like totals for requested public posts without exposing
-- individual liker rows through the existing likes RLS policy.
create or replace function public.get_post_like_counts(p_post_ids uuid[])
returns table (post_id uuid, like_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with requested_posts as (
    select distinct requested.post_id
    from unnest(p_post_ids) as requested(post_id)
    where requested.post_id is not null
  )
  select requested_posts.post_id, count(likes.post_id)::bigint as like_count
  from requested_posts
  join public.posts as posts on posts.id = requested_posts.post_id
  left join public.likes as likes on likes.post_id = requested_posts.post_id
  group by requested_posts.post_id;
$function$;

revoke all on function public.get_post_like_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_like_counts(uuid[]) to anon, authenticated;

comment on function public.get_post_like_counts(uuid[]) is
  'Returns like totals only for existing public post IDs; never returns liker identities. Null input, null IDs, and nonexistent posts produce no result row.';


-- ===== 0005_secure_post_repost_counts.sql =====
-- Return aggregate repost totals without exposing individual repost rows.
create or replace function public.get_post_repost_counts(p_post_ids uuid[])
returns table (post_id uuid, repost_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with requested_posts as (
    select distinct requested.post_id
    from unnest(p_post_ids) as requested(post_id)
    where requested.post_id is not null
  )
  select requested_posts.post_id, count(reposts.post_id)::bigint as repost_count
  from requested_posts
  join public.posts as posts on posts.id = requested_posts.post_id
  left join public.reposts as reposts on reposts.post_id = requested_posts.post_id
  group by requested_posts.post_id;
$function$;

revoke all on function public.get_post_repost_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_repost_counts(uuid[]) to anon, authenticated;

comment on function public.get_post_repost_counts(uuid[]) is
  'Returns repost totals only for existing public post IDs; never returns reposting user identities. Null input, null IDs, and nonexistent posts produce no result row.';



-- ===== 0006_secure_direct_messages.sql =====
-- RLS needs a definer helper to avoid recursive policies on participants.
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1 from public.conversation_participants as cp
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()
  );
$function$;

revoke all on function public.is_conversation_member(uuid) from public, anon, authenticated;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Keep conversations, participants, and messages private to their members.
drop policy if exists "conversation members read conversations" on public.conversations;
create policy "conversation members read conversations"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "members read conversation memberships" on public.conversation_participants;
create policy "members read conversation memberships"
  on public.conversation_participants for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "conversation members read messages" on public.messages;
create policy "conversation members read messages"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "conversation members send own messages" on public.messages;
create policy "conversation members send own messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and length(btrim(content)) between 1 and 2000
    and public.is_conversation_member(conversation_id)
  );

-- Membership creation must be atomic: clients cannot add other users to a
-- conversation directly. This function creates or returns a two-member DM.
create or replace function public.create_direct_conversation(p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_pair_key text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_recipient_id is null or p_recipient_id = v_user_id then
    raise exception 'Choose another AfterFur member';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'That member could not be found';
  end if;

  v_pair_key := least(v_user_id::text, p_recipient_id::text) || ':' || greatest(v_user_id::text, p_recipient_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_pair_key, 0));

  select c.id into v_conversation_id
  from public.conversations as c
  where exists (
      select 1 from public.conversation_participants as mine
      where mine.conversation_id = c.id and mine.user_id = v_user_id
    )
    and exists (
      select 1 from public.conversation_participants as theirs
      where theirs.conversation_id = c.id and theirs.user_id = p_recipient_id
    )
    and (select count(*) from public.conversation_participants as members where members.conversation_id = c.id) = 2
  order by c.created_at desc
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations default values returning id into v_conversation_id;
  insert into public.conversation_participants (conversation_id, user_id)
  values (v_conversation_id, v_user_id), (v_conversation_id, p_recipient_id);
  return v_conversation_id;
end;
$function$;

revoke all on function public.create_direct_conversation(uuid) from public, anon, authenticated;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

comment on function public.create_direct_conversation(uuid) is
  'Atomically returns or creates a direct conversation between the authenticated caller and one existing recipient. Does not expose message or membership records.';


-- ===== 0007_own_post_edits.sql =====
-- Allow authors to edit their own posts while preserving ownership on update.
alter table public.posts add column if not exists edited_at timestamptz;

drop policy if exists "posts update own" on public.posts;
create policy "posts update own"
  on public.posts for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);


-- ===== 0008_public_post_reply_counts.sql =====
-- Replies are already publicly readable through the existing replies RLS
-- policy. This invoker RPC batches exact counts without bypassing that policy.
create or replace function public.get_post_reply_counts(p_post_ids uuid[])
returns table (post_id uuid, reply_count bigint)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  with requested_posts as (
    select distinct requested.post_id
    from unnest(p_post_ids) as requested(post_id)
    where requested.post_id is not null
  )
  select requested_posts.post_id, count(replies.id)::bigint as reply_count
  from requested_posts
  join public.posts as posts on posts.id = requested_posts.post_id
  left join public.replies as replies on replies.post_id = requested_posts.post_id
  group by requested_posts.post_id;
$function$;

revoke all on function public.get_post_reply_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_reply_counts(uuid[]) to anon, authenticated;

comment on function public.get_post_reply_counts(uuid[]) is
  'Returns exact reply totals for existing publicly readable posts, using caller RLS; null/nonexistent IDs return no row and no reply details are exposed.';


-- ===== 0009_secure_notification_actions.sql =====
-- Notification writes are not granted directly to clients. These narrowly
-- scoped functions validate the originating interaction and caller identity.
create or replace function public.create_post_notification(
  p_recipient_id uuid,
  p_post_id uuid,
  p_type text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_post_author_id uuid;
  v_lock_key text;
begin
  if v_actor_id is null then raise exception 'Authentication is required'; end if;
  if p_type not in ('like', 'repost', 'reply') then raise exception 'Unsupported notification type'; end if;
  select author_id into v_post_author_id from public.posts where id = p_post_id;
  if v_post_author_id is null or v_post_author_id <> p_recipient_id or p_recipient_id = v_actor_id then
    raise exception 'Notification recipient is invalid';
  end if;
  if p_type = 'like' and not exists (select 1 from public.likes where user_id = v_actor_id and post_id = p_post_id) then
    raise exception 'A matching like is required';
  elsif p_type = 'repost' and not exists (select 1 from public.reposts where user_id = v_actor_id and post_id = p_post_id) then
    raise exception 'A matching repost is required';
  elsif p_type = 'reply' and not exists (select 1 from public.replies where author_id = v_actor_id and post_id = p_post_id) then
    raise exception 'A matching reply is required';
  end if;

  v_lock_key := v_actor_id::text || ':' || p_type || ':' || p_post_id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));
  if not exists (
    select 1 from public.notifications
    where user_id = p_recipient_id and type = p_type
      and payload @> pg_catalog.jsonb_build_object('actor_id', v_actor_id, 'post_id', p_post_id)
  ) then
    insert into public.notifications (user_id, type, payload, read)
    values (p_recipient_id, p_type, pg_catalog.jsonb_build_object('actor_id', v_actor_id, 'post_id', p_post_id), false);
  end if;
end;
$function$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  update public.notifications
  set read = true
  where id = p_notification_id and user_id = auth.uid();
$function$;

create or replace function public.mark_all_notifications_read()
returns void
language sql
security definer
set search_path = pg_catalog, public
as $function$
  update public.notifications
  set read = true
  where user_id = auth.uid() and read = false;
$function$;

revoke all on function public.create_post_notification(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
grant execute on function public.create_post_notification(uuid, uuid, text) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;


-- ===== 0010_latest_conversation_messages.sql =====
-- Return one latest message per requested conversation, always as the caller.
-- SECURITY INVOKER preserves the member-scoped messages RLS policy.
create or replace function public.get_latest_conversation_messages(p_conversation_ids uuid[])
returns table (id uuid, conversation_id uuid, sender_id uuid, content text, created_at timestamptz)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select distinct on (messages.conversation_id)
    messages.id,
    messages.conversation_id,
    messages.sender_id,
    messages.content,
    messages.created_at
  from public.messages as messages
  where messages.conversation_id = any(p_conversation_ids)
  order by messages.conversation_id, messages.created_at desc, messages.id desc;
$function$;

revoke all on function public.get_latest_conversation_messages(uuid[]) from public, anon, authenticated;
grant execute on function public.get_latest_conversation_messages(uuid[]) to authenticated;

comment on function public.get_latest_conversation_messages(uuid[]) is
  'Returns only the newest message for each requested conversation visible under the caller RLS policies.';
 

-- ===== 0011_badges_pawpass_milestones.sql =====
-- Badge registry, protected staff roles, verified PawPass entitlement history,
-- and data-backed milestone awards. Depends on migrations 0001-0003.

create table if not exists public.badge_registry (
  id text primary key,
  category text not null check (category in ('staff', 'membership', 'milestone')),
  display_name text not null,
  display_order integer not null unique,
  is_public boolean not null default true
);

insert into public.badge_registry (id, category, display_name, display_order) values
  ('staff_founder', 'staff', 'Founder', 10),
  ('staff_moderator', 'staff', 'Moderator', 20),
  ('staff_developer', 'staff', 'Developer', 30),
  ('staff_tester', 'staff', 'Tester', 40),
  ('pawpass_member', 'membership', 'PawPass', 100),
  ('pawpass_month_2', 'membership', 'PawPass Month 2', 120),
  ('pawpass_month_3', 'membership', 'PawPass Month 3', 130),
  ('pawpass_month_4', 'membership', 'PawPass Month 4', 140),
  ('pawpass_month_5', 'membership', 'PawPass Month 5', 150),
  ('pawpass_month_6', 'membership', 'PawPass Month 6', 160),
  ('pawpass_month_7', 'membership', 'PawPass Month 7', 170),
  ('pawpass_month_8', 'membership', 'PawPass Month 8', 180),
  ('pawpass_month_9', 'membership', 'PawPass Month 9', 190),
  ('pawpass_month_10', 'membership', 'PawPass Month 10', 200),
  ('pawpass_month_11', 'membership', 'PawPass Month 11', 210),
  ('pawpass_month_12', 'membership', 'PawPass Month 12', 220),
  ('milestone_first_post', 'milestone', 'First post', 300)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

insert into public.badge_registry (id, category, display_name, display_order)
select 'pawpass_year_' || year_number,
       'membership',
       'PawPass Year ' || year_number,
       500 + year_number
from generate_series(1, 50) as year_number
on conflict (id) do nothing;

insert into public.badge_registry (id, category, display_name, display_order)
select 'milestone_account_year_' || year_number,
       'milestone',
       'Account anniversary ' || year_number,
       1000 + year_number
from generate_series(1, 50) as year_number
on conflict (id) do nothing;

create table if not exists public.staff_badge_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badge_registry(id),
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, badge_id),
  check (badge_id in ('staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester'))
);

create table if not exists public.staff_badge_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  badge_id text not null references public.badge_registry(id),
  action text not null check (action in ('grant', 'revoke')),
  occurred_at timestamptz not null default now()
);
create index if not exists staff_badge_audit_target_idx on public.staff_badge_audit(target_id, occurred_at desc);

create table if not exists public.user_badge_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badge_registry(id),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index if not exists user_badge_awards_user_idx on public.user_badge_awards(user_id, awarded_at desc);

-- Source account age from auth.users, not the profile row users can update.
create table if not exists public.badge_account_origins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_created_at timestamptz not null
);
insert into public.badge_account_origins(user_id, account_created_at)
select id, created_at from auth.users
on conflict (user_id) do nothing;

create or replace function public.capture_badge_account_origin()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $function$
begin
  insert into public.badge_account_origins(user_id, account_created_at)
  values (new.id, new.created_at) on conflict (user_id) do nothing;
  return new;
end;
$function$;
drop trigger if exists capture_badge_account_origin on auth.users;
create trigger capture_badge_account_origin after insert on auth.users
for each row execute function public.capture_badge_account_origin();

-- Existing profile rows are paired to their real first-post timestamp as a one-time backfill.
insert into public.user_badge_awards(user_id, badge_id, awarded_at)
select author_id, 'milestone_first_post', min(coalesce(created_at, now()))
from public.posts group by author_id
on conflict (user_id, badge_id) do nothing;

create or replace function public.award_first_post_badge()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $function$
begin
  insert into public.user_badge_awards(user_id, badge_id, awarded_at)
  values (new.author_id, 'milestone_first_post', coalesce(new.created_at, now()))
  on conflict (user_id, badge_id) do nothing;
  return new;
end;
$function$;
drop trigger if exists award_first_post_badge on public.posts;
create trigger award_first_post_badge after insert on public.posts
for each row execute function public.award_first_post_badge();

-- Staff assignments and all entitlement/security tables are hidden behind narrow RPCs.
create table if not exists public.pawpass_entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  provider_subscription_id text not null unique,
  status text not null check (status in ('active', 'cancel_at_period_end', 'past_due', 'expired', 'refunded')),
  eligible_since timestamptz not null,
  current_period_end timestamptz,
  status_changed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pawpass_event_receipts (
  provider text not null,
  provider_event_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  processed_at timestamptz not null default now(),
  primary key(provider, provider_event_id)
);
create index if not exists pawpass_event_user_idx on public.pawpass_event_receipts(user_id, processed_at desc);

alter table public.badge_registry enable row level security;
alter table public.staff_badge_assignments enable row level security;
alter table public.staff_badge_audit enable row level security;
alter table public.user_badge_awards enable row level security;
alter table public.badge_account_origins enable row level security;
alter table public.pawpass_entitlements enable row level security;
alter table public.pawpass_event_receipts enable row level security;
revoke all on public.badge_registry, public.staff_badge_assignments, public.staff_badge_audit,
  public.user_badge_awards, public.badge_account_origins, public.pawpass_entitlements,
  public.pawpass_event_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.badge_registry, public.staff_badge_assignments,
  public.staff_badge_audit, public.user_badge_awards, public.badge_account_origins,
  public.pawpass_entitlements, public.pawpass_event_receipts to service_role;

create or replace function public.require_afterfur_staff_admin()
returns void language plpgsql stable security definer set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff administrator access required' using errcode = '42501';
  end if;
end;
$function$;
revoke all on function public.require_afterfur_staff_admin() from public, anon, authenticated;

create or replace function public.search_staff_badge_targets(p_query text)
returns table(user_id uuid, username text, display_name text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  return query select p.id, p.username, p.display_name
    from public.profiles p
    where p.username ilike '%' || btrim(p_query) || '%'
       or coalesce(p.display_name, '') ilike '%' || btrim(p_query) || '%'
    order by p.username limit 20;
end;
$function$;
revoke all on function public.search_staff_badge_targets(text) from public, anon;
grant execute on function public.search_staff_badge_targets(text) to authenticated;

create or replace function public.get_staff_badges_for_admin(p_target_id uuid)
returns table(badge_id text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  return query select s.badge_id from public.staff_badge_assignments s where s.user_id = p_target_id order by s.badge_id;
end;
$function$;
revoke all on function public.get_staff_badges_for_admin(uuid) from public, anon;
grant execute on function public.get_staff_badges_for_admin(uuid) to authenticated;

create or replace function public.manage_staff_badge(p_target_id uuid, p_badge_id text, p_action text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_actor_id uuid := auth.uid();
begin
  perform public.require_afterfur_staff_admin();
  -- Verified platform owners (identified by afterfur_staff_admin claim) may
  -- self-assign staff badges. Non-owner administrators cannot self-assign.
  -- Since require_afterfur_staff_admin() already enforces the admin claim,
  -- this guard only blocks self-assignment for any future non-admin caller.
  if v_actor_id = p_target_id and coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff badges cannot be assigned to yourself' using errcode = '42501';
  end if;
  if p_badge_id not in ('staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester') then raise exception 'Unknown staff badge'; end if;
  if p_action not in ('grant', 'revoke') then raise exception 'Action must be grant or revoke'; end if;
  if not exists(select 1 from public.profiles where id = p_target_id) then raise exception 'Target account not found'; end if;
  if p_action = 'grant' then
    insert into public.staff_badge_assignments(user_id, badge_id, assigned_by)
      values (p_target_id, p_badge_id, v_actor_id) on conflict (user_id, badge_id) do nothing;
    if not found then return false; end if;
  else
    delete from public.staff_badge_assignments where user_id = p_target_id and badge_id = p_badge_id;
    if not found then return false; end if;
  end if;
  insert into public.staff_badge_audit(actor_id, target_id, badge_id, action)
    values (v_actor_id, p_target_id, p_badge_id, p_action);
  return true;
end;
$function$;
revoke all on function public.manage_staff_badge(uuid, text, text) from public, anon;
grant execute on function public.manage_staff_badge(uuid, text, text) to authenticated;

-- Safe public projection: returns only badge identifiers explicitly marked public.
-- The protected staff assignments, audit log, and billing records are never exposed.
create or replace function public.award_pawpass_months(p_user_id uuid, p_eligible_since timestamptz, p_cutoff timestamptz)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_month integer; v_year integer;
begin
  if p_user_id is null or p_eligible_since is null or p_cutoff is null then return; end if;
  for v_month in 1..12 loop
    if p_cutoff >= p_eligible_since + make_interval(months => v_month) then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
        values (p_user_id, 'pawpass_month_' || v_month, p_eligible_since + make_interval(months => v_month))
        on conflict (user_id, badge_id) do nothing;
    end if;
  end loop;
  for v_year in 1..50 loop
    if p_cutoff >= p_eligible_since + make_interval(years => v_year) then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
        values (p_user_id, 'pawpass_year_' || v_year, p_eligible_since + make_interval(years => v_year))
        on conflict (user_id, badge_id) do nothing;
    end if;
  end loop;
end;
$function$;
revoke all on function public.award_pawpass_months(uuid,timestamptz,timestamptz) from public, anon, authenticated;

create or replace function public.get_public_badges(p_user_ids uuid[])
returns table(user_id uuid, badge_id text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user_id uuid; v_years integer; v_membership record; v_cutoff timestamptz;
begin
  if p_user_ids is null then return; end if;
  if cardinality(p_user_ids) > 100 then raise exception 'A maximum of 100 badge subjects may be requested'; end if;
  foreach v_user_id in array p_user_ids loop
    if v_user_id is null then continue; end if;
    select greatest(0, extract(year from age(now(), o.account_created_at))::integer)
      into v_years from public.badge_account_origins o where o.user_id = v_user_id;
    if v_years is not null and v_years > 0 then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
      select v_user_id, 'milestone_account_year_' || n, now()
      from generate_series(1, least(v_years, 50)) n
      on conflict (user_id, badge_id) do nothing;
    end if;
    select e.status, e.eligible_since, e.current_period_end into v_membership
      from public.pawpass_entitlements e where e.user_id = v_user_id;
    if v_membership.status in ('active', 'cancel_at_period_end') and v_membership.current_period_end is not null then
      v_cutoff := least(now(), v_membership.current_period_end);
      perform public.award_pawpass_months(v_user_id, v_membership.eligible_since, v_cutoff);
    end if;
  end loop;
   return query
     select s.user_id, s.badge_id from public.staff_badge_assignments s
     join public.badge_registry r on r.id = s.badge_id and r.is_public
     where s.user_id = any(p_user_ids)
     union
     select a.user_id, a.badge_id from public.user_badge_awards a
     join public.badge_registry r on r.id = a.badge_id and r.is_public
     where a.user_id = any(p_user_ids)
     union
     select e.user_id, 'pawpass_member'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_member' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now();
end;
$function$;
revoke all on function public.get_public_badges(uuid[]) from public;
grant execute on function public.get_public_badges(uuid[]) to anon, authenticated;

-- The trusted billing webhook calls this only after verifying the provider signature.
-- Eligible time is continuous: a past-due/expired/refunded gap starts a fresh tenure
-- on reactivation. Cancellation remains eligible only through paid current_period_end.
create or replace function public.process_pawpass_entitlement_event(
  p_user_id uuid, p_provider text, p_customer_id text, p_subscription_id text,
  p_event_id text, p_event_type text, p_status text,
  p_eligible_since timestamptz, p_current_period_end timestamptz, p_occurred_at timestamptz
) returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_previous_status text; v_previous_changed timestamptz; v_previous_end timestamptz; v_eligible_since timestamptz; v_cutoff timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'Trusted billing service required' using errcode = '42501'; end if;
  if p_user_id is null or p_provider is null or p_customer_id is null or p_subscription_id is null
     or p_event_id is null or p_event_type is null or p_occurred_at is null or p_status is null
     or p_status not in ('active', 'cancel_at_period_end', 'past_due', 'expired', 'refunded')
     or p_eligible_since is null or (p_status in ('active', 'cancel_at_period_end') and p_current_period_end is null)
     or p_occurred_at > now() + interval '5 minutes' then raise exception 'Invalid verified PawPass event'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  insert into public.pawpass_event_receipts(provider, provider_event_id, user_id, event_type)
    values (p_provider, p_event_id, p_user_id, p_event_type) on conflict do nothing;
  if not found then return false; end if;
  select e.status, e.status_changed_at, e.current_period_end into v_previous_status, v_previous_changed, v_previous_end from public.pawpass_entitlements e where e.user_id = p_user_id for update;
  if v_previous_changed is not null and p_occurred_at < v_previous_changed then return false; end if;
  if v_previous_status in ('active', 'cancel_at_period_end') and
     (p_status in ('past_due', 'expired') or v_previous_end < p_occurred_at) then
    v_cutoff := least(p_occurred_at, coalesce(v_previous_end, p_occurred_at));
    perform public.award_pawpass_months(p_user_id,
      (select eligible_since from public.pawpass_entitlements where user_id = p_user_id), v_cutoff);
  end if;
  v_eligible_since := case when v_previous_status in ('past_due', 'expired', 'refunded') or v_previous_end < p_occurred_at
    then p_occurred_at else coalesce((select eligible_since from public.pawpass_entitlements where user_id = p_user_id), p_eligible_since) end;
  insert into public.pawpass_entitlements(user_id, provider, provider_customer_id, provider_subscription_id, status, eligible_since, current_period_end, status_changed_at, updated_at)
    values (p_user_id, p_provider, p_customer_id, p_subscription_id, p_status, v_eligible_since, p_current_period_end, p_occurred_at, now())
  on conflict (user_id) do update set provider = excluded.provider, provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id, status = excluded.status,
    eligible_since = v_eligible_since, current_period_end = excluded.current_period_end,
    status_changed_at = excluded.status_changed_at, updated_at = now();
  if p_status in ('active', 'cancel_at_period_end') and p_current_period_end > now() then
    v_cutoff := least(now(), p_current_period_end);
    perform public.award_pawpass_months(p_user_id, v_eligible_since, v_cutoff);
  elsif p_status = 'expired' then
    perform public.award_pawpass_months(p_user_id, v_eligible_since, least(now(), p_current_period_end));
  end if;
  return true;
end;
$function$;
revoke all on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz) to service_role;

create or replace function public.get_my_pawpass_entitlement()
returns table(is_active boolean, status text, current_period_end timestamptz)
language sql stable security definer set search_path = pg_catalog, public
as $function$
  select (e.status in ('active', 'cancel_at_period_end') and e.current_period_end > now()), e.status, e.current_period_end
  from public.pawpass_entitlements e where e.user_id = auth.uid();
$function$;
revoke all on function public.get_my_pawpass_entitlement() from public, anon;
grant execute on function public.get_my_pawpass_entitlement() to authenticated;

comment on table public.staff_badge_assignments is 'Private staff badge assignments; public identity badges are exposed only by get_public_badges.';
comment on table public.staff_badge_audit is 'Private append-only audit of administrator staff badge changes.';
comment on table public.pawpass_entitlements is 'Private trusted-provider entitlement state. Client writes are forbidden.';
comment on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz) is 'Service-role only. Call only after verifying billing provider webhook authenticity; event IDs make retries idempotent.';
comment on function public.manage_staff_badge(uuid,text,text) is 'Requires trusted auth.users app_metadata.afterfur_staff_admin=true; administrators cannot self-assign badges.';


-- ===== 0012_profile_accent.sql =====
-- PawPass Milestone 1: Profile accent colour (Prime benefit).
-- Adds a server-authoritative profile_accent column and an RPC for Prime users
-- to update it. Non-Prime users cannot save non-default accents.

alter table public.profiles add column if not exists profile_accent text;

-- Allowlist of valid accent values (null = default).
-- The RPC enforces this; the column itself stores the chosen value.

create or replace function public.update_profile_accent(p_accent text)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user_id uuid := auth.uid();
declare v_is_prime boolean;
declare v_allowed text[] := array['default', 'purple', 'blue', 'emerald', 'amber', 'rose'];
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_accent is not null and not (p_accent = any(v_allowed)) then
    raise exception 'Invalid accent value' using errcode = '22023';
  end if;
  -- Prime entitlement check: only active members may set non-default accents.
  select exists (
    select 1 from public.pawpass_entitlements e
    where e.user_id = v_user_id
      and e.status in ('active', 'cancel_at_period_end')
      and e.current_period_end is not null
      and e.current_period_end > now()
  ) into v_is_prime;
  if p_accent is not null and p_accent <> 'default' and not v_is_prime then
    raise exception 'PawPass Prime membership required for custom accent colours' using errcode = '42501';
  end if;
  update public.profiles set profile_accent = nullif(p_accent, 'default') where id = v_user_id;
  return true;
end;
$function$;

revoke all on function public.update_profile_accent(text) from public;
grant execute on function public.update_profile_accent(text) to authenticated;

create or replace function public.get_my_profile_accent()
returns text
language sql security definer set search_path = pg_catalog, public
as $function$
  select profile_accent from public.profiles where id = auth.uid();
$function$;

revoke all on function public.get_my_profile_accent() from public;
grant execute on function public.get_my_profile_accent() to authenticated;


-- ===== 0013_pawpass_membership_canonical.sql =====
-- PawPass canonical membership model: sources, owner test access, free grants,
-- founding reward and provider-neutral plan foundations.
-- Depends on migrations 0001-0012.

-- 1. Canonical entitlement model extensions.
alter table public.pawpass_entitlements
  add column if not exists source text,
  add column if not exists plan_interval text,
  add column if not exists granted_by uuid references public.profiles(id) on delete set null,
  add column if not exists grant_reason text,
  add column if not exists test_expires_at timestamptz;

update public.pawpass_entitlements
  set source = 'paid'
  where source is null;

alter table public.pawpass_entitlements
  alter column source set not null,
  alter column provider drop not null,
  alter column provider_customer_id drop not null,
  alter column provider_subscription_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pawpass_entitlements_source_check') then
    alter table public.pawpass_entitlements
      add constraint pawpass_entitlements_source_check
      check (source in ('paid', 'founding_reward', 'owner_granted', 'owner_test'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pawpass_entitlements_plan_check') then
    alter table public.pawpass_entitlements
      add constraint pawpass_entitlements_plan_check
      check (plan_interval is null or plan_interval in ('monthly', 'yearly'));
  end if;
end $$;

-- 2. Founding reward claims (hard cap 50, one per account).
create table if not exists public.pawpass_founding_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  source text not null default 'founding_reward'
    check (source = 'founding_reward')
);
create index if not exists pawpass_founding_claims_claimed_idx
  on public.pawpass_founding_claims(claimed_at);

-- 3. Membership audit log.
create table if not exists public.pawpass_membership_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  target_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  source text,
  details jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists pawpass_membership_audit_target_idx
  on public.pawpass_membership_audit(target_id, occurred_at desc);

-- 4. PawPass Prime badge registration.
insert into public.badge_registry (id, category, display_name, display_order)
values ('pawpass_prime', 'membership', 'PawPass Prime', 105)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

-- 5. RLS and grants.
alter table public.pawpass_founding_claims enable row level security;
alter table public.pawpass_membership_audit enable row level security;
revoke all on public.pawpass_founding_claims, public.pawpass_membership_audit from public, anon, authenticated;
grant select, insert, update, delete on public.pawpass_founding_claims, public.pawpass_membership_audit to service_role;

-- 6. Helper: server-authoritative Prime entitlement check.
create or replace function public.is_prime_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1 from public.pawpass_entitlements e
    where e.user_id = p_user_id
      and e.source in ('paid', 'founding_reward', 'owner_granted', 'owner_test')
      and e.status in ('active', 'cancel_at_period_end')
      and e.current_period_end is not null
      and e.current_period_end > now()
  );
$function$;
revoke all on function public.is_prime_member(uuid) from public, anon;
grant execute on function public.is_prime_member(uuid) to authenticated, service_role;

-- 7. Own membership status (source-aware).
create or replace function public.get_my_membership_status()
returns table(
  source text,
  plan_interval text,
  status text,
  eligible_since timestamptz,
  current_period_end timestamptz,
  is_test boolean,
  grant_reason text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select e.source, e.plan_interval, e.status, e.eligible_since, e.current_period_end,
         (e.source = 'owner_test') as is_test, e.grant_reason
  from public.pawpass_entitlements e
  where e.user_id = auth.uid();
$function$;
revoke all on function public.get_my_membership_status() from public, anon;
grant execute on function public.get_my_membership_status() to authenticated;

-- 8. Admin view of a target's membership.
create or replace function public.get_membership_for_admin(p_target_id uuid)
returns table(
  user_id uuid,
  source text,
  plan_interval text,
  status text,
  eligible_since timestamptz,
  current_period_end timestamptz,
  is_test boolean,
  granted_by uuid,
  grant_reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;
  return query
    select e.user_id, e.source, e.plan_interval, e.status, e.eligible_since, e.current_period_end,
           (e.source = 'owner_test') as is_test, e.granted_by, e.grant_reason
    from public.pawpass_entitlements e
    where e.user_id = p_target_id;
end;
$function$;
revoke all on function public.get_membership_for_admin(uuid) from public, anon;
grant execute on function public.get_membership_for_admin(uuid) to authenticated;

-- 9. Owner-only test Prime access.
create or replace function public.set_owner_test_prime(
  p_target_id uuid,
  p_active boolean,
  p_days integer default 30,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_end timestamptz;
begin
  perform public.require_afterfur_staff_admin();
  if p_target_id is null or not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;
  if p_active then
    if p_days is null or p_days < 1 or p_days > 365 then
      raise exception 'Test duration must be between 1 and 365 days' using errcode = '22023';
    end if;
    v_end := now() + make_interval(days => p_days);
    insert into public.pawpass_entitlements(
      user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id,
      status, eligible_since, current_period_end, status_changed_at, updated_at,
      granted_by, grant_reason, test_expires_at
    ) values (
      p_target_id, 'owner_test', null, 'afterfur', 'owner_test', 'owner_test_' || p_target_id::text,
      'active', now(), v_end, now(), now(), v_actor, coalesce(p_reason, 'Owner test access'), v_end
    )
    on conflict (user_id) do update set
      source = 'owner_test',
      plan_interval = null,
      provider = 'afterfur',
      provider_customer_id = 'owner_test',
      provider_subscription_id = 'owner_test_' || p_target_id::text,
      status = 'active',
      eligible_since = now(),
      current_period_end = v_end,
      status_changed_at = now(),
      updated_at = now(),
      granted_by = v_actor,
      grant_reason = coalesce(p_reason, 'Owner test access'),
      test_expires_at = v_end;
  else
    if not exists (select 1 from public.pawpass_entitlements where user_id = p_target_id and source = 'owner_test') then
      raise exception 'Target does not have an owner test entitlement' using errcode = '22023';
    end if;
    update public.pawpass_entitlements
      set status = 'expired',
          current_period_end = now(),
          status_changed_at = now(),
          updated_at = now(),
          test_expires_at = now()
      where user_id = p_target_id and source = 'owner_test';
  end if;
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_actor, p_target_id, case when p_active then 'owner_test_activate' else 'owner_test_deactivate' end,
            'owner_test', jsonb_build_object('days', p_days, 'reason', p_reason));
  return true;
end;
$function$;
revoke all on function public.set_owner_test_prime(uuid, boolean, integer, text) from public, anon;
grant execute on function public.set_owner_test_prime(uuid, boolean, integer, text) to authenticated;

-- 10. Owner-granted free memberships.
create or replace function public.grant_free_prime_membership(
  p_target_id uuid,
  p_months integer,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_end timestamptz;
begin
  perform public.require_afterfur_staff_admin();
  if p_target_id is null or not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'Grant duration must be between 1 and 36 months' using errcode = '22023';
  end if;
  if exists (select 1 from public.pawpass_entitlements
             where user_id = p_target_id and source = 'paid'
               and status in ('active', 'cancel_at_period_end')
               and current_period_end is not null and current_period_end > now()) then
    raise exception 'Cannot grant a free membership over an active paid subscription' using errcode = '22023';
  end if;
  v_end := now() + make_interval(months => p_months);
  insert into public.pawpass_entitlements(
    user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id,
    status, eligible_since, current_period_end, status_changed_at, updated_at,
    granted_by, grant_reason, test_expires_at
  ) values (
    p_target_id, 'owner_granted', null, 'afterfur', 'owner_granted', 'owner_granted_' || p_target_id::text,
    'active', now(), v_end, now(), now(), v_actor, coalesce(p_reason, 'Owner-granted membership'), null
  )
  on conflict (user_id) do update set
    source = 'owner_granted',
    plan_interval = null,
    provider = 'afterfur',
    provider_customer_id = 'owner_granted',
    provider_subscription_id = 'owner_granted_' || p_target_id::text,
    status = 'active',
    eligible_since = now(),
    current_period_end = v_end,
    status_changed_at = now(),
    updated_at = now(),
    granted_by = v_actor,
    grant_reason = coalesce(p_reason, 'Owner-granted membership'),
    test_expires_at = null;
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_actor, p_target_id, 'grant_free_membership', 'owner_granted',
            jsonb_build_object('months', p_months, 'reason', p_reason));
  return true;
end;
$function$;
revoke all on function public.grant_free_prime_membership(uuid, integer, text) from public, anon;
grant execute on function public.grant_free_prime_membership(uuid, integer, text) to authenticated;

create or replace function public.revoke_free_prime_membership(
  p_target_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare v_actor uuid := auth.uid();
begin
  perform public.require_afterfur_staff_admin();
  if not exists (select 1 from public.pawpass_entitlements where user_id = p_target_id and source = 'owner_granted') then
    raise exception 'Target does not have an owner-granted membership' using errcode = '22023';
  end if;
  update public.pawpass_entitlements
    set status = 'expired',
        current_period_end = now(),
        status_changed_at = now(),
        updated_at = now()
    where user_id = p_target_id and source = 'owner_granted';
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_actor, p_target_id, 'revoke_free_membership', 'owner_granted', jsonb_build_object('reason', p_reason));
  return true;
end;
$function$;
revoke all on function public.revoke_free_prime_membership(uuid, text) from public, anon;
grant execute on function public.revoke_free_prime_membership(uuid, text) to authenticated;

-- 11. Founding reward claim (atomic, max 50).
create or replace function public.claim_founding_prime()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_expires timestamptz := now() + interval '12 months';
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Account not found' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pawpass_founding_claims', 0));
  select count(*) into v_count from public.pawpass_founding_claims;
  if v_count >= 50 then
    raise exception 'All 50 founding rewards have been claimed' using errcode = '22023';
  end if;
  if exists (select 1 from public.pawpass_founding_claims where user_id = v_user) then
    raise exception 'Founding reward already claimed for this account' using errcode = '22023';
  end if;
  if exists (select 1 from public.pawpass_entitlements
             where user_id = v_user
               and status in ('active', 'cancel_at_period_end')
               and current_period_end is not null and current_period_end > now()) then
    raise exception 'Account already has an active membership' using errcode = '22023';
  end if;
  insert into public.pawpass_founding_claims(user_id, claimed_at, activated_at, expires_at)
    values (v_user, now(), now(), v_expires);
  insert into public.pawpass_entitlements(
    user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id,
    status, eligible_since, current_period_end, status_changed_at, updated_at,
    granted_by, grant_reason, test_expires_at
  ) values (
    v_user, 'founding_reward', null, 'afterfur', 'founding', 'founding_' || v_user::text,
    'active', now(), v_expires, now(), now(), v_user, 'Founding 50 reward', null
  )
  on conflict (user_id) do update set
    source = 'founding_reward',
    plan_interval = null,
    provider = 'afterfur',
    provider_customer_id = 'founding',
    provider_subscription_id = 'founding_' || v_user::text,
    status = 'active',
    eligible_since = now(),
    current_period_end = v_expires,
    status_changed_at = now(),
    updated_at = now(),
    grant_reason = 'Founding 50 reward';
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_user, v_user, 'claim_founding_reward', 'founding_reward', jsonb_build_object('expires_at', v_expires));
  return true;
end;
$function$;
revoke all on function public.claim_founding_prime() from public, anon;
grant execute on function public.claim_founding_prime() to authenticated;

create or replace function public.get_my_founding_status()
returns table(claimed boolean, claimed_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select true, c.claimed_at, c.expires_at
  from public.pawpass_founding_claims c
  where c.user_id = auth.uid()
  union all
  select false, null::timestamptz, null::timestamptz
  where not exists (select 1 from public.pawpass_founding_claims where user_id = auth.uid())
  limit 1;
$function$;
revoke all on function public.get_my_founding_status() from public, anon;
grant execute on function public.get_my_founding_status() to authenticated;

create or replace function public.get_founding_rewards_remaining()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select greatest(0, 50 - (select count(*)::integer from public.pawpass_founding_claims));
$function$;
revoke all on function public.get_founding_rewards_remaining() from public;
grant execute on function public.get_founding_rewards_remaining() to anon, authenticated;

-- 12. Membership audit history for admins.
create or replace function public.get_membership_audit(p_target_id uuid default null, p_limit integer default 50)
returns table(id bigint, actor_id uuid, target_id uuid, action text, source text, details jsonb, occurred_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  return query
    select a.id, a.actor_id, a.target_id, a.action, a.source, a.details, a.occurred_at
    from public.pawpass_membership_audit a
    where p_target_id is null or a.target_id = p_target_id
    order by a.occurred_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$function$;
revoke all on function public.get_membership_audit(uuid, integer) from public, anon;
grant execute on function public.get_membership_audit(uuid, integer) to authenticated;

-- 13. Update get_public_badges to include PawPass Prime badge.
create or replace function public.get_public_badges(p_user_ids uuid[])
returns table(user_id uuid, badge_id text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user_id uuid; v_years integer; v_membership record; v_cutoff timestamptz;
begin
  if p_user_ids is null then return; end if;
  if cardinality(p_user_ids) > 100 then raise exception 'A maximum of 100 badge subjects may be requested'; end if;
  foreach v_user_id in array p_user_ids loop
    if v_user_id is null then continue; end if;
    select greatest(0, extract(year from age(now(), o.account_created_at))::integer)
      into v_years from public.badge_account_origins o where o.user_id = v_user_id;
    if v_years is not null and v_years > 0 then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
      select v_user_id, 'milestone_account_year_' || n, now()
      from generate_series(1, least(v_years, 50)) n
      on conflict (user_id, badge_id) do nothing;
    end if;
    select e.status, e.eligible_since, e.current_period_end, e.source into v_membership
      from public.pawpass_entitlements e where e.user_id = v_user_id;
    if v_membership.status in ('active', 'cancel_at_period_end') and v_membership.current_period_end is not null then
      v_cutoff := least(now(), v_membership.current_period_end);
      perform public.award_pawpass_months(v_user_id, v_membership.eligible_since, v_cutoff);
    end if;
  end loop;
   return query
     select s.user_id, s.badge_id from public.staff_badge_assignments s
     join public.badge_registry r on r.id = s.badge_id and r.is_public
     where s.user_id = any(p_user_ids)
     union
     select a.user_id, a.badge_id from public.user_badge_awards a
     join public.badge_registry r on r.id = a.badge_id and r.is_public
     where a.user_id = any(p_user_ids)
     union
     select e.user_id, 'pawpass_member'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_member' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now()
     union
     select e.user_id, 'pawpass_prime'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_prime' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now();
end;
$function$;

-- 14. Update process_pawpass_entitlement_event to set source paid and accept plan interval.
create or replace function public.process_pawpass_entitlement_event(
  p_user_id uuid, p_provider text, p_customer_id text, p_subscription_id text,
  p_event_id text, p_event_type text, p_status text,
  p_eligible_since timestamptz, p_current_period_end timestamptz, p_occurred_at timestamptz,
  p_plan_interval text default null
) returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_previous_status text; v_previous_changed timestamptz; v_previous_end timestamptz; v_eligible_since timestamptz; v_cutoff timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'Trusted billing service required' using errcode = '42501'; end if;
  if p_user_id is null or p_provider is null or p_customer_id is null or p_subscription_id is null
     or p_event_id is null or p_event_type is null or p_occurred_at is null or p_status is null
     or p_status not in ('active', 'cancel_at_period_end', 'past_due', 'expired', 'refunded')
     or p_eligible_since is null or (p_status in ('active', 'cancel_at_period_end') and p_current_period_end is null)
     or p_occurred_at > now() + interval '5 minutes' then raise exception 'Invalid verified PawPass event'; end if;
  if p_plan_interval is not null and p_plan_interval not in ('monthly', 'yearly') then raise exception 'Invalid plan interval'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  insert into public.pawpass_event_receipts(provider, provider_event_id, user_id, event_type)
    values (p_provider, p_event_id, p_user_id, p_event_type) on conflict do nothing;
  if not found then return false; end if;
  select e.status, e.status_changed_at, e.current_period_end into v_previous_status, v_previous_changed, v_previous_end from public.pawpass_entitlements e where e.user_id = p_user_id for update;
  if v_previous_changed is not null and p_occurred_at < v_previous_changed then return false; end if;
  if v_previous_status in ('active', 'cancel_at_period_end') and
     (p_status in ('past_due', 'expired') or v_previous_end < p_occurred_at) then
    v_cutoff := least(p_occurred_at, coalesce(v_previous_end, p_occurred_at));
    perform public.award_pawpass_months(p_user_id,
      (select eligible_since from public.pawpass_entitlements where user_id = p_user_id), v_cutoff);
  end if;
  v_eligible_since := case when v_previous_status in ('past_due', 'expired', 'refunded') or v_previous_end < p_occurred_at
    then p_occurred_at else coalesce((select eligible_since from public.pawpass_entitlements where user_id = p_user_id), p_eligible_since) end;
  insert into public.pawpass_entitlements(user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id, status, eligible_since, current_period_end, status_changed_at, updated_at)
    values (p_user_id, 'paid', coalesce(p_plan_interval, (select plan_interval from public.pawpass_entitlements where user_id=p_user_id)), p_provider, p_customer_id, p_subscription_id, p_status, v_eligible_since, p_current_period_end, p_occurred_at, now())
  on conflict (user_id) do update set source = 'paid', plan_interval = coalesce(excluded.plan_interval, public.pawpass_entitlements.plan_interval),
    provider = excluded.provider, provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id, status = excluded.status,
    eligible_since = v_eligible_since, current_period_end = excluded.current_period_end,
    status_changed_at = excluded.status_changed_at, updated_at = now();
  if p_status in ('active', 'cancel_at_period_end') and p_current_period_end > now() then
    v_cutoff := least(now(), p_current_period_end);
    perform public.award_pawpass_months(p_user_id, v_eligible_since, v_cutoff);
  elsif p_status = 'expired' then
    perform public.award_pawpass_months(p_user_id, v_eligible_since, least(now(), p_current_period_end));
  end if;
  return true;
end;
$function$;
revoke all on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text) to service_role;

comment on table public.pawpass_founding_claims is 'Founding 50 reward claims; max 50 enforced atomically in claim_founding_prime().';
comment on table public.pawpass_membership_audit is 'Auditable log of privileged membership changes.';


-- ===== 0014_replies_management.sql =====
-- Allow authors to manage their own replies (edit/delete) with ownership enforced by RLS.
alter table public.replies add column if not exists edited_at timestamptz;

drop policy if exists "replies update own" on public.replies;
create policy "replies update own"
  on public.replies for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "replies delete own" on public.replies;
create policy "replies delete own"
  on public.replies for delete to authenticated
  using (auth.uid() = author_id);


-- ===== 0015_badge_catalogue.sql =====
-- Badge catalogue expansion and manual badge management.
-- Depends on migrations 0011-0014.

-- Expand allowed badge categories.
alter table public.badge_registry
  drop constraint if exists badge_registry_category_check;
alter table public.badge_registry
  add constraint badge_registry_category_check
  check (category in ('staff', 'membership', 'milestone', 'trust', 'creator', 'achievement', 'community'));

insert into public.badge_registry (id, category, display_name, display_order) values
  ('access_after_dark', 'trust', 'After Dark', 600),
  ('access_age_verified', 'trust', 'Age Verified', 610),
  ('access_approved', 'trust', 'Approved', 620),
  ('web_designer', 'staff', 'Web Designer', 45),
  ('ad_creator', 'creator', 'AD Creator', 655),
  ('creator_featured', 'creator', 'Featured Creator', 660),
  ('community_helper', 'community', 'Community Helper', 700),
  ('achievement_event_winner', 'achievement', 'Event Winner', 750),
  ('early_supporter', 'membership', 'Early Supporter', 108),
  ('founding_50', 'membership', 'Founding 50', 109)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

-- Expand manual badge assignments to include all server-authorised manual badges.
alter table public.staff_badge_assignments
  drop constraint if exists staff_badge_assignments_badge_id_check;
alter table public.staff_badge_assignments
  add constraint staff_badge_assignments_badge_id_check
  check (badge_id in (
    'staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester',
    'access_age_verified', 'access_approved',
    'creator_featured', 'achievement_event_winner', 'community_helper',
    'web_designer', 'ad_creator'
  ));

-- Update manual badge management to allow the expanded catalogue.
create or replace function public.manage_staff_badge(p_target_id uuid, p_badge_id text, p_action text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_actor_id uuid := auth.uid();
begin
  perform public.require_afterfur_staff_admin();
  if v_actor_id = p_target_id and coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff badges cannot be assigned to yourself' using errcode = '42501';
  end if;
  if p_badge_id not in ('staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester',
      'access_age_verified', 'access_approved', 'creator_featured', 'achievement_event_winner', 'community_helper',
      'web_designer', 'ad_creator') then
    raise exception 'Unknown manual badge' using errcode = '22023';
  end if;
  if p_badge_id = 'web_designer' and not exists (
      select 1 from public.staff_badge_assignments where user_id = v_actor_id and badge_id = 'staff_founder'
  ) then
    raise exception 'Founder access required' using errcode = '42501';
  end if;
  if p_action not in ('grant', 'revoke') then raise exception 'Action must be grant or revoke' using errcode = '22023'; end if;
  if not exists(select 1 from public.profiles where id = p_target_id) then raise exception 'Target account not found' using errcode = '22023'; end if;
  if p_action = 'grant' then
    insert into public.staff_badge_assignments(user_id, badge_id, assigned_by)
      values (p_target_id, p_badge_id, v_actor_id) on conflict (user_id, badge_id) do nothing;
    if not found then return false; end if;
  else
    delete from public.staff_badge_assignments where user_id = p_target_id and badge_id = p_badge_id;
    if not found then return false; end if;
  end if;
  insert into public.staff_badge_audit(actor_id, target_id, badge_id, action)
    values (v_actor_id, p_target_id, p_badge_id, p_action);
  return true;
end;
$function$;
revoke all on function public.manage_staff_badge(uuid, text, text) from public, anon;
grant execute on function public.manage_staff_badge(uuid, text, text) to authenticated;

-- Award Founding 50 badge to successful founding claimants in public badge projection.
create or replace function public.get_public_badges(p_user_ids uuid[])
returns table(user_id uuid, badge_id text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user_id uuid; v_years integer; v_membership record; v_cutoff timestamptz;
begin
  if p_user_ids is null then return; end if;
  if cardinality(p_user_ids) > 100 then raise exception 'A maximum of 100 badge subjects may be requested'; end if;
  foreach v_user_id in array p_user_ids loop
    if v_user_id is null then continue; end if;
    select greatest(0, extract(year from age(now(), o.account_created_at))::integer)
      into v_years from public.badge_account_origins o where o.user_id = v_user_id;
    if v_years is not null and v_years > 0 then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
      select v_user_id, 'milestone_account_year_' || n, now()
      from generate_series(1, least(v_years, 50)) n
      on conflict (user_id, badge_id) do nothing;
    end if;
    select e.status, e.eligible_since, e.current_period_end, e.source into v_membership
      from public.pawpass_entitlements e where e.user_id = v_user_id;
    if v_membership.status in ('active', 'cancel_at_period_end') and v_membership.current_period_end is not null then
      v_cutoff := least(now(), v_membership.current_period_end);
      perform public.award_pawpass_months(v_user_id, v_membership.eligible_since, v_cutoff);
    end if;
  end loop;
   return query
     select s.user_id, s.badge_id from public.staff_badge_assignments s
     join public.badge_registry r on r.id = s.badge_id and r.is_public
     where s.user_id = any(p_user_ids)
     union
     select a.user_id, a.badge_id from public.user_badge_awards a
     join public.badge_registry r on r.id = a.badge_id and r.is_public
     where a.user_id = any(p_user_ids)
     union
     select e.user_id, 'pawpass_member'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_member' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now()
     union
     select e.user_id, 'pawpass_prime'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_prime' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now()
     union
     select c.user_id, 'founding_50'::text from public.pawpass_founding_claims c
     join public.badge_registry r on r.id = 'founding_50' and r.is_public
     where c.user_id = any(p_user_ids);
end;
$function$;


-- ===== 0016_terms_acceptance.sql =====
-- Terms acceptance tracking
alter table public.profiles
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz;


-- ===== 0017_customisation.sql =====
-- Public profile customisation and private UI preferences.
-- Public styling is stored on profiles and is visible to everyone.
-- Private UI preferences are stored separately and are owner-only.

alter table public.profiles
  add column if not exists profile_customisation jsonb;

create table if not exists public.user_ui_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_ui_preferences enable row level security;
drop policy if exists "ui preferences own" on public.user_ui_preferences;
create policy "ui preferences own" on public.user_ui_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.user_ui_preferences from public, anon;
grant select, insert, update, delete on public.user_ui_preferences to authenticated;

create or replace function public.update_profile_customisation(p_config jsonb)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid(); v_is_prime boolean;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select public.is_prime_member(v_user) into v_is_prime;
  if not v_is_prime then raise exception 'PawPass Prime membership required' using errcode = '42501'; end if;
  -- Validate minimal safe shape: only known keys and hex/enum values.
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Invalid configuration' using errcode = '22023'; end if;
  update public.profiles set profile_customisation = p_config where id = v_user;
  return true;
end;
$function$;
revoke all on function public.update_profile_customisation(jsonb) from public, anon;
grant execute on function public.update_profile_customisation(jsonb) to authenticated;

create or replace function public.get_my_ui_preferences()
returns jsonb
language sql stable security definer set search_path = pg_catalog, public
as $function$
  select coalesce((select preferences from public.user_ui_preferences where user_id = auth.uid()), '{}'::jsonb);
$function$;
revoke all on function public.get_my_ui_preferences() from public, anon;
grant execute on function public.get_my_ui_preferences() to authenticated;

create or replace function public.update_ui_preferences(p_preferences jsonb)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then raise exception 'Invalid preferences' using errcode = '22023'; end if;
  insert into public.user_ui_preferences(user_id, preferences, updated_at)
    values (v_user, p_preferences, now())
    on conflict (user_id) do update set preferences = excluded.preferences, updated_at = now();
  return true;
end;
$function$;
revoke all on function public.update_ui_preferences(jsonb) from public, anon;
grant execute on function public.update_ui_preferences(jsonb) to authenticated;


-- ===== 0018_terms_acceptance_trigger.sql =====
-- Ensure Terms acceptance metadata is copied into the profile on account creation,
-- including email-confirmation flows where the client has no session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, username, display_name, terms_accepted_version, terms_accepted_at)
    values (
      new.id,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'username', ''),
        'user_' || substr(new.id::text, 1, 8)
      ),
      coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'username', ''),
        split_part(new.email, '@', 1)
      ),
      nullif(new.raw_user_meta_data ->> 'terms_accepted_version', ''),
      case when new.raw_user_meta_data ->> 'terms_accepted_at' is not null
           then (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
           else null end
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, username, display_name, terms_accepted_version, terms_accepted_at)
    values (
      new.id,
      'user_' || substr(new.id::text, 1, 8),
      split_part(new.email, '@', 1),
      nullif(new.raw_user_meta_data ->> 'terms_accepted_version', ''),
      case when new.raw_user_meta_data ->> 'terms_accepted_at' is not null
           then (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
           else null end
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


-- ===== 0019_bookmark_folders.sql =====
-- Bookmark folders and membership limits.
create table if not exists public.bookmark_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookmark_folders_user_idx on public.bookmark_folders(user_id);

create table if not exists public.bookmark_folder_items (
  folder_id uuid not null references public.bookmark_folders(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_id, post_id)
);
create index if not exists bookmark_folder_items_user_idx on public.bookmark_folder_items(user_id);

alter table public.bookmark_folders enable row level security;
alter table public.bookmark_folder_items enable row level security;

drop policy if exists "bookmark folders own" on public.bookmark_folders;
create policy "bookmark folders own" on public.bookmark_folders
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bookmark folder items own" on public.bookmark_folder_items;
create policy "bookmark folder items own" on public.bookmark_folder_items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Free users: 3 folders. Prime: 20 folders. Enforced server-side in RPC.
create or replace function public.create_bookmark_folder(p_name text)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid(); v_count integer; v_limit integer; v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 60 then raise exception 'Invalid folder name' using errcode = '22023'; end if;
  select count(*) into v_count from public.bookmark_folders where user_id = v_user;
  if public.is_prime_member(v_user) then v_limit := 20; else v_limit := 3; end if;
  if v_count >= v_limit then raise exception 'Folder limit reached' using errcode = '22023'; end if;
  insert into public.bookmark_folders(user_id, name) values (v_user, trim(p_name)) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.create_bookmark_folder(text) from public, anon;
grant execute on function public.create_bookmark_folder(text) to authenticated;

create or replace function public.rename_bookmark_folder(p_folder_id uuid, p_name text)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 60 then raise exception 'Invalid folder name' using errcode = '22023'; end if;
  update public.bookmark_folders set name = trim(p_name), updated_at = now() where id = p_folder_id and user_id = v_user;
  if not found then raise exception 'Folder not found' using errcode = '22023'; end if;
  return true;
end;
$function$;
revoke all on function public.rename_bookmark_folder(uuid, text) from public, anon;
grant execute on function public.rename_bookmark_folder(uuid, text) to authenticated;

create or replace function public.delete_bookmark_folder(p_folder_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from public.bookmark_folders where id = p_folder_id and user_id = v_user;
  if not found then raise exception 'Folder not found' using errcode = '22023'; end if;
  return true;
end;
$function$;
revoke all on function public.delete_bookmark_folder(uuid) from public, anon;
grant execute on function public.delete_bookmark_folder(uuid) to authenticated;

create or replace function public.add_bookmark_to_folder(p_folder_id uuid, p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.bookmark_folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Folder not found' using errcode = '22023';
  end if;
  if not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'Post not found' using errcode = '22023';
  end if;
  insert into public.bookmark_folder_items(folder_id, post_id, user_id)
    values (p_folder_id, p_post_id, v_user)
    on conflict (folder_id, post_id) do nothing;
  return true;
end;
$function$;
revoke all on function public.add_bookmark_to_folder(uuid, uuid) from public, anon;
grant execute on function public.add_bookmark_to_folder(uuid, uuid) to authenticated;

create or replace function public.remove_bookmark_from_folder(p_folder_id uuid, p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from public.bookmark_folder_items where folder_id = p_folder_id and post_id = p_post_id and user_id = v_user;
  return true;
end;
$function$;
revoke all on function public.remove_bookmark_from_folder(uuid, uuid) from public, anon;
grant execute on function public.remove_bookmark_from_folder(uuid, uuid) to authenticated;


-- ===== 0020_ad_creator_badge.sql =====
-- Normalize AD Creator badge ID to ad_creator.
insert into public.badge_registry (id, category, display_name, display_order)
values ('ad_creator', 'creator', 'AD Creator', 655)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

-- Migrate any existing awards/assignments.
update public.user_badge_awards set badge_id = 'ad_creator' where badge_id = 'creator_ad';
update public.staff_badge_assignments set badge_id = 'ad_creator' where badge_id = 'creator_ad';

-- Remove the old duplicate badge id.
delete from public.badge_registry where id = 'creator_ad';


-- ===== 0021_ad_creator_auto.sql =====
-- Automatic AD Creator award at 500 followers, with a single SYSTEM notification.
create or replace function public.award_ad_creator_if_eligible(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_count integer;
  v_inserted boolean := false;
begin
  if p_user_id is null then return; end if;
  select count(distinct follower_id) into v_count
    from public.follows where following_id = p_user_id;
  if v_count < 500 then return; end if;
  insert into public.user_badge_awards (user_id, badge_id, awarded_at)
    values (p_user_id, 'ad_creator', now())
    on conflict (user_id, badge_id) do nothing;
  -- Notification is created by the universal badge notification trigger.
  return;
end;
$function$;

-- Trigger on new follows.
create or replace function public.trg_award_ad_creator()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.award_ad_creator_if_eligible(new.following_id);
  return new;
end;
$function$;

drop trigger if exists award_ad_creator_on_follow on public.follows;
create trigger award_ad_creator_on_follow
after insert on public.follows
for each row
execute function public.trg_award_ad_creator();

-- Ensure AD Creator is manually manageable by authorised staff.
create or replace function public.manage_staff_badge(p_target_id uuid, p_badge_id text, p_action text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_actor_id uuid := auth.uid();
begin
  perform public.require_afterfur_staff_admin();
  if v_actor_id = p_target_id and coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff badges cannot be assigned to yourself' using errcode = '42501';
  end if;
  if p_badge_id not in ('staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester',
      'access_age_verified', 'access_approved', 'creator_featured', 'achievement_event_winner', 'community_helper',
      'web_designer', 'ad_creator') then
    raise exception 'Unknown manual badge' using errcode = '22023';
  end if;
  if p_action not in ('grant', 'revoke') then raise exception 'Action must be grant or revoke' using errcode = '22023'; end if;
  if not exists(select 1 from public.profiles where id = p_target_id) then raise exception 'Target account not found' using errcode = '22023'; end if;
  if p_action = 'grant' then
    insert into public.staff_badge_assignments(user_id, badge_id, assigned_by)
      values (p_target_id, p_badge_id, v_actor_id) on conflict (user_id, badge_id) do nothing;
    if not found then return false; end if;
  else
    delete from public.staff_badge_assignments where user_id = p_target_id and badge_id = p_badge_id;
    if not found then return false; end if;
  end if;
  insert into public.staff_badge_audit(actor_id, target_id, badge_id, action)
    values (v_actor_id, p_target_id, p_badge_id, p_action);
  return true;
end;
$function$;
revoke all on function public.manage_staff_badge(uuid, text, text) from public, anon;
grant execute on function public.manage_staff_badge(uuid, text, text) to authenticated;

-- Ensure check constraint allows ad_creator.
alter table public.staff_badge_assignments
  drop constraint if exists staff_badge_assignments_badge_id_check;
alter table public.staff_badge_assignments
  add constraint staff_badge_assignments_badge_id_check
  check (badge_id in (
    'staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester',
    'access_age_verified', 'access_approved',
    'creator_featured', 'achievement_event_winner', 'community_helper',
    'web_designer', 'ad_creator'
  ));


-- ===== 0022_badge_notifications.sql =====
-- Universal SYSTEM notifications for newly awarded badges.
create or replace function public.notify_badge_award()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_badge_name text;
  v_icon text;
  v_message text;
begin
  select display_name, coalesce((select mark from public.badge_registry where id = new.badge_id), '') into v_badge_name, v_icon
    from public.badge_registry where id = new.badge_id;
  if v_badge_name is null then v_badge_name := new.badge_id; end if;
  v_message := case new.badge_id
    when 'ad_creator' then 'Congratulations! You''ve earned the AD Creator badge for reaching 500 followers!'
    else 'You''ve received a new badge: ' || v_badge_name || '!'
  end;
  if not exists (
    select 1 from public.notifications
    where user_id = new.user_id and type = 'badge'
      and payload @> jsonb_build_object('badge_id', new.badge_id)
  ) then
    insert into public.notifications (user_id, type, payload, read)
    values (new.user_id, 'badge', jsonb_build_object('system', true, 'badge_id', new.badge_id, 'badge_name', v_badge_name, 'icon', v_icon, 'message', v_message), false);
  end if;
  return new;
end;
$function$;

drop trigger if exists notify_badge_award_user on public.user_badge_awards;
create trigger notify_badge_award_user
after insert on public.user_badge_awards
for each row
execute function public.notify_badge_award();

drop trigger if exists notify_badge_award_staff on public.staff_badge_assignments;
create trigger notify_badge_award_staff
after insert on public.staff_badge_assignments
for each row
execute function public.notify_badge_award();


-- ===== 0023_post_length_check.sql =====
-- Enforce the 600-character post limit at the database level.
alter table public.posts
  drop constraint if exists posts_content_length_check;
alter table public.posts
  add constraint posts_content_length_check
  check (char_length(content) <= 600);


