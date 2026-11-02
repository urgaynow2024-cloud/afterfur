-- PawPass monthly discovery boosts (prepare only; do not execute without approval)

create table if not exists public.post_boosts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id, period_start)
);

create index if not exists post_boosts_user_period_idx on public.post_boosts(user_id, period_start);
create index if not exists post_boosts_post_idx on public.post_boosts(post_id);

alter table public.post_boosts enable row level security;

drop policy if exists "post_boosts owner read" on public.post_boosts;
create policy "post_boosts owner read" on public.post_boosts
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.consume_post_boost(p_post_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare
  v_user uuid := auth.uid();
  v_entitlement record;
  v_period_start date := date_trunc('month', now())::date;
  v_period_end date := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date;
  v_used integer;
  v_limit integer := 3;
  v_is_prime boolean := false;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.posts where id = p_post_id and author_id = v_user) then
    raise exception 'Post not found or not owned' using errcode = '22023';
  end if;
  select e.status, e.current_period_end, e.source into v_entitlement
  from public.pawpass_entitlements e
  where e.user_id = v_user
  order by e.current_period_end desc nulls last
  limit 1;
  if v_entitlement is null or v_entitlement.status not in ('active','cancel_at_period_end')
     or v_entitlement.current_period_end is null
     or v_entitlement.current_period_end::timestamptz <= now() then
    raise exception 'PawPass membership required' using errcode = '42501';
  end if;
  select count(*) into v_used from public.post_boosts
  where user_id = v_user and period_start = v_period_start;
  if v_used >= v_limit then
    raise exception 'No boosts remaining this month' using errcode = '22023';
  end if;
  insert into public.post_boosts(post_id, user_id, period_start, period_end)
    values (p_post_id, v_user, v_period_start, v_period_end)
    on conflict (post_id, user_id, period_start) do nothing;
  if not found then
    raise exception 'Boost already consumed for this post this month' using errcode = '22023';
  end if;
  return jsonb_build_object('consumed', true, 'used', v_used + 1, 'remaining', v_limit - v_used - 1, 'period_end', v_period_end);
end;
$function$;
revoke all on function public.consume_post_boost(uuid) from public, anon;
grant execute on function public.consume_post_boost(uuid) to authenticated;

create or replace function public.get_boost_allowance()
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare
  v_user uuid := auth.uid();
  v_period_start date := date_trunc('month', now())::date;
  v_period_end date := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date;
  v_used integer := 0;
  v_limit integer := 3;
  v_active boolean := false;
  v_entitlement record;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select e.status, e.current_period_end into v_entitlement
  from public.pawpass_entitlements e
  where e.user_id = v_user
  order by e.current_period_end desc nulls last
  limit 1;
  if v_entitlement is not null and v_entitlement.status in ('active','cancel_at_period_end')
     and v_entitlement.current_period_end is not null
     and v_entitlement.current_period_end::timestamptz > now() then
    v_active := true;
  end if;
  select count(*) into v_used from public.post_boosts where user_id = v_user and period_start = v_period_start;
  return jsonb_build_object('active', v_active, 'limit', v_limit, 'used', v_used, 'remaining', greatest(0, v_limit - v_used), 'period_end', v_period_end);
end;
$function$;
revoke all on function public.get_boost_allowance() from public, anon;
grant execute on function public.get_boost_allowance() to authenticated;
