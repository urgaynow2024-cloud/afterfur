-- 0049_notification_preferences.sql
-- Create the missing notification_preferences table.
-- Referenced by src/lib/notificationPreferences.ts and src/app/api/notifications/preferences/route.ts.
-- Forward-only, idempotent where possible.

-- ---------------------------------------------------------------------------
-- 1. notification_preferences table
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  likes boolean not null default true,
  replies boolean not null default true,
  reposts boolean not null default true,
  follows boolean not null default true,
  follow_requests boolean not null default true,
  mentions boolean not null default true,
  messages boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.notification_preferences enable row level security;

-- RLS Policies
-- Users can read their own preferences
drop policy if exists "notification_preferences read own" on public.notification_preferences;
create policy "notification_preferences read own"
  on public.notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert their own preferences (on first save)
drop policy if exists "notification_preferences insert own" on public.notification_preferences;
create policy "notification_preferences insert own"
  on public.notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can update their own preferences
drop policy if exists "notification_preferences update own" on public.notification_preferences;
create policy "notification_preferences update own"
  on public.notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists notification_preferences_updated_at on public.notification_preferences;
create trigger notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_notification_preferences_updated_at();

revoke all on function public.set_notification_preferences_updated_at() from public, anon, authenticated;
grant execute on function public.set_notification_preferences_updated_at() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Grants
-- ---------------------------------------------------------------------------
revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Comments
-- ---------------------------------------------------------------------------
comment on table public.notification_preferences is
  'Per-user notification delivery preferences. All preferences default to true (enabled).';
comment on column public.notification_preferences.user_id is 'Profile ID (FK to profiles).';
comment on column public.notification_preferences.likes is 'Receive notifications for post likes.';
comment on column public.notification_preferences.replies is 'Receive notifications for post replies.';
comment on column public.notification_preferences.reposts is 'Receive notifications for post reposts.';
comment on column public.notification_preferences.follows is 'Receive notifications for new followers (accepted).';
comment on column public.notification_preferences.follow_requests is 'Receive notifications for follow requests (pending).';
comment on column public.notification_preferences.mentions is 'Receive notifications for @mentions.';
comment on column public.notification_preferences.messages is 'Receive notifications for direct messages.';
comment on column public.notification_preferences.updated_at is 'Last time preferences were modified.';