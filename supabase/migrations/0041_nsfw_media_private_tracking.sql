/*
 * NSFW media private reconciliation tracking
 *
 * Adds a `media_reconciled_at` column to `public.posts` to track which NSFW
 * posts have had their public-bucket media moved to the private `media_private`
 * bucket. This column is set by the reconciliation script (not by this
 * migration) after each post's media has been safely copied and verified.
 *
 * This migration is additive and idempotent. It does NOT move any storage
 * objects, delete any files, or modify any media URLs. It only adds the
 * tracking column needed by the reconciliation script.
 *
 * The actual storage migration is performed by the separate reconciliation
 * tooling at scripts/reconcile-nsfw-media.ts, which:
 *   1. Copies NSFW media from the public `media` bucket to `media_private`
 *   2. Verifies each copy succeeded
 *   3. Updates posts.media_urls from public URLs to bare storage paths
 *   4. Inserts canonical rows into public.media
 *   5. Only then deletes the original from the public bucket
 *   6. Sets media_reconciled_at on the post
 */

alter table public.posts
  add column if not exists media_reconciled_at timestamptz;

create index if not exists posts_media_reconciled_idx on public.posts(media_reconciled_at) where media_reconciled_at is null;

comment on column public.posts.media_reconciled_at is
  'Timestamp when this post''s NSFW media was reconciled from the public media bucket to the private media_private bucket. NULL means not yet reconciled.';
