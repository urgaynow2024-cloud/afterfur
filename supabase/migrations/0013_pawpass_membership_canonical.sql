-- PawPass canonical membership model: sources, owner test access, free grants,
-- founding reward and provider-neutral plan foundations.
-- Depends on migrations 0001-0012.

-- 1. Canonical entitlement model extensions.
alter table public.pawpass_entitlements
  add column if not exists source text,
  add column if not exists plan_interval text,
  add column if not exists granted_by uuid references public.profiles(id) on delete set null,
  add column if not exists grant_reason text,
  add column if not exists test_expires_at timestamptz;

update public.pawpass_entitlements
  set source = 'paid'
  where source is null;

alter table public.pawpass_entitlements
  alter column source set not null,
  alter column provider drop not null,
  alter column provider_customer_id drop not null,
  alter column provider_subscription_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pawpass_entitlements_source_check') then
    alter table public.pawpass_entitlements
      add constraint pawpass_entitlements_source_check
      check (source in ('paid', 'founding_reward', 'owner_granted', 'owner_test'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pawpass_entitlements_plan_check') then
    alter table public.pawpass_entitlements
      add constraint pawpass_entitlements_plan_check
      check (plan_interval is null or plan_interval in ('monthly', 'yearly'));
  end if;
end $$;

-- 2. Founding reward claims (hard cap 50, one per account).
create table if not exists public.pawpass_founding_claims (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  source text not null default 'founding_reward'
    check (source = 'founding_reward')
);
create index if not exists pawpass_founding_claims_claimed_idx
  on public.pawpass_founding_claims(claimed_at);

-- 3. Membership audit log.
create table if not exists public.pawpass_membership_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  target_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  source text,
  details jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists pawpass_membership_audit_target_idx
  on public.pawpass_membership_audit(target_id, occurred_at desc);

-- 4. PawPass Prime badge registration.
insert into public.badge_registry (id, category, display_name, display_order)
values ('pawpass_prime', 'membership', 'PawPass Prime', 105)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

-- 5. RLS and grants.
alter table public.pawpass_founding_claims enable row level security;
alter table public.pawpass_membership_audit enable row level security;
revoke all on public.pawpass_founding_claims, public.pawpass_membership_audit from public, anon, authenticated;
grant select, insert, update, delete on public.pawpass_founding_claims, public.pawpass_membership_audit to service_role;

-- 6. Helper: server-authoritative Prime entitlement check.
create or replace function public.is_prime_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1 from public.pawpass_entitlements e
    where e.user_id = p_user_id
      and e.source in ('paid', 'founding_reward', 'owner_granted', 'owner_test')
      and e.status in ('active', 'cancel_at_period_end')
      and e.current_period_end is not null
      and e.current_period_end > now()
  );
$function$;
revoke all on function public.is_prime_member(uuid) from public, anon;
grant execute on function public.is_prime_member(uuid) to authenticated, service_role;

-- 7. Own membership status (source-aware).
create or replace function public.get_my_membership_status()
returns table(
  source text,
  plan_interval text,
  status text,
  eligible_since timestamptz,
  current_period_end timestamptz,
  is_test boolean,
  grant_reason text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select e.source, e.plan_interval, e.status, e.eligible_since, e.current_period_end,
         (e.source = 'owner_test') as is_test, e.grant_reason
  from public.pawpass_entitlements e
  where e.user_id = auth.uid();
$function$;
revoke all on function public.get_my_membership_status() from public, anon;
grant execute on function public.get_my_membership_status() to authenticated;

-- 8. Admin view of a target's membership.
create or replace function public.get_membership_for_admin(p_target_id uuid)
returns table(
  user_id uuid,
  source text,
  plan_interval text,
  status text,
  eligible_since timestamptz,
  current_period_end timestamptz,
  is_test boolean,
  granted_by uuid,
  grant_reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  if not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;
  return query
    select e.user_id, e.source, e.plan_interval, e.status, e.eligible_since, e.current_period_end,
           (e.source = 'owner_test') as is_test, e.granted_by, e.grant_reason
    from public.pawpass_entitlements e
    where e.user_id = p_target_id;
end;
$function$;
revoke all on function public.get_membership_for_admin(uuid) from public, anon;
grant execute on function public.get_membership_for_admin(uuid) to authenticated;

-- 9. Owner-only test Prime access.
create or replace function public.set_owner_test_prime(
  p_target_id uuid,
  p_active boolean,
  p_days integer default 30,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_end timestamptz;
begin
  perform public.require_afterfur_staff_admin();
  if p_target_id is null or not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;
  if p_active then
    if p_days is null or p_days < 1 or p_days > 365 then
      raise exception 'Test duration must be between 1 and 365 days' using errcode = '22023';
    end if;
    v_end := now() + make_interval(days => p_days);
    insert into public.pawpass_entitlements(
      user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id,
      status, eligible_since, current_period_end, status_changed_at, updated_at,
      granted_by, grant_reason, test_expires_at
    ) values (
      p_target_id, 'owner_test', null, 'afterfur', 'owner_test', 'owner_test_' || p_target_id::text,
      'active', now(), v_end, now(), now(), v_actor, coalesce(p_reason, 'Owner test access'), v_end
    )
    on conflict (user_id) do update set
      source = 'owner_test',
      plan_interval = null,
      provider = 'afterfur',
      provider_customer_id = 'owner_test',
      provider_subscription_id = 'owner_test_' || p_target_id::text,
      status = 'active',
      eligible_since = now(),
      current_period_end = v_end,
      status_changed_at = now(),
      updated_at = now(),
      granted_by = v_actor,
      grant_reason = coalesce(p_reason, 'Owner test access'),
      test_expires_at = v_end;
  else
    if not exists (select 1 from public.pawpass_entitlements where user_id = p_target_id and source = 'owner_test') then
      raise exception 'Target does not have an owner test entitlement' using errcode = '22023';
    end if;
    update public.pawpass_entitlements
      set status = 'expired',
          current_period_end = now(),
          status_changed_at = now(),
          updated_at = now(),
          test_expires_at = now()
      where user_id = p_target_id and source = 'owner_test';
  end if;
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_actor, p_target_id, case when p_active then 'owner_test_activate' else 'owner_test_deactivate' end,
            'owner_test', jsonb_build_object('days', p_days, 'reason', p_reason));
  return true;
end;
$function$;
revoke all on function public.set_owner_test_prime(uuid, boolean, integer, text) from public, anon;
grant execute on function public.set_owner_test_prime(uuid, boolean, integer, text) to authenticated;

-- 10. Owner-granted free memberships.
create or replace function public.grant_free_prime_membership(
  p_target_id uuid,
  p_months integer,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor uuid := auth.uid();
  v_end timestamptz;
begin
  perform public.require_afterfur_staff_admin();
  if p_target_id is null or not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'Target account not found' using errcode = '22023';
  end if;
  if p_months is null or p_months < 1 or p_months > 36 then
    raise exception 'Grant duration must be between 1 and 36 months' using errcode = '22023';
  end if;
  if exists (select 1 from public.pawpass_entitlements
             where user_id = p_target_id and source = 'paid'
               and status in ('active', 'cancel_at_period_end')
               and current_period_end is not null and current_period_end > now()) then
    raise exception 'Cannot grant a free membership over an active paid subscription' using errcode = '22023';
  end if;
  v_end := now() + make_interval(months => p_months);
  insert into public.pawpass_entitlements(
    user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id,
    status, eligible_since, current_period_end, status_changed_at, updated_at,
    granted_by, grant_reason, test_expires_at
  ) values (
    p_target_id, 'owner_granted', null, 'afterfur', 'owner_granted', 'owner_granted_' || p_target_id::text,
    'active', now(), v_end, now(), now(), v_actor, coalesce(p_reason, 'Owner-granted membership'), null
  )
  on conflict (user_id) do update set
    source = 'owner_granted',
    plan_interval = null,
    provider = 'afterfur',
    provider_customer_id = 'owner_granted',
    provider_subscription_id = 'owner_granted_' || p_target_id::text,
    status = 'active',
    eligible_since = now(),
    current_period_end = v_end,
    status_changed_at = now(),
    updated_at = now(),
    granted_by = v_actor,
    grant_reason = coalesce(p_reason, 'Owner-granted membership'),
    test_expires_at = null;
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_actor, p_target_id, 'grant_free_membership', 'owner_granted',
            jsonb_build_object('months', p_months, 'reason', p_reason));
  return true;
end;
$function$;
revoke all on function public.grant_free_prime_membership(uuid, integer, text) from public, anon;
grant execute on function public.grant_free_prime_membership(uuid, integer, text) to authenticated;

create or replace function public.revoke_free_prime_membership(
  p_target_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare v_actor uuid := auth.uid();
begin
  perform public.require_afterfur_staff_admin();
  if not exists (select 1 from public.pawpass_entitlements where user_id = p_target_id and source = 'owner_granted') then
    raise exception 'Target does not have an owner-granted membership' using errcode = '22023';
  end if;
  update public.pawpass_entitlements
    set status = 'expired',
        current_period_end = now(),
        status_changed_at = now(),
        updated_at = now()
    where user_id = p_target_id and source = 'owner_granted';
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_actor, p_target_id, 'revoke_free_membership', 'owner_granted', jsonb_build_object('reason', p_reason));
  return true;
end;
$function$;
revoke all on function public.revoke_free_prime_membership(uuid, text) from public, anon;
grant execute on function public.revoke_free_prime_membership(uuid, text) to authenticated;

-- 11. Founding reward claim (atomic, max 50).
create or replace function public.claim_founding_prime()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_expires timestamptz := now() + interval '12 months';
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'Account not found' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pawpass_founding_claims', 0));
  select count(*) into v_count from public.pawpass_founding_claims;
  if v_count >= 50 then
    raise exception 'All 50 founding rewards have been claimed' using errcode = '22023';
  end if;
  if exists (select 1 from public.pawpass_founding_claims where user_id = v_user) then
    raise exception 'Founding reward already claimed for this account' using errcode = '22023';
  end if;
  if exists (select 1 from public.pawpass_entitlements
             where user_id = v_user
               and status in ('active', 'cancel_at_period_end')
               and current_period_end is not null and current_period_end > now()) then
    raise exception 'Account already has an active membership' using errcode = '22023';
  end if;
  insert into public.pawpass_founding_claims(user_id, claimed_at, activated_at, expires_at)
    values (v_user, now(), now(), v_expires);
  insert into public.pawpass_entitlements(
    user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id,
    status, eligible_since, current_period_end, status_changed_at, updated_at,
    granted_by, grant_reason, test_expires_at
  ) values (
    v_user, 'founding_reward', null, 'afterfur', 'founding', 'founding_' || v_user::text,
    'active', now(), v_expires, now(), now(), v_user, 'Founding 50 reward', null
  )
  on conflict (user_id) do update set
    source = 'founding_reward',
    plan_interval = null,
    provider = 'afterfur',
    provider_customer_id = 'founding',
    provider_subscription_id = 'founding_' || v_user::text,
    status = 'active',
    eligible_since = now(),
    current_period_end = v_expires,
    status_changed_at = now(),
    updated_at = now(),
    grant_reason = 'Founding 50 reward';
  insert into public.pawpass_membership_audit(actor_id, target_id, action, source, details)
    values (v_user, v_user, 'claim_founding_reward', 'founding_reward', jsonb_build_object('expires_at', v_expires));
  return true;
end;
$function$;
revoke all on function public.claim_founding_prime() from public, anon;
grant execute on function public.claim_founding_prime() to authenticated;

create or replace function public.get_my_founding_status()
returns table(claimed boolean, claimed_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select true, c.claimed_at, c.expires_at
  from public.pawpass_founding_claims c
  where c.user_id = auth.uid()
  union all
  select false, null::timestamptz, null::timestamptz
  where not exists (select 1 from public.pawpass_founding_claims where user_id = auth.uid())
  limit 1;
$function$;
revoke all on function public.get_my_founding_status() from public, anon;
grant execute on function public.get_my_founding_status() to authenticated;

create or replace function public.get_founding_rewards_remaining()
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select greatest(0, 50 - (select count(*)::integer from public.pawpass_founding_claims));
$function$;
revoke all on function public.get_founding_rewards_remaining() from public;
grant execute on function public.get_founding_rewards_remaining() to anon, authenticated;

-- 12. Membership audit history for admins.
create or replace function public.get_membership_audit(p_target_id uuid default null, p_limit integer default 50)
returns table(id bigint, actor_id uuid, target_id uuid, action text, source text, details jsonb, occurred_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  return query
    select a.id, a.actor_id, a.target_id, a.action, a.source, a.details, a.occurred_at
    from public.pawpass_membership_audit a
    where p_target_id is null or a.target_id = p_target_id
    order by a.occurred_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$function$;
revoke all on function public.get_membership_audit(uuid, integer) from public, anon;
grant execute on function public.get_membership_audit(uuid, integer) to authenticated;

-- 13. Update get_public_badges to include PawPass Prime badge.
create or replace function public.get_public_badges(p_user_ids uuid[])
returns table(user_id uuid, badge_id text)
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user_id uuid; v_years integer; v_membership record; v_cutoff timestamptz;
begin
  if p_user_ids is null then return; end if;
  if cardinality(p_user_ids) > 100 then raise exception 'A maximum of 100 badge subjects may be requested'; end if;
  foreach v_user_id in array p_user_ids loop
    if v_user_id is null then continue; end if;
    select greatest(0, extract(year from age(now(), o.account_created_at))::integer)
      into v_years from public.badge_account_origins o where o.user_id = v_user_id;
    if v_years is not null and v_years > 0 then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
      select v_user_id, 'milestone_account_year_' || n, now()
      from generate_series(1, least(v_years, 50)) n
      on conflict (user_id, badge_id) do nothing;
    end if;
    select e.status, e.eligible_since, e.current_period_end, e.source into v_membership
      from public.pawpass_entitlements e where e.user_id = v_user_id;
    if v_membership.status in ('active', 'cancel_at_period_end') and v_membership.current_period_end is not null then
      v_cutoff := least(now(), v_membership.current_period_end);
      perform public.award_pawpass_months(v_user_id, v_membership.eligible_since, v_cutoff);
    end if;
  end loop;
   return query
     select s.user_id, s.badge_id from public.staff_badge_assignments s
     join public.badge_registry r on r.id = s.badge_id and r.is_public
     where s.user_id = any(p_user_ids)
     union
     select a.user_id, a.badge_id from public.user_badge_awards a
     join public.badge_registry r on r.id = a.badge_id and r.is_public
     where a.user_id = any(p_user_ids)
     union
     select e.user_id, 'pawpass_member'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_member' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now()
     union
     select e.user_id, 'pawpass_prime'::text from public.pawpass_entitlements e
     join public.badge_registry r on r.id = 'pawpass_prime' and r.is_public
     where e.user_id = any(p_user_ids)
       and e.status in ('active', 'cancel_at_period_end')
       and e.current_period_end is not null
       and e.current_period_end > now();
end;
$function$;

-- 14. Update process_pawpass_entitlement_event to set source paid and accept plan interval.
create or replace function public.process_pawpass_entitlement_event(
  p_user_id uuid, p_provider text, p_customer_id text, p_subscription_id text,
  p_event_id text, p_event_type text, p_status text,
  p_eligible_since timestamptz, p_current_period_end timestamptz, p_occurred_at timestamptz,
  p_plan_interval text default null
) returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_previous_status text; v_previous_changed timestamptz; v_previous_end timestamptz; v_eligible_since timestamptz; v_cutoff timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'Trusted billing service required' using errcode = '42501'; end if;
  if p_user_id is null or p_provider is null or p_customer_id is null or p_subscription_id is null
     or p_event_id is null or p_event_type is null or p_occurred_at is null or p_status is null
     or p_status not in ('active', 'cancel_at_period_end', 'past_due', 'expired', 'refunded')
     or p_eligible_since is null or (p_status in ('active', 'cancel_at_period_end') and p_current_period_end is null)
     or p_occurred_at > now() + interval '5 minutes' then raise exception 'Invalid verified PawPass event'; end if;
  if p_plan_interval is not null and p_plan_interval not in ('monthly', 'yearly') then raise exception 'Invalid plan interval'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  insert into public.pawpass_event_receipts(provider, provider_event_id, user_id, event_type)
    values (p_provider, p_event_id, p_user_id, p_event_type) on conflict do nothing;
  if not found then return false; end if;
  select e.status, e.status_changed_at, e.current_period_end into v_previous_status, v_previous_changed, v_previous_end from public.pawpass_entitlements e where e.user_id = p_user_id for update;
  if v_previous_changed is not null and p_occurred_at < v_previous_changed then return false; end if;
  if v_previous_status in ('active', 'cancel_at_period_end') and
     (p_status in ('past_due', 'expired') or v_previous_end < p_occurred_at) then
    v_cutoff := least(p_occurred_at, coalesce(v_previous_end, p_occurred_at));
    perform public.award_pawpass_months(p_user_id,
      (select eligible_since from public.pawpass_entitlements where user_id = p_user_id), v_cutoff);
  end if;
  v_eligible_since := case when v_previous_status in ('past_due', 'expired', 'refunded') or v_previous_end < p_occurred_at
    then p_occurred_at else coalesce((select eligible_since from public.pawpass_entitlements where user_id = p_user_id), p_eligible_since) end;
  insert into public.pawpass_entitlements(user_id, source, plan_interval, provider, provider_customer_id, provider_subscription_id, status, eligible_since, current_period_end, status_changed_at, updated_at)
    values (p_user_id, 'paid', coalesce(p_plan_interval, (select plan_interval from public.pawpass_entitlements where user_id=p_user_id)), p_provider, p_customer_id, p_subscription_id, p_status, v_eligible_since, p_current_period_end, p_occurred_at, now())
  on conflict (user_id) do update set source = 'paid', plan_interval = coalesce(excluded.plan_interval, public.pawpass_entitlements.plan_interval),
    provider = excluded.provider, provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id, status = excluded.status,
    eligible_since = v_eligible_since, current_period_end = excluded.current_period_end,
    status_changed_at = excluded.status_changed_at, updated_at = now();
  if p_status in ('active', 'cancel_at_period_end') and p_current_period_end > now() then
    v_cutoff := least(now(), p_current_period_end);
    perform public.award_pawpass_months(p_user_id, v_eligible_since, v_cutoff);
  elsif p_status = 'expired' then
    perform public.award_pawpass_months(p_user_id, v_eligible_since, least(now(), p_current_period_end));
  end if;
  return true;
end;
$function$;
revoke all on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text) to service_role;

comment on table public.pawpass_founding_claims is 'Founding 50 reward claims; max 50 enforced atomically in claim_founding_prime().';
comment on table public.pawpass_membership_audit is 'Auditable log of privileged membership changes.';
