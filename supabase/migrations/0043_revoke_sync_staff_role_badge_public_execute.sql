-- Revoke public/authenticated EXECUTE on sync_staff_role_badge; grant to service_role only.
--
-- Forward-only permission hardening migration. Does NOT modify the function
-- implementation, badge assignments, audit records, staff roles, or unrelated
-- permissions. Closes the direct-RPC privilege escalation path (audit finding C-1).
--
-- The staff management API (src/app/api/moderation/staff/route.ts) invokes this
-- RPC through createServerClient(), which uses SUPABASE_SERVICE_ROLE_KEY, so
-- service_role execution is preserved. Ordinary authenticated users can no
-- longer call the RPC directly.

revoke all on function public.sync_staff_role_badge(uuid, uuid, text, text) from public;
revoke all on function public.sync_staff_role_badge(uuid, uuid, text, text) from anon;
revoke all on function public.sync_staff_role_badge(uuid, uuid, text, text) from authenticated;

grant execute on function public.sync_staff_role_badge(uuid, uuid, text, text) to service_role;

comment on function public.sync_staff_role_badge(uuid,uuid,text,text) is
  'Syncs a staff badge with a moderator role change. Executable only by service_role; the staff management API enforces administrator authorization and passes the verified administrator id as p_actor_id. Direct authenticated invocation is revoked.';
