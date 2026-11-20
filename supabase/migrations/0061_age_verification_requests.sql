-- Age verification requests: a human-in-the-loop verification workflow.
--
-- Replaces the signup self-declaration checkbox with a real, server-side
-- verification gate. A user may submit a request; only a trusted staff member
-- (moderator+) may approve or reject it. Only approval sets
-- profiles.age_verified = true. The client can never write that column.
--
-- No external verification provider is integrated. This is a manual staff
-- verification process backed by the existing moderation audit log. When a
-- third-party provider is configured (credentials supplied by the operator),
-- the same request table is used; the provider result is recorded as evidence
-- and the staff decision remains the final gate.

create table if not exists public.age_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references public.profiles(id) on delete set null,
  review_note text,
  evidence jsonb
);

alter table public.age_verification_requests enable row level security;

-- Users can read their own requests; staff can read all.
create policy "age_verification_requests read own or staff"
  on public.age_verification_requests
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

-- Only the requesting user may insert (their own row). No self-update: status
-- changes are server-side only, enforced by the API routes.
create policy "age_verification_requests insert own"
  on public.age_verification_requests
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Staff-only update (enforced server-side via requireModeratorRole; the policy
-- is a defense-in-depth backstop, not the primary control).
create policy "age_verification_requests update by staff"
  on public.age_verification_requests
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

create index if not exists age_verification_requests_user_idx on public.age_verification_requests(user_id);
create index if not exists age_verification_requests_status_idx on public.age_verification_requests(status);
create index if not exists age_verification_requests_reviewer_idx on public.age_verification_requests(reviewer_id);

comment on table public.age_verification_requests is 'Age verification requests: pending/approved/rejected. Only staff approval sets profiles.age_verified.';
comment on column public.age_verification_requests.evidence is 'Optional verification evidence (provider result, document reference). Never stores raw identity documents.';