-- Follow and mention notifications (Stage 16B)
-- Do NOT apply migrations automatically.

-- 1) Follow notifications
create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_follower_id uuid := new.follower_id;
  v_following_id uuid := new.following_id;
  v_lock_key text;
begin
  if v_follower_id is null or v_following_id is null then
    return new;
  end if;
  if v_follower_id = v_following_id then
    return new;
  end if;

  v_lock_key := v_follower_id::text || ':follow:' || v_following_id::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));

  if not exists (
    select 1
    from public.notifications
    where user_id = v_following_id
      and type = 'follow'
      and payload @> pg_catalog.jsonb_build_object('actor_id', v_follower_id)
  ) then
    insert into public.notifications (user_id, type, payload, read)
    values (
      v_following_id,
      'follow',
      pg_catalog.jsonb_build_object('actor_id', v_follower_id),
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_follow_trigger on public.follows;
create trigger notify_on_follow_trigger
after insert on public.follows
for each row
execute function public.notify_on_follow();


-- 2) Mention notifications (posts and replies)
create or replace function public.notify_mentions_from_content(
  p_author_id uuid,
  p_content text,
  p_source_type text,
  p_source_id uuid,
  p_post_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := p_author_id;
  v_match record;
  v_username text;
  v_recipient_id uuid;
  v_lock_key text;
  v_post_id_for_payload uuid := p_post_id;
begin
  if v_actor_id is null or p_content is null or trim(p_content) = '' then
    return;
  end if;
  if p_source_type not in ('post', 'reply') then
    return;
  end if;
  if p_source_type = 'post' then
    v_post_id_for_payload := p_source_id;
  end if;

  for v_match in
    select (regexp_matches(p_content, '@([A-Za-z0-9_]{3,})', 'g'))[1] as username
  loop
    v_username := lower(trim(v_match.username));
    if v_username = '' then
      continue;
    end if;

    select id into v_recipient_id
    from public.profiles
    where lower(username) = v_username
    limit 1;

    if v_recipient_id is null then
      continue;
    end if;
    if v_recipient_id = v_actor_id then
      continue;
    end if;

    v_lock_key := v_actor_id::text || ':mention:' || p_source_type || ':' || p_source_id::text || ':' || v_username;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));

    if not exists (
      select 1
      from public.notifications
      where user_id = v_recipient_id
        and type = 'mention'
        and payload @> pg_catalog.jsonb_build_object('actor_id', v_actor_id)
        and payload @> pg_catalog.jsonb_build_object('source_type', p_source_type)
        and payload @> pg_catalog.jsonb_build_object('source_id', p_source_id)
        and payload @> pg_catalog.jsonb_build_object('mention', v_username)
    ) then
      insert into public.notifications (user_id, type, payload, read)
      values (
        v_recipient_id,
        'mention',
        pg_catalog.jsonb_build_object(
          'actor_id', v_actor_id,
          'source_type', p_source_type,
          'source_id', p_source_id,
          'post_id', v_post_id_for_payload,
          'mention', v_username
        ),
        false
      );
    end if;
  end loop;
end;
$$;

create or replace function public.notify_mentions_on_post()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.notify_mentions_from_content(new.author_id, new.content, 'post', new.id, new.id);
  return new;
end;
$$;

create or replace function public.notify_mentions_on_reply()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.notify_mentions_from_content(new.author_id, new.content, 'reply', new.id, new.post_id);
  return new;
end;
$$;

drop trigger if exists notify_mentions_on_post_trigger on public.posts;
create trigger notify_mentions_on_post_trigger
after insert on public.posts
for each row
execute function public.notify_mentions_on_post();

drop trigger if exists notify_mentions_on_reply_trigger on public.replies;
create trigger notify_mentions_on_reply_trigger
after insert on public.replies
for each row
execute function public.notify_mentions_on_reply();

-- Permissions
revoke all on function public.notify_mentions_from_content(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_on_follow() from public, anon, authenticated;
revoke all on function public.notify_mentions_on_post() from public, anon, authenticated;
revoke all on function public.notify_mentions_on_reply() from public, anon, authenticated;
