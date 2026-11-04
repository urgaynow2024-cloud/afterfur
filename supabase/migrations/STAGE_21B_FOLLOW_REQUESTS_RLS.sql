-- Restrict pending follow requests to recipient only.
-- Accepted follows remain readable for counts/lists.
drop policy if exists "follows readable" on public.follows;
create policy "follows readable"
  on public.follows
  for select
  using (
    status = 'accepted'
    or (status = 'pending' and following_id = auth.uid())
  );
