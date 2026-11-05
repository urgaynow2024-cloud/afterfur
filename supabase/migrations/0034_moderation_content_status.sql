-- Stage 33 follow-up: additive moderation status fields for content.
-- Enables reversible moderator remove/restore without violating existing
-- classification constraints or hard-deleting content. Not applied to
-- production automatically.

alter table public.posts
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'removed')),
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id),
  add column if not exists moderation_reason text;

alter table public.replies
  add column if not exists moderation_status text not null default 'visible'
    check (moderation_status in ('visible', 'removed')),
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles(id),
  add column if not exists moderation_reason text;

create index if not exists posts_moderation_status_idx on public.posts(moderation_status);
create index if not exists replies_moderation_status_idx on public.replies(moderation_status);

comment on column public.posts.moderation_status is 'Moderator visibility state; removed content is hidden from ordinary surfaces by app policy.';
comment on column public.replies.moderation_status is 'Moderator visibility state; removed content is hidden from ordinary surfaces by app policy.';
