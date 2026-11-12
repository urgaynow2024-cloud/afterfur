-- READ-ONLY AUDIT: NSFW media stored in the public `media` bucket
--
-- This query identifies all posts whose media_urls contain direct public
-- bucket URLs (https://.../object/public/media/...). These URLs are accessible
-- by anyone without authentication, bypassing the NSFW blur controls and
-- signed-URL authorization.
--
-- Run this BEFORE applying the reconciliation migration to review affected
-- records. It does NOT modify any data.
--
-- The audit adapts to the target schema: if public.posts.classification
-- exists, NSFW posts are filtered; otherwise all posts with public-bucket
-- media are reported (classification shown as NULL).
--
-- Output columns:
--   post_id        - UUID of the affected post
--   author_id      - UUID of the post author
--   created_at     - Post creation timestamp
--   classification - Post classification (NULL if column missing)
--   media_urls     - The media URL array as stored
--   affected_urls  - Individual public-bucket URLs that need migration
--   url_count      - Number of public-bucket URLs in this post

do $$
declare
  classification_exists boolean;
  sql text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'classification'
  ) into classification_exists;

  if classification_exists then
    sql := $q$
      select
        p.id as post_id,
        p.author_id,
        p.created_at,
        p.classification,
        p.media_urls,
        array_agg(m.url) filter (where m.url like '%/object/public/media/%') as affected_urls,
        count(m.url) filter (where m.url like '%/object/public/media/%') as url_count
      from public.posts p
      cross join lateral unnest(coalesce(p.media_urls, array[]::text[])) with ordinality as m(url, ord)
      where p.media_urls is not null
        and array_length(p.media_urls, 1) > 0
      group by p.id, p.author_id, p.created_at, p.classification, p.media_urls
      having count(m.url) filter (where m.url like '%/object/public/media/%') > 0
      order by p.created_at desc;
    $q$;
  else
    sql := $q$
      select
        p.id as post_id,
        p.author_id,
        p.created_at,
        null::text as classification,
        p.media_urls,
        array_agg(m.url) filter (where m.url like '%/object/public/media/%') as affected_urls,
        count(m.url) filter (where m.url like '%/object/public/media/%') as url_count
      from public.posts p
      cross join lateral unnest(coalesce(p.media_urls, array[]::text[])) with ordinality as m(url, ord)
      where p.media_urls is not null
        and array_length(p.media_urls, 1) > 0
      group by p.id, p.author_id, p.created_at, p.media_urls
      having count(m.url) filter (where m.url like '%/object/public/media/%') > 0
      order by p.created_at desc;
    $q$;
  end if;

  execute sql;

  -- Summary counts
  if classification_exists then
    execute $q$
      select
        count(*) as total_posts_with_public_media,
        sum(url_count) as total_public_media_urls_to_migrate,
        count(*) filter (where classification = 'NSFW') as nsfw_posts_with_public_media,
        count(*) filter (where classification = 'SFW') as sfw_posts_with_public_media,
        count(*) filter (where classification is null) as posts_with_unknown_classification
      from (
        select
          p.id as post_id,
          p.classification,
          count(m.url) filter (where m.url like '%/object/public/media/%') as url_count
        from public.posts p
        cross join lateral unnest(coalesce(p.media_urls, array[]::text[])) as m(url)
        where p.media_urls is not null
          and array_length(p.media_urls, 1) > 0
        group by p.id, p.classification
        having count(m.url) filter (where m.url like '%/object/public/media/%') > 0
      ) sub;
    $q$;
  else
    execute $q$
      select
        count(*) as total_posts_with_public_media,
        sum(url_count) as total_public_media_urls_to_migrate,
        0 as nsfw_posts_with_public_media,
        0 as sfw_posts_with_public_media,
        count(*) as posts_with_unknown_classification
      from (
        select
          p.id as post_id,
          count(m.url) filter (where m.url like '%/object/public/media/%') as url_count
        from public.posts p
        cross join lateral unnest(coalesce(p.media_urls, array[]::text[])) as m(url)
        where p.media_urls is not null
          and array_length(p.media_urls, 1) > 0
        group by p.id
        having count(m.url) filter (where m.url like '%/object/public/media/%') > 0
      ) sub;
    $q$;
  end if;
end $$;
