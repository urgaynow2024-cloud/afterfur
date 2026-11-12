-- 0056_add_missing_indexes_fks.sql
-- Add missing indexes, foreign keys, and constraints identified by audit.
-- Forward-only, idempotent.

-- ---------------------------------------------------------------------------
-- 1. Posts indexes
-- ---------------------------------------------------------------------------

-- Classification index (for 0044 RLS policies)
create index if not exists posts_classification_idx on public.posts(classification);

-- Author + created_at composite (common feed query)
create index if not exists posts_author_created_idx on public.posts(author_id, created_at desc);

-- Moderation status + created_at (moderation queue)
create index if not exists posts_moderation_created_idx on public.posts(moderation_status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Replies indexes
-- ---------------------------------------------------------------------------

-- Post + created_at (thread view)
create index if not exists replies_post_created_idx on public.replies(post_id, created_at asc);

-- Author + created_at
create index if not exists replies_author_created_idx on public.replies(author_id, created_at desc);

-- Parent reply (threaded replies)
create index if not exists replies_parent_idx on public.replies(parent_reply_id);

-- Moderation status + created_at
create index if not exists replies_moderation_created_idx on public.replies(moderation_status, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Follows indexes
-- ---------------------------------------------------------------------------

-- Follower + status (following list with status)
create index if not exists follows_follower_status_idx on public.follows(follower_id, status);

-- Following + status (followers list with status)
create index if not exists follows_following_status_idx on public.follows(following_id, status);

-- Created_at for chronological ordering (column added in 0053)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'follows' and column_name = 'created_at'
  ) then
    create index if not exists follows_created_idx on public.follows(created_at desc);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Profiles indexes
-- ---------------------------------------------------------------------------

-- Username (already unique, but ensure index exists for ILIKE queries)
-- Note: unique constraint on username already creates index

-- is_private + created_at (admin queries)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at'
  ) then
    create index if not exists profiles_private_created_idx on public.profiles(is_private, created_at desc);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Notifications indexes
-- ---------------------------------------------------------------------------

-- User + read + created_at (unread count, pagination)
create index if not exists notifications_user_read_created_idx on public.notifications(user_id, read, created_at desc);

-- Type + user (type-specific queries)
create index if not exists notifications_type_user_idx on public.notifications(type, user_id);

-- ---------------------------------------------------------------------------
-- 6. Messages indexes
-- ---------------------------------------------------------------------------

-- Conversation + created_at (thread view)
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at asc);

-- Sender + created_at
create index if not exists messages_sender_created_idx on public.messages(sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 7. Conversation participants indexes
-- ---------------------------------------------------------------------------

-- User + conversation (membership lookups)
create index if not exists conversation_participants_user_idx on public.conversation_participants(user_id);

-- ---------------------------------------------------------------------------
-- 8. Blocks indexes (already in 0048, verify)
-- ---------------------------------------------------------------------------
-- blocks_blocker_idx, blocks_blocked_idx created in 0048

-- ---------------------------------------------------------------------------
-- 9. Notification preferences indexes
-- ---------------------------------------------------------------------------
-- Primary key on user_id is sufficient

-- ---------------------------------------------------------------------------
-- 10. Message requests indexes (already in 0050, verify)
-- ---------------------------------------------------------------------------
-- message_requests_to_user_idx, message_requests_from_user_idx, message_requests_status_idx created in 0050

-- ---------------------------------------------------------------------------
-- 11. Foreign Key Verification (defensive - ensure all expected FKs exist)
-- ---------------------------------------------------------------------------

-- posts.moderated_by -> profiles(id) (verified in 0052)
-- replies.moderated_by -> profiles(id) (verified in 0052)
-- blocks.blocker_id -> profiles(id) (verified in 0048)
-- blocks.blocked_id -> profiles(id) (verified in 0048)
-- notification_preferences.user_id -> profiles(id) (verified in 0049)
-- message_requests.from_user_id -> profiles(id) (verified in 0050)
-- message_requests.to_user_id -> profiles(id) (verified in 0050)

-- Verify replies.parent_reply_id -> replies(id) (from 0001)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = 'replies'
      and kcu.column_name = 'parent_reply_id'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'replies'
      and ccu.column_name = 'id'
  ) then
    alter table public.replies
      add constraint replies_parent_reply_id_fkey
      foreign key (parent_reply_id) references public.replies(id) on delete cascade;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Additional CHECK Constraints
-- ---------------------------------------------------------------------------

-- posts.content length (already enforced by application, but add DB constraint)
do $$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = 'posts'
      and pg_get_constraintdef(con.oid, true) ilike '%content%'
      and pg_get_constraintdef(con.oid, true) ilike '%length%'
  ) then
    alter table public.posts
      add constraint posts_content_length_check check (char_length(content) between 1 and 10000);
  end if;
end;
$$;

-- replies.content length
do $$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = 'replies'
      and pg_get_constraintdef(con.oid, true) ilike '%content%'
      and pg_get_constraintdef(con.oid, true) ilike '%length%'
  ) then
    alter table public.replies
      add constraint replies_content_length_check check (char_length(content) between 1 and 10000);
  end if;
end;
$$;

-- messages.content length
do $$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = 'messages'
      and pg_get_constraintdef(con.oid, true) ilike '%content%'
      and pg_get_constraintdef(con.oid, true) ilike '%length%'
  ) then
    alter table public.messages
      add constraint messages_content_length_check check (char_length(content) between 1 and 10000);
  end if;
end;
$$;

-- profiles.username format (alphanumeric + underscore, 3-30 chars)
do $$
begin
  if not exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where con.contype = 'c' and n.nspname = 'public' and c.relname = 'profiles'
      and pg_get_constraintdef(con.oid, true) ilike '%username%'
      and pg_get_constraintdef(con.oid, true) ~* 'regexp|like|similar'
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check check (username ~ '^[a-zA-Z0-9_]{3,30}$');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Function Search Path Hardening (audit finding)
-- ---------------------------------------------------------------------------
-- Ensure all SECURITY DEFINER functions have explicit search_path
-- This is a verification step; functions created in this remediation already have it.

do $$
declare
  v_func text;
  v_config text[];
  v_missing text[] := '{}';
begin
  for v_func, v_config in
    select p.proname::text, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    if v_config is null or not (v_config @> array['search_path=pg_catalog,public'] or v_config @> array['search_path=public,pg_temp']) then
      v_missing := v_missing || v_func;
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise warning 'SECURITY DEFINER functions missing explicit search_path: %', v_missing;
  else
    raise notice 'All SECURITY DEFINER functions have explicit search_path';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Verification
-- ---------------------------------------------------------------------------
do $$
declare
  v_count int;
  v_expected int := 12; -- base indexes that should always exist
begin
  -- Verify key indexes exist (base set)
  select count(*) into v_count from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'posts_classification_idx', 'posts_author_created_idx', 'posts_moderation_created_idx',
      'replies_post_created_idx', 'replies_author_created_idx', 'replies_parent_idx',
      'replies_moderation_created_idx',
      'follows_follower_status_idx', 'follows_following_status_idx',
      'notifications_user_read_created_idx', 'notifications_type_user_idx',
      'messages_conversation_created_idx', 'messages_sender_created_idx',
      'conversation_participants_user_idx'
    );
  
  -- Conditional indexes (depend on columns added by other migrations)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'follows' and column_name = 'created_at') then
    v_expected := v_expected + 1;
    if exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'follows' and indexname = 'follows_created_idx') then
      v_count := v_count + 1;
    end if;
  end if;
  
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'created_at') then
    v_expected := v_expected + 1;
    if exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'profiles' and indexname = 'profiles_private_created_idx') then
      v_count := v_count + 1;
    end if;
  end if;

  if v_count < v_expected then
    raise warning 'Some expected indexes missing: found % of %', v_count, v_expected;
  else
    raise notice 'All expected indexes verified: % of %', v_count, v_expected;
  end if;

  -- Verify FKs
  select count(*) into v_count
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_schema = 'public'
    and (
      (tc.table_name = 'posts' and kcu.column_name = 'moderated_by')
      or (tc.table_name = 'replies' and kcu.column_name = 'moderated_by')
      or (tc.table_name = 'blocks' and kcu.column_name = 'blocker_id')
      or (tc.table_name = 'blocks' and kcu.column_name = 'blocked_id')
      or (tc.table_name = 'notification_preferences' and kcu.column_name = 'user_id')
      or (tc.table_name = 'message_requests' and kcu.column_name = 'from_user_id')
      or (tc.table_name = 'message_requests' and kcu.column_name = 'to_user_id')
      or (tc.table_name = 'replies' and kcu.column_name = 'parent_reply_id')
    );

  raise notice 'Key foreign keys verified: %', v_count;
end;
$$;