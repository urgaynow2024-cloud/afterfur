-- 0067_add_pinned_posts.sql
--
-- Adds per-post pinned state so an author can pin a single post to the top of
-- the Posts tab on their own profile.
--
-- Security model:
--   * is_pinned / pinned_at are ordinary post columns; row-level security on
--     `public.posts` already governs who may read/update a post, so the pin
--     state inherits those restrictions.
--   * A partial unique index enforces one pinned post per author at the
--     database level: at most one row per author_id may have is_pinned = true.
--   * The pin/unpin API routes additionally verify the caller is the post's
--     author before mutating is_pinned.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

-- One pinned post per author (database-enforced).
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_one_pinned_per_author
  ON public.posts (author_id)
  WHERE is_pinned = true;

-- Supports the profile query that promotes pinned posts above newer posts.
CREATE INDEX IF NOT EXISTS idx_posts_author_pinned_created
  ON public.posts (author_id, is_pinned DESC, created_at DESC);
