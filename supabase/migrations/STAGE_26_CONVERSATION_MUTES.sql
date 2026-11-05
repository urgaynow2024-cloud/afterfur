-- STAGE_26_CONVERSATION_MUTES.sql
--
-- Adds per-user conversation muting. Muting a conversation suppresses new-message
-- notifications for that conversation but does not affect message delivery,
-- read receipts, or conversation visibility.

create table if not exists public.conversation_mutes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

alter table public.conversation_mutes enable row level security;

drop policy if exists "conversation_mutes read own" on public.conversation_mutes;
create policy "conversation_mutes read own"
  on public.conversation_mutes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "conversation_mutes insert own" on public.conversation_mutes;
create policy "conversation_mutes insert own"
  on public.conversation_mutes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "conversation_mutes delete own" on public.conversation_mutes;
create policy "conversation_mutes delete own"
  on public.conversation_mutes
  for delete
  to authenticated
  using (auth.uid() = user_id);

create index if not exists conversation_mutes_user_idx on public.conversation_mutes(user_id);
create index if not exists conversation_mutes_conversation_idx on public.conversation_mutes(conversation_id);
