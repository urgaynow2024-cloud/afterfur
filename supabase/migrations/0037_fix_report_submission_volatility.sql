-- Fix report submission volatility: submit_report() performs an INSERT into
-- public.reports and reads auth.uid(), so it must be VOLATILE. Declaring it
-- STABLE caused PostgreSQL to reject the INSERT with:
--   "INSERT is not allowed in a non-volatile function"
--
-- This is an additive migration: it replaces the function defined in
-- 0024_user_reports.sql with an identical implementation corrected to VOLATILE.
-- All validation, duplicate-report prevention, authentication, anonymity and
-- RLS protections are preserved unchanged.

create or replace function public.submit_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_description text
) returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_report_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required. Sign in to submit a report.'
      using errcode = '42501';
  end if;

  if p_target_type is null or p_target_type not in ('post', 'reply', 'user') then
    raise exception 'Invalid report target.' using errcode = '22P02';
  end if;

  if p_reason is null or p_reason not in (
    'harassment',
    'hate_speech',
    'threats_violence',
    'sexual_content',
    'illegal_exploitation',
    'spam_scam_impersonation',
    'copyright',
    'privacy_doxxing',
    'other'
  ) then
    raise exception 'Invalid report reason.' using errcode = '22P02';
  end if;

  if p_description is not null and char_length(p_description) > 1000 then
    raise exception 'Explanation is too long (maximum 1000 characters).' using errcode = '22023';
  end if;

  -- Confirm the target exists before accepting the report.
  if p_target_type = 'post' then
    perform 1 from public.posts where id = p_target_id;
  elsif p_target_type = 'reply' then
    perform 1 from public.replies where id = p_target_id;
  else
    perform 1 from public.profiles where id = p_target_id;
  end if;
  if not found then
    raise exception 'The post, reply or account you are reporting does not exist.'
      using errcode = '22P02';
  end if;

  -- reporter_id is derived from auth.uid() (the authenticated actor). Clients
  -- cannot supply or manipulate a reporter identity.
  insert into public.reports (reporter_id, target_type, target_id, reason, description)
  values (v_actor_id, p_target_type, p_target_id, p_reason, p_description)
  on conflict (reporter_id, target_type, target_id, reason) do nothing
  returning id into v_report_id;

  if not found then
    raise exception 'You have already submitted a report for this.' using errcode = '23505';
  end if;

  return v_report_id;
end;
$function$;

revoke all on function public.submit_report(text, uuid, text, text) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;

comment on function public.submit_report(text, uuid, text, text) is 'Authenticated-only report submission. Validates target existence and reason, enforces one report per reporter per target per reason, and returns the new report id. Volatile because it inserts into public.reports and reads auth.uid().';
