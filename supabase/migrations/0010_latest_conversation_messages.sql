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
 