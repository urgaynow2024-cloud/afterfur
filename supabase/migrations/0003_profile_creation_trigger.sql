-- Ensure every Supabase Auth user has a corresponding public profile row.
-- This runs as SECURITY DEFINER so profile creation does not depend on the
-- unauthenticated client session during email confirmation.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      coalesce(
        nullif(new.raw_user_meta_data ->> 'username', ''),
        'user_' || substr(new.id::text, 1, 8)
      ),
      coalesce(
        nullif(new.raw_user_meta_data ->> 'display_name', ''),
        nullif(new.raw_user_meta_data ->> 'username', ''),
        split_part(new.email, '@', 1)
      )
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      'user_' || substr(new.id::text, 1, 8),
      split_part(new.email, '@', 1)
    )
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Backfill profiles for any existing auth users that do not have one.
insert into public.profiles (id, username, display_name)
select
  u.id,
  'user_' || substr(u.id::text, 1, 8),
  split_part(u.email, '@', 1)
from auth.users as u
left join public.profiles as p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
