-- Allow authors to manage their own replies (edit/delete) with ownership enforced by RLS.
alter table public.replies add column if not exists edited_at timestamptz;

drop policy if exists "replies update own" on public.replies;
create policy "replies update own"
  on public.replies for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "replies delete own" on public.replies;
create policy "replies delete own"
  on public.replies for delete to authenticated
  using (auth.uid() = author_id);
