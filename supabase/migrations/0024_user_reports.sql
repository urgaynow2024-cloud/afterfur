-- User reports: report submission and persistence for posts, replies and accounts.
-- Depends on migrations 0001-0003 (profiles, posts, replies). Not applied to any
-- environment until the deployment target is confirmed as development.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'reply', 'user')),
  target_id uuid not null,
  reason text not null check (reason in (
    'harassment',
    'hate_speech',
    'threats_violence',
    'sexual_content',
    'illegal_exploitation',
    'spam_scam_impersonation',
    'copyright',
    'privacy_doxxing',
    'other'
  )),
  description text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),

  -- One report per reporter, per target, per reason. Repeat reports for the same
  -- target and reason are duplicates; staff handle follow-up outside this table.
  unique (reporter_id, target_type, target_id, reason)
);

create index if not exists reports_reporter_idx on public.reports(reporter_id, created_at desc);
create index if not exists reports_target_idx on public.reports(target_type, target_id);
create index if not exists reports_status_idx on public.reports(status);

alter table public.reports enable row level security;

drop policy if exists "reports insert own" on public.reports;
create policy "reports insert own"
  on public.reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "reports read own" on public.reports;
create policy "reports read own"
  on public.reports for select
  to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "reports staff read" on public.reports;
create policy "reports staff read"
  on public.reports for select
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true');

drop policy if exists "reports staff update" on public.reports;
create policy "reports staff update"
  on public.reports for update
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true')
  with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true');

-- Reporters read only their own reports; staff (verified app_metadata claim) read
-- and update all reports. Direct inserts are limited to the reporter's own rows,
-- and real target/reason validation happens in submit_report().

revoke all on public.reports from public, anon, authenticated;
grant select on public.reports to authenticated;

create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_description text
) returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required. Sign in to submit a report.'
      using errcode = '42501';
  end if;

  if p_target_type is null or p_target_type not in ('post', 'reply', 'user') then
    raise exception 'Invalid report target.' using errcode = '22P02';
  end if;

  if p_reason is null or p_reason not in (
    'harassment',
    'hate_speech',
    'threats_violence',
    'sexual_content',
    'illegal_exploitation',
    'spam_scam_impersonation',
    'copyright',
    'privacy_doxxing',
    'other'
  ) then
    raise exception 'Invalid report reason.' using errcode = '22P02';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Explanation is too long (maximum 1000 characters).' using errcode = '22023';
  end if;

  -- Confirm the target exists before accepting the report.
  if p_target_type = 'post' then
    perform 1 from public.posts where id = p_target_id;
  elsif p_target_type = 'reply' then
    perform 1 from public.replies where id = p_target_id;
  else
    perform 1 from public.profiles where id = p_target_id;
  end if;
  if not found then
    raise exception 'The post, reply or account you are reporting does not exist.'
      using errcode = '22P02';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, description)
  values (v_actor_id, p_target_type, p_target_id, p_reason, p_description)
  on conflict (reporter_id, target_type, target_id, reason) do nothing
  returning id into v_report_id;

  if not found then
    raise exception 'You have already submitted a report for this.' using errcode = '23505';
  end if;

  return v_report_id;
end;
$function$;

revoke all on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

comment on table public.reports is 'User-submitted reports of posts, replies and accounts. Reporter-private by default; staff-only status fields.';
comment on function public.submit_report(text, uuid, text, text) is 'Authenticated-only report submission. Validates target existence and reason, enforces one report per reporter per target per reason, and returns the new report id.';
