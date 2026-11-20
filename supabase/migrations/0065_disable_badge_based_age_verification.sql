-- Revoke badge-based age verification as a trusted source.
--
-- The previous reconciliation (0063) treated the `access_age_verified` staff
-- badge as proof of age verification. That is unsafe because staff badges can
-- be manually assigned and are not independent verification evidence.
--
-- This migration permanently disables the badge-based reconciliation function
-- so it can no longer be invoked to set profiles.age_verified. Age verification
-- must instead be granted through a staff-approved age-verification request or
-- a trusted provider integration.
drop function if exists public.reconcile_age_verified_badges(uuid);

comment on table public.profiles is 'Age verification (age_verified) may only be set via staff-approved age-verification requests or trusted providers, never via badge reconciliation.';
EOF