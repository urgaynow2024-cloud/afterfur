-- Age-assurance requests: separate approval workflow for adult-content controls.
--
-- After Dark requires BOTH age_verified AND age_assurance_approved. This table
-- is the second, independent gate. A user may submit a request after their age
-- is verified; only a staff member (moderator+) may approve or reject it. Only
-- approval sets profiles.age_assurance_approved = true. The client can never
-- write that column.
--
-- A request may be submitted only when the user's age is already verified, so
-- the two controls cannot be approved out of order.

create table if not exists public.age_assurance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  evidence jsonb
);

alter table public.age_assurance_requests enable row level security;

-- Users can read their own requests; staff can read all.
create policy "age_assurance_requests read own or staff"
  on public.age_assurance_requests
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
        and mr.role in ('moderator', 'senior_moderator', 'administrator')
    )
  );

-- Only the requesting user may insert (their own row), and only when their age
-- is already verified (enforced server-side; the policy is a backstop).
create policy "age_assurance_requests insert own"
  on public.age_assurance_requests
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Staff-only update (enforced server-side via requireModeratorRole).
create policy "age_assurance_requests update by staff"
  on public.age_assurance_requests
  for update
  to authenticated
  using (
    exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
        and mr.role in ('moderator', 'senior_moderator', 'administrator')
    )
  )
  with check (
    exists (
      select 1 from public.moderator_roles mr
      where mr.user_id = auth.uid()
        and mr.role in ('moderator', 'senior_moderator', 'administrator')
    )
  );

create index if not exists age_assurance_requests_user_idx on public.age_assurance_requests(user_id);
create index if not exists age_assurance_requests_status_idx on public.age_assurance_requests(status);
create index if not exists age_assurance_requests_reviewer_idx on public.age_assurance_requests(reviewer_id);

comment on table public.age_assurance_requests is 'Age-assurance approval requests: pending/approved/rejected. Only staff approval sets profiles.age_assurance_approved.';
comment on column public.age_assurance_requests.evidence is 'Optional approval evidence. Never stores raw identity documents.';