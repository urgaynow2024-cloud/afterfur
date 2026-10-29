-- Ensure Terms acceptance metadata is copied into the profile on account creation,
-- including email-confirmation flows where the client has no session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, username, display_name, terms_accepted_version, terms_accepted_at)
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
      ),
      nullif(new.raw_user_meta_data ->> 'terms_accepted_version', ''),
      case when new.raw_user_meta_data ->> 'terms_accepted_at' is not null
           then (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
           else null end
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id, username, display_name, terms_accepted_version, terms_accepted_at)
    values (
      new.id,
      'user_' || substr(new.id::text, 1, 8),
      split_part(new.email, '@', 1),
      nullif(new.raw_user_meta_data ->> 'terms_accepted_version', ''),
      case when new.raw_user_meta_data ->> 'terms_accepted_at' is not null
           then (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz
           else null end
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
