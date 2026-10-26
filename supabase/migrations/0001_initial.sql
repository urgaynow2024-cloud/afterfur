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

