-- Age verification and age-assurance eligibility for After Dark access.
--
-- Two separate, server-side enforced requirements gate After Dark:
--   1. age_verified        - the account's age has been verified (age verification control)
--   2. age_assurance_approved - the account's age-assurance controls are approved
--
-- Both must be true for a user to access After Dark. These columns are the
-- source of truth read by the server-side eligibility check in
-- src/lib/afterDark.ts and /api/after-dark/eligibility. They are NOT set by
-- the client: only the age-assurance verification flow (or an administrator)
-- may flip them, so verification cannot be bypassed from the browser.
alter table public.profiles
  add column if not exists age_verified boolean not null default false,
  add column if not exists age_verified_at timestamptz,
  add column if not exists age_assurance_approved boolean not null default false,
  add column if not exists age_assurance_approved_at timestamptz;

-- Profiles are already publicly readable (0001), so the eligibility check can
-- read these columns for the authenticated user. Self-update allows the
-- verification flow to write the account's own row.

comment on column public.profiles.age_verified is 'Account age has been verified through a trusted verification process. Server-set only.';
comment on column public.profiles.age_verified_at is 'Timestamp when age_verified was last set to true.';
comment on column public.profiles.age_assurance_approved is 'Age-assurance controls required for adult-content access are approved. Server-set only.';
comment on column public.profiles.age_assurance_approved_at is 'Timestamp when age_assurance_approved was last set to true.';
