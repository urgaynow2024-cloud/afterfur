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
