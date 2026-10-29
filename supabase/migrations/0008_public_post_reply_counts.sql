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
