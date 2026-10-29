-- Return aggregate repost totals without exposing individual repost rows.
create or replace function public.get_post_repost_counts(p_post_ids uuid[])
returns table (post_id uuid, repost_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with requested_posts as (
    select distinct requested.post_id
    from unnest(p_post_ids) as requested(post_id)
    where requested.post_id is not null
  )
  select requested_posts.post_id, count(reposts.post_id)::bigint as repost_count
  from requested_posts
  join public.posts as posts on posts.id = requested_posts.post_id
  left join public.reposts as reposts on reposts.post_id = requested_posts.post_id
  group by requested_posts.post_id;
$function$;

revoke all on function public.get_post_repost_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_repost_counts(uuid[]) to anon, authenticated;

comment on function public.get_post_repost_counts(uuid[]) is
  'Returns repost totals only for existing public post IDs; never returns reposting user identities. Null input, null IDs, and nonexistent posts produce no result row.';

