-- STAGE_25_MESSAGE_READ_RECEIPTS.sql
--
-- Adds read receipts for direct messages. A read receipt records that a given
-- conversation member has read a given message. Receipts are scoped to the
-- conversation so RLS can enforce membership without exposing message content
-- to non-members.

create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  unique (conversation_id, message_id, user_id)
);

alter table public.message_reads enable row level security;

drop policy if exists "message_reads read by member" on public.message_reads;
create policy "message_reads read by member"
  on public.message_reads
  for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = message_reads.conversation_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "message_reads insert own" on public.message_reads;
create policy "message_reads insert own"
  on public.message_reads
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = message_reads.conversation_id
        and cp.user_id = auth.uid()
    )
  );

drop policy if exists "message_reads update own" on public.message_reads;
create policy "message_reads update own"
  on public.message_reads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists message_reads_conversation_idx on public.message_reads(conversation_id);
create index if not exists message_reads_user_idx on public.message_reads(user_id);
create index if not exists message_reads_message_idx on public.message_reads(message_id);

-- RPC: mark a batch of messages as read for the caller in a conversation.
-- SECURITY INVOKER so RLS applies to the caller's membership.
create or replace function public.mark_messages_read(
  p_conversation_id uuid,
  p_message_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_message_id uuid;
begin
  -- Verify the caller is a member of the conversation.
  if not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = auth.uid()
  ) then
    raise exception 'not a conversation member';
  end if;

  foreach v_message_id in array p_message_ids loop
    insert into public.message_reads (conversation_id, message_id, user_id, read_at)
    values (p_conversation_id, v_message_id, auth.uid(), now())
    on conflict (conversation_id, message_id, user_id)
    do update set read_at = now();
  end loop;
end;
$$;

revoke all on function public.mark_messages_read(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_messages_read(uuid, uuid[]) to authenticated;

comment on function public.mark_messages_read(uuid, uuid[]) is
  'Marks the given messages as read for the authenticated caller in the given conversation. RLS enforces conversation membership.';
