-- Harden rate_limits table privileges (production finding: anon/authenticated over-granted).
--
-- Migration 0045 created public.rate_limits with RLS and a service_role-only policy,
-- and restricted check_rate_limit() EXECUTE, but did not explicitly revoke direct
-- table privileges. In Supabase, schema/table grants can allow anon/authenticated
-- roles to attempt direct access; defense-in-depth requires removing those grants.
--
-- Application access pattern (verified locally): rate limiting uses the
-- public.check_rate_limit RPC via the server-side service-role client. No
-- application code reads/writes public.rate_limits directly.
--
-- This migration is idempotent and forward-only. It does not modify data,
-- weaken RLS, or change check_rate_limit behavior.
--
-- Production-impacting permission changes require explicit approval before
-- applying this migration outside local development.

-- Remove direct table privileges from broad roles. service_role retains access
-- needed for server-side operations and maintenance.
revoke all privileges on table public.rate_limits from public;
revoke all privileges on table public.rate_limits from anon;
revoke all privileges on table public.rate_limits from authenticated;

-- Preserve explicit service-role access (RLS policy also scopes service_role).
grant select, insert, update, delete on table public.rate_limits to service_role;

-- Verification (read-only; run after apply in an approved environment):
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'rate_limits'
--   order by grantee, privilege_type;
-- Expected: no anon/authenticated rows; service_role may have table privileges;
-- direct client access remains blocked by missing grants and RLS.
--
-- Manual rollback only if explicitly required (not recommended):
--   grant select, insert, update, delete on table public.rate_limits to authenticated;
--   grant select, insert, update, delete on table public.rate_limits to anon;
