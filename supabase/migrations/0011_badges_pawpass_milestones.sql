-- Badge registry, protected staff roles, verified PawPass entitlement history,
-- and data-backed milestone awards. Depends on migrations 0001-0003.

create table if not exists public.badge_registry (
  id text primary key,
  category text not null check (category in ('staff', 'membership', 'milestone')),
  display_name text not null,
  display_order integer not null unique,
  is_public boolean not null default true
);

insert into public.badge_registry (id, category, display_name, display_order) values
  ('staff_founder', 'staff', 'Founder', 10),
  ('staff_moderator', 'staff', 'Moderator', 20),
  ('staff_developer', 'staff', 'Developer', 30),
  ('staff_tester', 'staff', 'Tester', 40),
  ('pawpass_month_1', 'membership', 'PawPass Month 1', 110),
  ('pawpass_month_2', 'membership', 'PawPass Month 2', 120),
  ('pawpass_month_3', 'membership', 'PawPass Month 3', 130),
  ('pawpass_month_4', 'membership', 'PawPass Month 4', 140),
  ('pawpass_month_5', 'membership', 'PawPass Month 5', 150),
  ('pawpass_month_6', 'membership', 'PawPass Month 6', 160),
  ('pawpass_month_7', 'membership', 'PawPass Month 7', 170),
  ('pawpass_month_8', 'membership', 'PawPass Month 8', 180),
  ('pawpass_month_9', 'membership', 'PawPass Month 9', 190),
  ('pawpass_month_10', 'membership', 'PawPass Month 10', 200),
  ('pawpass_month_11', 'membership', 'PawPass Month 11', 210),
  ('pawpass_month_12', 'membership', 'PawPass Month 12', 220),
  ('milestone_first_post', 'milestone', 'First post', 300)
on conflict (id) do update set category = excluded.category, display_name = excluded.display_name, display_order = excluded.display_order;

insert into public.badge_registry (id, category, display_name, display_order)
select 'pawpass_year_' || year_number,
       'membership',
       'PawPass Year ' || year_number,
       500 + year_number
from generate_series(1, 50) as year_number
on conflict (id) do nothing;

insert into public.badge_registry (id, category, display_name, display_order)
select 'milestone_account_year_' || year_number,
       'milestone',
       'Account anniversary ' || year_number,
       1000 + year_number
from generate_series(1, 50) as year_number
on conflict (id) do nothing;

create table if not exists public.staff_badge_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badge_registry(id),
  assigned_by uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, badge_id),
  check (badge_id in ('staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester'))
);

create table if not exists public.staff_badge_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  badge_id text not null references public.badge_registry(id),
  action text not null check (action in ('grant', 'revoke')),
  occurred_at timestamptz not null default now()
);
create index if not exists staff_badge_audit_target_idx on public.staff_badge_audit(target_id, occurred_at desc);

create table if not exists public.user_badge_awards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badge_registry(id),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index if not exists user_badge_awards_user_idx on public.user_badge_awards(user_id, awarded_at desc);

-- Source account age from auth.users, not the profile row users can update.
create table if not exists public.badge_account_origins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_created_at timestamptz not null
);
insert into public.badge_account_origins(user_id, account_created_at)
select id, created_at from auth.users
on conflict (user_id) do nothing;

create or replace function public.capture_badge_account_origin()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $function$
begin
  insert into public.badge_account_origins(user_id, account_created_at)
  values (new.id, new.created_at) on conflict (user_id) do nothing;
  return new;
end;
$function$;
drop trigger if exists capture_badge_account_origin on auth.users;
create trigger capture_badge_account_origin after insert on auth.users
for each row execute function public.capture_badge_account_origin();

-- Existing profile rows are paired to their real first-post timestamp as a one-time backfill.
insert into public.user_badge_awards(user_id, badge_id, awarded_at)
select author_id, 'milestone_first_post', min(coalesce(created_at, now()))
from public.posts group by author_id
on conflict (user_id, badge_id) do nothing;

create or replace function public.award_first_post_badge()
returns trigger language plpgsql security definer set search_path = pg_catalog, public
as $function$
begin
  insert into public.user_badge_awards(user_id, badge_id, awarded_at)
  values (new.author_id, 'milestone_first_post', coalesce(new.created_at, now()))
  on conflict (user_id, badge_id) do nothing;
  return new;
end;
$function$;
drop trigger if exists award_first_post_badge on public.posts;
create trigger award_first_post_badge after insert on public.posts
for each row execute function public.award_first_post_badge();

-- Staff assignments and all entitlement/security tables are hidden behind narrow RPCs.
create table if not exists public.pawpass_entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  provider_subscription_id text not null unique,
  status text not null check (status in ('active', 'cancel_at_period_end', 'past_due', 'expired', 'refunded')),
  eligible_since timestamptz not null,
  current_period_end timestamptz,
  status_changed_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.pawpass_event_receipts (
  provider text not null,
  provider_event_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  processed_at timestamptz not null default now(),
  primary key(provider, provider_event_id)
);
create index if not exists pawpass_event_user_idx on public.pawpass_event_receipts(user_id, processed_at desc);

alter table public.badge_registry enable row level security;
alter table public.staff_badge_assignments enable row level security;
alter table public.staff_badge_audit enable row level security;
alter table public.user_badge_awards enable row level security;
alter table public.badge_account_origins enable row level security;
alter table public.pawpass_entitlements enable row level security;
alter table public.pawpass_event_receipts enable row level security;
revoke all on public.badge_registry, public.staff_badge_assignments, public.staff_badge_audit,
  public.user_badge_awards, public.badge_account_origins, public.pawpass_entitlements,
  public.pawpass_event_receipts from public, anon, authenticated;
grant select, insert, update, delete on public.badge_registry, public.staff_badge_assignments,
  public.staff_badge_audit, public.user_badge_awards, public.badge_account_origins,
  public.pawpass_entitlements, public.pawpass_event_receipts to service_role;

create or replace function public.require_afterfur_staff_admin()
returns void language plpgsql stable security definer set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null or coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff administrator access required' using errcode = '42501';
  end if;
end;
$function$;
revoke all on function public.require_afterfur_staff_admin() from public, anon, authenticated;

create or replace function public.search_staff_badge_targets(p_query text)
returns table(user_id uuid, username text, display_name text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  if length(btrim(coalesce(p_query, ''))) < 2 then return; end if;
  return query select p.id, p.username, p.display_name
    from public.profiles p
    where p.username ilike '%' || btrim(p_query) || '%'
       or coalesce(p.display_name, '') ilike '%' || btrim(p_query) || '%'
    order by p.username limit 20;
end;
$function$;
revoke all on function public.search_staff_badge_targets(text) from public, anon;
grant execute on function public.search_staff_badge_targets(text) to authenticated;

create or replace function public.get_staff_badges_for_admin(p_target_id uuid)
returns table(badge_id text)
language plpgsql stable security definer set search_path = pg_catalog, public
as $function$
begin
  perform public.require_afterfur_staff_admin();
  return query select s.badge_id from public.staff_badge_assignments s where s.user_id = p_target_id order by s.badge_id;
end;
$function$;
revoke all on function public.get_staff_badges_for_admin(uuid) from public, anon;
grant execute on function public.get_staff_badges_for_admin(uuid) to authenticated;

create or replace function public.manage_staff_badge(p_target_id uuid, p_badge_id text, p_action text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_actor_id uuid := auth.uid();
begin
  perform public.require_afterfur_staff_admin();
  -- Verified platform owners (identified by afterfur_staff_admin claim) may
  -- self-assign staff badges. Non-owner administrators cannot self-assign.
  -- Since require_afterfur_staff_admin() already enforces the admin claim,
  -- this guard only blocks self-assignment for any future non-admin caller.
  if v_actor_id = p_target_id and coalesce(auth.jwt() -> 'app_metadata' ->> 'afterfur_staff_admin', 'false') <> 'true' then
    raise exception 'Staff badges cannot be assigned to yourself' using errcode = '42501';
  end if;
  if p_badge_id not in ('staff_founder', 'staff_moderator', 'staff_developer', 'staff_tester') then raise exception 'Unknown staff badge'; end if;
  if p_action not in ('grant', 'revoke') then raise exception 'Action must be grant or revoke'; end if;
  if not exists(select 1 from public.profiles where id = p_target_id) then raise exception 'Target account not found'; end if;
  if p_action = 'grant' then
    insert into public.staff_badge_assignments(user_id, badge_id, assigned_by)
      values (p_target_id, p_badge_id, v_actor_id) on conflict (user_id, badge_id) do nothing;
    if not found then return false; end if;
  else
    delete from public.staff_badge_assignments where user_id = p_target_id and badge_id = p_badge_id;
    if not found then return false; end if;
  end if;
  insert into public.staff_badge_audit(actor_id, target_id, badge_id, action)
    values (v_actor_id, p_target_id, p_badge_id, p_action);
  return true;
end;
$function$;
revoke all on function public.manage_staff_badge(uuid, text, text) from public, anon;
grant execute on function public.manage_staff_badge(uuid, text, text) to authenticated;

-- Safe public projection: returns only badge identifiers explicitly marked public.
-- The protected staff assignments, audit log, and billing records are never exposed.
create or replace function public.award_pawpass_months(p_user_id uuid, p_eligible_since timestamptz, p_cutoff timestamptz)
returns void language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_month integer; v_year integer;
begin
  if p_user_id is null or p_eligible_since is null or p_cutoff is null then return; end if;
  for v_month in 1..12 loop
    if p_cutoff >= p_eligible_since + make_interval(months => v_month) then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
        values (p_user_id, 'pawpass_month_' || v_month, p_eligible_since + make_interval(months => v_month))
        on conflict (user_id, badge_id) do nothing;
    end if;
  end loop;
  for v_year in 1..50 loop
    if p_cutoff >= p_eligible_since + make_interval(years => v_year) then
      insert into public.user_badge_awards(user_id, badge_id, awarded_at)
        values (p_user_id, 'pawpass_year_' || v_year, p_eligible_since + make_interval(years => v_year))
        on conflict (user_id, badge_id) do nothing;
    end if;
  end loop;
end;
$function$;
revoke all on function public.award_pawpass_months(uuid,timestamptz,timestamptz) from public, anon, authenticated;

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
    select e.status, e.eligible_since, e.current_period_end into v_membership
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
    where a.user_id = any(p_user_ids);
end;
$function$;
revoke all on function public.get_public_badges(uuid[]) from public;
grant execute on function public.get_public_badges(uuid[]) to anon, authenticated;

-- The trusted billing webhook calls this only after verifying the provider signature.
-- Eligible time is continuous: a past-due/expired/refunded gap starts a fresh tenure
-- on reactivation. Cancellation remains eligible only through paid current_period_end.
create or replace function public.process_pawpass_entitlement_event(
  p_user_id uuid, p_provider text, p_customer_id text, p_subscription_id text,
  p_event_id text, p_event_type text, p_status text,
  p_eligible_since timestamptz, p_current_period_end timestamptz, p_occurred_at timestamptz
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
  insert into public.pawpass_entitlements(user_id, provider, provider_customer_id, provider_subscription_id, status, eligible_since, current_period_end, status_changed_at, updated_at)
    values (p_user_id, p_provider, p_customer_id, p_subscription_id, p_status, v_eligible_since, p_current_period_end, p_occurred_at, now())
  on conflict (user_id) do update set provider = excluded.provider, provider_customer_id = excluded.provider_customer_id,
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
revoke all on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz) to service_role;

create or replace function public.get_my_pawpass_entitlement()
returns table(is_active boolean, status text, current_period_end timestamptz)
language sql stable security definer set search_path = pg_catalog, public
as $function$
  select (e.status in ('active', 'cancel_at_period_end') and e.current_period_end > now()), e.status, e.current_period_end
  from public.pawpass_entitlements e where e.user_id = auth.uid();
$function$;
revoke all on function public.get_my_pawpass_entitlement() from public, anon;
grant execute on function public.get_my_pawpass_entitlement() to authenticated;

comment on table public.staff_badge_assignments is 'Private staff badge assignments; public identity badges are exposed only by get_public_badges.';
comment on table public.staff_badge_audit is 'Private append-only audit of administrator staff badge changes.';
comment on table public.pawpass_entitlements is 'Private trusted-provider entitlement state. Client writes are forbidden.';
comment on function public.process_pawpass_entitlement_event(uuid,text,text,text,text,text,text,timestamptz,timestamptz,timestamptz) is 'Service-role only. Call only after verifying billing provider webhook authenticity; event IDs make retries idempotent.';
comment on function public.manage_staff_badge(uuid,text,text) is 'Requires trusted auth.users app_metadata.afterfur_staff_admin=true; administrators cannot self-assign badges.';
