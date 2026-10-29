-- Allow authors to edit their own posts while preserving ownership on update.
alter table public.posts add column if not exists edited_at timestamptz;

drop policy if exists "posts update own" on public.posts;
create policy "posts update own"
  on public.posts for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);
