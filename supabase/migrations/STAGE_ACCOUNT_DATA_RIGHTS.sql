-- AfterFur account and data rights migration (prepare only; do not execute without approval)

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  option text not null check (option in ('immediate_24h', 'scheduled_14d', 'scheduled_30d')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled', 'failed')),
  requested_at timestamptz not null default now(),
  scheduled_deletion_at timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  reminder_sent_at timestamptz,
  confirmation_email_sent_at timestamptz,
  export_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_user_idx on public.account_deletion_requests(user_id, requested_at desc);
create index if not exists account_deletion_requests_status_idx on public.account_deletion_requests(status, scheduled_deletion_at);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "account deletion requests owner" on public.account_deletion_requests;
create policy "account deletion requests owner" on public.account_deletion_requests
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'expired')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  download_token_hash text,
  download_expires_at timestamptz,
  download_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_export_requests_user_idx on public.data_export_requests(user_id, requested_at desc);

alter table public.data_export_requests enable row level security;

drop policy if exists "data export requests owner" on public.data_export_requests;
create policy "data export requests owner" on public.data_export_requests
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.request_account_deletion(p_option text)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid(); v_days integer; v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_option = 'immediate_24h' then v_days := 1;
  elseif p_option = 'scheduled_14d' then v_days := 14;
  elseif p_option = 'scheduled_30d' then v_days := 30;
  else raise exception 'Invalid deletion option' using errcode = '22023';
  end if;
  insert into public.account_deletion_requests (user_id, option, scheduled_deletion_at, export_requested)
  values (v_user, p_option, now() + (v_days || ' days')::interval, p_option in ('scheduled_14d','scheduled_30d'))
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.request_account_deletion(text) from public, anon;
grant execute on function public.request_account_deletion(text) to authenticated;

create or replace function public.cancel_account_deletion(p_request_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.account_deletion_requests
    set status = 'cancelled', cancelled_at = now(), updated_at = now()
    where id = p_request_id and user_id = v_user and status = 'pending';
  if not found then raise exception 'Deletion request not found or not cancellable' using errcode = '22023'; end if;
  return true;
end;
$function$;
revoke all on function public.cancel_account_deletion(uuid) from public, anon;
grant execute on function public.cancel_account_deletion(uuid) to authenticated;

create or replace function public.request_data_export()
returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.data_export_requests (user_id) values (v_user) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.request_data_export() from public, anon;
grant execute on function public.request_data_export() to authenticated;
