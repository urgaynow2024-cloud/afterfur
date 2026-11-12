-- Add nullable classification column to posts (additive, non-destructive)
alter table public.posts
  add column if not exists classification text
  check (classification is null or classification in ('SFW', 'NSFW'))
  default 'SFW';

-- Ensure new inserts default to SFW when omitted.
alter table public.posts
  alter column classification set default 'SFW';
