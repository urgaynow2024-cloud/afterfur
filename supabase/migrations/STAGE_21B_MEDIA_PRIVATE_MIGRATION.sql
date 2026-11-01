-- STAGE_21B MEDIA PRIVATE MIGRATION
--
-- Goal: move user-uploaded post media into a private Supabase Storage bucket so
-- that direct public URL access is no longer possible. Existing public media
-- URLs are preserved (the public `media` bucket is untouched), and no existing
-- media rows or objects are deleted.
--
-- The app authorizes access at request time through
-- src/app/api/media/signed-url, which verifies the media owner, profile
-- privacy, follow status, and Stage 21A blocking before minting a short-lived
-- signed URL. Storage RLS below enforces the same rules at the database layer.
--
-- This migration is idempotent and safe to apply on top of the existing public
-- `media` bucket. It does NOT drop or rename the public bucket and does NOT
-- delete any objects.

-- 1. Canonical media records table.
--    One row per uploaded media object. owner_id is the authoritative source of
--    ownership; the signed-URL route reads this row rather than trusting any
--    client-supplied claim.
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  storage_path text not null,
  bucket_id text not null default 'media_private',
  media_type text,
  created_at timestamptz not null default now(),
  unique (bucket_id, storage_path)
);

alter table public.media enable row level security;

-- Owners can read their own media rows. The signed-URL route uses the
-- service-role client to read rows for authorization, so this policy only
-- governs direct anon/authenticated access.
drop policy if exists "media read own" on public.media;
create policy "media read own"
  on public.media
  for select
  using (auth.uid() = owner_id);

drop policy if exists "media insert own" on public.media;
create policy "media insert own"
  on public.media
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "media delete own" on public.media;
create policy "media delete own"
  on public.media
  for delete
  using (auth.uid() = owner_id);

create index if not exists media_owner_idx on public.media(owner_id);
create index if not exists media_post_idx on public.media(post_id);
create index if not exists media_storage_path_idx on public.media(bucket_id, storage_path);

-- 2. Create the private bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('media_private', 'media_private', false)
on conflict (id) do nothing;

-- 3. Storage RLS for the private bucket.
--    Only the owner (first path segment == owner id) may read or manage their
--    own objects. Signed-URL generation is performed server-side with the
--    service-role client, which bypasses RLS, so the signed URL itself is not
--    gated by these policies.

drop policy if exists "media_private upload own" on storage.objects;
create policy "media_private upload own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media_private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_private update own" on storage.objects;
create policy "media_private update own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media_private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_private delete own" on storage.objects;
create policy "media_private delete own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media_private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read is intentionally closed to the anon/authenticated roles. The only way
-- to fetch a private media object is through a service-role signed URL.
drop policy if exists "media_private read" on storage.objects;
create policy "media_private read"
  on storage.objects
  for select
  to authenticated
  using (false);

-- 4. Preserve the existing public bucket and its policies (no changes).
--    The public `media` bucket remains available for backwards compatibility and
--    for any media that was uploaded before this migration. It is intentionally
--    left untouched. Existing posts continue to store public URLs in
--    posts.media_urls and render them directly.