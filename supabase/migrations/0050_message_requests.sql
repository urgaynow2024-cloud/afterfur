-- 0050_message_requests.sql
-- Create the missing message_requests table.
-- Referenced by src/app/api/messages/requests/route.ts.
-- Forward-only, idempotent where possible.

-- ---------------------------------------------------------------------------
-- 1. message_requests table
-- ---------------------------------------------------------------------------
create table if not exists public.message_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  constraint message_requests_no_self_request check (from_user_id <> to_user_id),
  constraint message_requests_unique_pair unique (from_user_id, to_user_id)
);

-- Indexes for common query patterns
create index if not exists message_requests_to_user_idx on public.message_requests(to_user_id, status);
create index if not exists message_requests_from_user_idx on public.message_requests(from_user_id);
create index if not exists message_requests_status_idx on public.message_requests(status);

-- Enable RLS
alter table public.message_requests enable row level security;

-- RLS Policies
-- Users can read incoming requests (where they are the recipient)
drop policy if exists "message_requests read incoming" on public.message_requests;
create policy "message_requests read incoming"
  on public.message_requests for select
  to authenticated
  using (to_user_id = auth.uid());

-- Users can read outgoing requests (where they are the sender)
drop policy if exists "message_requests read outgoing" on public.message_requests;
create policy "message_requests read outgoing"
  on public.message_requests for select
  to authenticated
  using (from_user_id = auth.uid());

-- Users can insert requests (as sender)
drop policy if exists "message_requests insert own" on public.message_requests;
create policy "message_requests insert own"
  on public.message_requests for insert
  to authenticated
  with check (from_user_id = auth.uid());

-- Recipient can update status (accept/reject)
drop policy if exists "message_requests update recipient" on public.message_requests;
create policy "message_requests update recipient"
  on public.message_requests for update
  to authenticated
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid() and status in ('accepted', 'rejected'));

-- ---------------------------------------------------------------------------
-- 2. Grants
-- ---------------------------------------------------------------------------
revoke all on public.message_requests from public, anon, authenticated;
grant select, insert, update on public.message_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Comments
-- ---------------------------------------------------------------------------
comment on table public.message_requests is
  'Message requests between users who are not in a conversation. Allows users to request messaging permission.';
comment on column public.message_requests.id is 'Unique request identifier.';
comment on column public.message_requests.from_user_id is 'User requesting to message (FK to profiles).';
comment on column public.message_requests.to_user_id is 'User being requested to message (FK to profiles).';
comment on column public.message_requests.status is 'Request status: pending, accepted, or rejected.';
comment on column public.message_requests.created_at is 'Timestamp when the request was created.';