-- Stage 45: Ban/suspension enforcement on replies and rate limiting infrastructure
--
-- 1. Enforce active bans/suspensions from user_enforcements on replies INSERT,
--    UPDATE, and DELETE so banned/suspended users cannot create or modify replies.
--
-- 2. Create `rate_limits` table and `check_rate_limit()` function for
--    database-backed, multi-instance-safe rate limiting.
--
-- Forward-only: does not delete data.

-- ---------------------------------------------------------------------------
-- 0. Replies: add enforcement check to insert/update/delete policies.
-- ---------------------------------------------------------------------------
drop policy if exists "replies insert own" on public.replies;
create policy "replies insert own" on public.replies
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
  );

drop policy if exists "replies update own" on public.replies;
create policy "replies update own" on public.replies
  for update
  to authenticated
  using (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
  )
  with check (auth.uid() = author_id);

drop policy if exists "replies delete own" on public.replies;
create policy "replies delete own" on public.replies
  for delete
  to authenticated
  using (
    auth.uid() = author_id
    and not public.is_user_enforced(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 1. Rate limits table (database-backed, multi-instance safe).
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  endpoint text not null,
  count integer not null default 0,
  window_start timestamptz not null default now(),
  unique (identifier, endpoint)
);

alter table public.rate_limits enable row level security;

drop policy if exists "rate_limits service only" on public.rate_limits;
create policy "rate_limits service only" on public.rate_limits
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists rate_limits_identifier_endpoint_idx on public.rate_limits(identifier, endpoint);
create index if not exists rate_limits_window_start_idx on public.rate_limits(window_start);

-- ---------------------------------------------------------------------------
-- 2. check_rate_limit() function.
--    Returns true if the request is allowed, false if rate limited.
--    Uses a fixed-window counter stored in the database.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_window_start timestamptz;
  v_count integer;
  v_now timestamptz := now();
begin
  if p_limit <= 0 then
    return true;
  end if;

  -- Fixed-window start: floor(epoch / window_seconds) * window_seconds
  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);

  -- Clean up expired windows for this endpoint (best effort).
  delete from public.rate_limits
  where endpoint = p_endpoint
    and window_start < v_now - interval '1 hour';

  -- Try to increment the existing counter for this window.
  update public.rate_limits
  set count = count + 1
  where identifier = p_identifier
    and endpoint = p_endpoint
    and window_start = v_window_start
  returning count into v_count;

  if v_count is not null then
    return v_count <= p_limit;
  end if;

  -- No existing row for this window: insert with count = 1.
  insert into public.rate_limits (identifier, endpoint, count, window_start)
  values (p_identifier, p_endpoint, 1, v_window_start)
  on conflict (identifier, endpoint) do update
  set count = 1, window_start = v_window_start
  where rate_limits.window_start < v_window_start
  returning count into v_count;

  if v_count is null then
    -- Another transaction inserted first; re-read.
    select count into v_count
    from public.rate_limits
    where identifier = p_identifier
      and endpoint = p_endpoint
      and window_start = v_window_start;
  end if;

  return v_count is null or v_count <= p_limit;
end;
$function$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, text, integer, integer) to authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

comment on function public.check_rate_limit(text, text, integer, integer) is
  'Database-backed fixed-window rate limiter. Returns true if the request is within the limit, false if rate limited.';
