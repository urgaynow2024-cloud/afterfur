-- Fix check_rate_limit() volatility: the function performs DELETE, UPDATE and INSERT
-- on public.rate_limits, so it must be VOLATILE. Declaring it STABLE caused
-- PostgreSQL to reject the operations with:
--   "DELETE is not allowed in a non-volatile function"
--   (error code 0A000)
--
-- This is an additive migration: it replaces the function defined in
-- 0045_enforcement_and_rate_limiting.sql with an identical implementation
-- corrected to VOLATILE. All rate-limit counting, cleanup, atomicity,
-- SECURITY DEFINER, search_path, EXECUTE grants and RLS protections are
-- preserved unchanged.

create or replace function public.check_rate_limit(
  p_identifier text,
  p_endpoint text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
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
  'Database-backed fixed-window rate limiter. Returns true if the request is within the limit, false if rate limited. Volatile because it modifies public.rate_limits (DELETE/UPDATE/INSERT) and reads now().';