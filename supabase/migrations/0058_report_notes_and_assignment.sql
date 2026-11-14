-- 0058_report_notes_and_assignment.sql
-- Reports Management (Phase 2)
--
-- Adds:
--   1. reports.assigned_to / reports.assigned_at  - explicit report assignee,
--      kept separate from reviewed_by/reviewed_at (the moderator who resolved it).
--   2. public.report_notes - internal, staff-only moderator notes attached to a
--      report. Notes are deliberately NOT stored on reports.description, which
--      is the reporter-visible explanation. Notes are append-only.
--
-- Forward-only, idempotent, preserves existing data. Not applied to production
-- automatically; requires explicit deployment.

-- ---------------------------------------------------------------------------
-- 1. Assignment columns on reports
-- ---------------------------------------------------------------------------
alter table public.reports
  add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

alter table public.reports
  add column if not exists assigned_at timestamptz;

create index if not exists reports_assigned_to_idx on public.reports(assigned_to, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Internal moderator notes
-- ---------------------------------------------------------------------------
create table if not exists public.report_notes (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists report_notes_report_idx on public.report_notes(report_id, created_at);
create index if not exists report_notes_author_idx on public.report_notes(author_id, created_at desc);

alter table public.report_notes enable row level security;

-- Internal notes are readable only by staff (moderator role or admin claim).
-- This mirrors the staff-only policies used by reports / audit log.
drop policy if exists "report_notes read by staff" on public.report_notes;
create policy "report_notes read by staff"
  on public.report_notes
  for select
  to authenticated
  using (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
    )
  );

-- Staff may append notes. Authors may not edit or delete notes: the history is
-- part of the moderation record.
drop policy if exists "report_notes insert by staff" on public.report_notes;
create policy "report_notes insert by staff"
  on public.report_notes
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and (
      coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') = 'true'
      or exists (
        select 1 from public.moderator_roles mr
        where mr.user_id = auth.uid()
      )
    )
  );

-- Ordinary users must never be able to read or write internal notes.
revoke all on public.report_notes from public, anon;
grant select, insert on public.report_notes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Comments
-- ---------------------------------------------------------------------------
comment on table public.report_notes is
  'Internal, staff-only moderator notes attached to a report. Never exposed to reporters or ordinary users.';
comment on column public.report_notes.body is
  'Internal note body (1-2000 chars). Kept separate from reports.description, which is reporter-visible.';
comment on column public.reports.assigned_to is
  'Moderator currently assigned to investigate the report (distinct from reviewed_by, the resolving moderator).';
comment on column public.reports.assigned_at is
  'Timestamp when the report was assigned.';

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public' and table_name = 'reports'
    and column_name in ('assigned_to', 'assigned_at');
  if v_count <> 2 then
    raise exception 'reports missing assignment columns: found % of 2', v_count;
  end if;

  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'report_notes'
  ) then
    raise exception 'report_notes table missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'report_notes' and indexname = 'report_notes_report_idx'
  ) then
    raise exception 'report_notes_report_idx missing';
  end if;

  raise notice 'Reports management schema verified (assignment columns + report_notes)';
end;
$$;