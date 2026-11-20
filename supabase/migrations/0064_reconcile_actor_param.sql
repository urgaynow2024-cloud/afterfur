-- Replace reconcile_age_verified_badges() with the actor-aware variant.
--
-- The original 0063 migration created the function with no parameters and
-- inserted audit rows with actor_id = NULL, which violates the NOT NULL
-- constraint on moderation_audit_log.actor_id. This migration drops the old
-- signature and replaces it with reconcile_age_verified_badges(p_actor_id uuid)
-- so the administrator who triggers reconciliation is recorded as the actor.
--
-- No data is lost: the function is idempotent and only touches accounts whose
-- profiles.age_verified is not already true while they hold the active
-- access_age_verified badge.

drop function if exists public.reconcile_age_verified_badges();

create or replace function public.reconcile_age_verified_badges(p_actor_id uuid)
returns table(user_id uuid, action text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare
  v_user_id uuid;
  v_action text;
  v_now timestamptz := now();
begin
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