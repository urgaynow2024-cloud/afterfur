-- Reconcile legacy `access_age_verified` badge assignments into the new
-- `profiles.age_verified` eligibility column.
--
-- Root cause: the After Dark eligibility check (src/lib/afterDark.ts) reads
-- `profiles.age_verified`, but the platform's existing age-verification record
-- was stored as the `access_age_verified` staff badge (granted through the
-- staff/badges admin panel via `manage_staff_badge`). That badge was never
-- synced into `profiles.age_verified`, so accounts that display "Age Verified"
-- were reported as ineligible by the new eligibility system.
--
-- This migration adds a server-side reconciliation function. It is
-- idempotent, auditable, and cannot be invoked by ordinary users: it is
-- `security definer`, `service_role`-only, and every change is written to
-- `moderation_audit_log` with the administrator who triggered it recorded as
-- the actor. It does NOT touch `age_assurance_approved` — that remains a
-- separate, independent gate that must still be approved.
--
-- Run once by an administrator through the reconciliation API
-- (/api/admin/age-verification/reconcile). It is safe to re-run: already
-- reconciled rows are skipped.

create or replace function public.reconcile_age_verified_badges(p_actor_id uuid)
returns table(user_id uuid, action text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_action text;
  v_now timestamptz := now();
begin
  -- Only reconcile users who hold the active `access_age_verified` badge and
  -- whose `profiles.age_verified` is not already true. Already-reconciled
  -- rows are skipped (idempotent).
  for v_user_id in
    select s.user_id
    from public.staff_badge_assignments s
    join public.badge_registry r on r.id = s.badge_id and r.is_public
    where s.badge_id = 'access_age_verified'
      and not exists (
        select 1 from public.profiles p
        where p.id = s.user_id and p.age_verified is true
      )
  loop
    update public.profiles
    set age_verified = true,
        age_verified_at = v_now
    where id = v_user_id;

    insert into public.moderation_audit_log (
      actor_id, target_type, target_id, action, details, before_state, after_state, created_at
    ) values (
      p_actor_id,
      'user',
      v_user_id,
      'age_verified_reconciled_from_badge',
      jsonb_build_object(
        'source', 'access_age_verified staff badge',
        'reason', 'Legacy age-verification badge was not reflected in profiles.age_verified.',
        'migration', '0063_age_verified_reconcile'
      ),
      jsonb_build_object('age_verified', false),
      jsonb_build_object('age_verified', true, 'age_verified_at', v_now),
      v_now
    );

    v_action := 'reconciled';
    return next;
  end loop;
end;
$function$;

revoke all on function public.reconcile_age_verified_badges(uuid) from public;
revoke all on function public.reconcile_age_verified_badges(uuid) from anon;
revoke all on function public.reconcile_age_verified_badges(uuid) from authenticated;
grant execute on function public.reconcile_age_verified_badges(uuid) to service_role;

comment on function public.reconcile_age_verified_badges(uuid) is
  'Reconciles legacy access_age_verified badge assignments into profiles.age_verified. Service-role only; auditable and idempotent. p_actor_id is the verified administrator who triggered the reconciliation. Does not touch age_assurance_approved.';