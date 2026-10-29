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
