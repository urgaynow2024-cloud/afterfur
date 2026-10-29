-- Return aggregate like totals for requested public posts without exposing
-- individual liker rows through the existing likes RLS policy.
create or replace function public.get_post_like_counts(p_post_ids uuid[])
returns table (post_id uuid, like_count bigint)
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
  select requested_posts.post_id, count(likes.post_id)::bigint as like_count
  from requested_posts
  join public.posts as posts on posts.id = requested_posts.post_id
  left join public.likes as likes on likes.post_id = requested_posts.post_id
  group by requested_posts.post_id;
$function$;

revoke all on function public.get_post_like_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_like_counts(uuid[]) to anon, authenticated;

comment on function public.get_post_like_counts(uuid[]) is
  'Returns like totals only for existing public post IDs; never returns liker identities. Null input, null IDs, and nonexistent posts produce no result row.';
