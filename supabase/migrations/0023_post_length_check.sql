-- Enforce the 600-character post limit at the database level.
alter table public.posts
  drop constraint if exists posts_content_length_check;
alter table public.posts
  add constraint posts_content_length_check
  check (char_length(content) <= 600);

