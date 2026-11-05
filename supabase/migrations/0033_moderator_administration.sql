-- Stage 33: Moderator & Administration System
--
-- Adds role-based moderator permissions, moderation audit logging, user
-- enforcement records (warnings, suspensions, bans, restrictions), and appeals.
-- Depends on migrations 0001-0025 (profiles, posts, replies, reports,
-- staff_badge_assignments, staff_badge_audit). Not applied to production
-- automatically; requires explicit deployment.

-- ---------------------------------------------------------------------------
-- 1. Moderator roles table
-- ---------------------------------------------------------------------------
create table if not exists public.moderator_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('moderator', 'senior_moderator', 'administrator')),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  reason text,
  unique (user_id)
);

alter table public.moderator_roles enable row level security;

drop policy if exists "moderator_roles read by staff" on public.moderator_roles;
create policy "moderator_roles read by staff"
  on public.moderator_roles
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
    )
  );

drop policy if exists "moderator_roles write by admin" on public.moderator_roles;
create policy "moderator_roles write by admin"
  on public.moderator_roles
  for all
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
  );

create index if not exists moderator_roles_user_idx on public.moderator_roles(user_id);
create index if not exists moderator_roles_role_idx on public.moderator_roles(role);

-- ---------------------------------------------------------------------------
-- 2. Moderation audit log
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply', 'user', 'report', 'appeal', 'staff_role')),
  target_id uuid not null,
  action text not null,
  details jsonb,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

alter table public.moderation_audit_log enable row level security;

drop policy if exists "moderation_audit_log read by staff" on public.moderation_audit_log;
create policy "moderation_audit_log read by staff"
  on public.moderation_audit_log
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
    )
  );

-- Audit logs are append-only: no insert/update/delete policies for clients.
-- Server-side functions handle inserts with service-role privileges.
create index if not exists moderation_audit_log_actor_idx on public.moderation_audit_log(actor_id, created_at desc);
create index if not exists moderation_audit_log_target_idx on public.moderation_audit_log(target_type, target_id);
create index if not exists moderation_audit_log_created_idx on public.moderation_audit_log(created_at desc);

-- ---------------------------------------------------------------------------
-- 3. User enforcement records
-- ---------------------------------------------------------------------------
create table if not exists public.user_enforcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('warning', 'suspension', 'ban', 'restriction')),
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  revoked_reason text
);

alter table public.user_enforcements enable row level security;

drop policy if exists "user_enforcements read by staff" on public.user_enforcements;
create policy "user_enforcements read by staff"
  on public.user_enforcements
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
    )
  );

drop policy if exists "user_enforcements write by senior+" on public.user_enforcements;
create policy "user_enforcements write by senior+"
  on public.user_enforcements
  for all
  to authenticated
  using (
    exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
        and mr.role in ('senior_moderator', 'administrator')
    )
  )
  with check (
    exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
        and mr.role in ('senior_moderator', 'administrator')
    )
  );

create index if not exists user_enforcements_user_idx on public.user_enforcements(user_id);
create index if not exists user_enforcements_type_idx on public.user_enforcements(type);
create index if not exists user_enforcements_created_idx on public.user_enforcements(created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Appeals
-- ---------------------------------------------------------------------------
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.reports(id) on delete cascade,
  enforcement_type text check (enforcement_type in ('warning', 'suspension', 'ban', 'restriction', 'content_removal')),
  enforcement_id uuid,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  response_message text,
  created_at timestamptz not null default now(),
  unique (user_id, enforcement_type, enforcement_id)
);

alter table public.appeals enable row level security;

drop policy if exists "appeals read by staff" on public.appeals;
create policy "appeals read by staff"
  on public.appeals
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
    )
  );

drop policy if exists "appeals insert own" on public.appeals;
create policy "appeals insert own"
  on public.appeals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "appeals update by staff" on public.appeals;
create policy "appeals update by staff"
  on public.appeals
  for update
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
    )
  )
  with check (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
    )
  );

create index if not exists appeals_user_idx on public.appeals(user_id);
create index if not exists appeals_status_idx on public.appeals(status);
create index if not exists appeals_created_idx on public.appeals(created_at desc);

-- ---------------------------------------------------------------------------
-- 5. RPC: check if user has a moderator role at or above a given level
-- ---------------------------------------------------------------------------
create or replace function public.has_moderator_role(
  p_user_id uuid,
  p_min_role text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  -- Administrators (app_metadata claim) implicitly have all roles.
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true' then
    return true;
  end if;

  select role into v_role
  from public.moderator_roles
  where user_id = p_user_id
  limit 1;

  if v_role is null then
    return false;
  end if;

  -- Role hierarchy: moderator < senior_moderator < administrator
  if p_min_role = 'moderator' then
    return v_role in ('moderator', 'senior_moderator', 'administrator');
  elsif p_min_role = 'senior_moderator' then
    return v_role in ('senior_moderator', 'administrator');
  elsif p_min_role = 'administrator' then
    return v_role = 'administrator';
  end if;

  return false;
end;
$$;

revoke all on function public.has_moderator_role(uuid, text) from public, anon;
grant execute on function public.has_moderator_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: record a moderation audit log entry
-- ---------------------------------------------------------------------------
create or replace function public.record_moderation_action(
  p_actor_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_action text,
  p_details jsonb,
  p_before_state jsonb,
  p_after_state jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_action_id uuid;
begin
  insert into public.moderation_audit_log (
    actor_id, target_type, target_id, action, details,
    before_state, after_state, created_at
  )
  values (
    p_actor_id, p_target_type, p_target_id, p_action, p_details,
    p_before_state, p_after_state, now()
  )
  returning id into v_action_id;

  return v_action_id;
end;
$$;

revoke all on function public.record_moderation_action(uuid, text, uuid, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_moderation_action(uuid, text, uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
comment on table public.moderator_roles is 'Moderator role assignments: moderator, senior_moderator, administrator.';
comment on table public.moderation_audit_log is 'Append-only audit log of all moderation actions.';
comment on table public.user_enforcements is 'User enforcement records: warnings, suspensions, bans, restrictions.';
comment on table public.appeals is 'User appeals against enforcement decisions.';
comment on function public.has_moderator_role(uuid, text) is 'Checks whether a user has a moderator role at or above the given level.';
comment on function public.record_moderation_action(uuid, text, uuid, text, jsonb, jsonb, jsonb) is 'Records a moderation action in the audit log (security definer).';
