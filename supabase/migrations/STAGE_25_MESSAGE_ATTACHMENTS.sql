-- STAGE_25_MESSAGE_ATTACHMENTS.sql
--
-- Adds secure message attachments. Attachments are stored in a private
-- Supabase Storage bucket (`message_attachments`) and registered in the
-- `message_attachments` table. Access is gated on conversation membership:
-- only members of a conversation can upload or download its attachments.
--
-- Upload flow:
--   1. Client requests upload authorization from POST /api/messages/attachments
--   2. Server validates conversation membership and file type/size
--   3. Client uploads directly to Storage using the anon client (RLS restricts
--      uploads to the uploader's own folder)
--   4. Client registers the attachment via POST /api/messages/attachments
--   5. Server inserts a row into public.message_attachments
-- Download flow:
--   1. Client requests a signed URL from GET /api/messages/attachments/signed-url
--   2. Server verifies conversation membership
--   3. Server mints a short-lived signed URL with the service-role client
--      (service-role key never reaches the browser)

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  bucket_id text not null default 'message_attachments',
  media_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  unique (bucket_id, storage_path)
);

alter table public.message_attachments enable row level security;

drop policy if exists "message_attachments read by member" on public.message_attachments;
create policy "message_attachments read by member"
  on public.message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = message_attachments.conversation_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "message_attachments insert by member" on public.message_attachments;
create policy "message_attachments insert by member"
  on public.message_attachments
  for insert
  to authenticated
  with check (
    auth.uid() = uploader_id
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = message_attachments.conversation_id
        and cp.user_id = auth.uid()
    )
  );

create index if not exists message_attachments_conversation_idx on public.message_attachments(conversation_id);
create index if not exists message_attachments_message_idx on public.message_attachments(message_id);
create index if not exists message_attachments_uploader_idx on public.message_attachments(uploader_id);

-- 2. Create the private bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('message_attachments', 'message_attachments', false)
on conflict (id) do nothing;

-- 3. Storage RLS for the private bucket.
--    Only the uploader (first path segment == uploader id) may manage their own
--    objects. Read is closed; signed URLs are minted server-side.
drop policy if exists "message_attachments upload own" on storage.objects;
create policy "message_attachments upload own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'message_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "message_attachments update own" on storage.objects;
create policy "message_attachments update own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'message_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "message_attachments delete own" on storage.objects;
create policy "message_attachments delete own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'message_attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read is intentionally closed to anon/authenticated. The only way to fetch an
-- attachment object is through a service-role signed URL after authorization.
drop policy if exists "message_attachments read" on storage.objects;
create policy "message_attachments read"
  on storage.objects
  for select
  to authenticated
  using (false);
