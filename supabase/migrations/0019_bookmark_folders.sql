-- Bookmark folders and membership limits.
create table if not exists public.bookmark_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookmark_folders_user_idx on public.bookmark_folders(user_id);

create table if not exists public.bookmark_folder_items (
  folder_id uuid not null references public.bookmark_folders(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_id, post_id)
);
create index if not exists bookmark_folder_items_user_idx on public.bookmark_folder_items(user_id);

alter table public.bookmark_folders enable row level security;
alter table public.bookmark_folder_items enable row level security;

drop policy if exists "bookmark folders own" on public.bookmark_folders;
create policy "bookmark folders own" on public.bookmark_folders
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bookmark folder items own" on public.bookmark_folder_items;
create policy "bookmark folder items own" on public.bookmark_folder_items
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Free users: 3 folders. Prime: 20 folders. Enforced server-side in RPC.
create or replace function public.create_bookmark_folder(p_name text)
returns uuid
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid(); v_count integer; v_limit integer; v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 60 then raise exception 'Invalid folder name' using errcode = '22023'; end if;
  select count(*) into v_count from public.bookmark_folders where user_id = v_user;
  if public.is_prime_member(v_user) then v_limit := 20; else v_limit := 3; end if;
  if v_count >= v_limit then raise exception 'Folder limit reached' using errcode = '22023'; end if;
  insert into public.bookmark_folders(user_id, name) values (v_user, trim(p_name)) returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.create_bookmark_folder(text) from public, anon;
grant execute on function public.create_bookmark_folder(text) to authenticated;

create or replace function public.rename_bookmark_folder(p_folder_id uuid, p_name text)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) = 0 or length(trim(p_name)) > 60 then raise exception 'Invalid folder name' using errcode = '22023'; end if;
  update public.bookmark_folders set name = trim(p_name), updated_at = now() where id = p_folder_id and user_id = v_user;
  if not found then raise exception 'Folder not found' using errcode = '22023'; end if;
  return true;
end;
$function$;
revoke all on function public.rename_bookmark_folder(uuid, text) from public, anon;
grant execute on function public.rename_bookmark_folder(uuid, text) to authenticated;

create or replace function public.delete_bookmark_folder(p_folder_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from public.bookmark_folders where id = p_folder_id and user_id = v_user;
  if not found then raise exception 'Folder not found' using errcode = '22023'; end if;
  return true;
end;
$function$;
revoke all on function public.delete_bookmark_folder(uuid) from public, anon;
grant execute on function public.delete_bookmark_folder(uuid) to authenticated;

create or replace function public.add_bookmark_to_folder(p_folder_id uuid, p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.bookmark_folders where id = p_folder_id and user_id = v_user) then
    raise exception 'Folder not found' using errcode = '22023';
  end if;
  if not exists (select 1 from public.posts where id = p_post_id) then
    raise exception 'Post not found' using errcode = '22023';
  end if;
  insert into public.bookmark_folder_items(folder_id, post_id, user_id)
    values (p_folder_id, p_post_id, v_user)
    on conflict (folder_id, post_id) do nothing;
  return true;
end;
$function$;
revoke all on function public.add_bookmark_to_folder(uuid, uuid) from public, anon;
grant execute on function public.add_bookmark_to_folder(uuid, uuid) to authenticated;

create or replace function public.remove_bookmark_from_folder(p_folder_id uuid, p_post_id uuid)
returns boolean
language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  delete from public.bookmark_folder_items where folder_id = p_folder_id and post_id = p_post_id and user_id = v_user;
  return true;
end;
$function$;
revoke all on function public.remove_bookmark_from_folder(uuid, uuid) from public, anon;
grant execute on function public.remove_bookmark_from_folder(uuid, uuid) to authenticated;
