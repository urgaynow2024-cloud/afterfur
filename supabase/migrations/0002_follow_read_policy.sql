-- Allow public read access to follow relationships for profile counts and lists.
-- Existing "follows manage own" policy remains responsible for inserts/deletes.

drop policy if exists "follows readable" on public.follows;
create policy "follows readable"
  on public.follows
  for select
  using (true);
