-- Terms acceptance tracking
alter table public.profiles
  add column if not exists terms_accepted_version text,
  add column if not exists terms_accepted_at timestamptz;
