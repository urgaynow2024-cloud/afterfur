# Stage 29 Final Acceptance Matrix – Production Migration Rehearsal & Launch Gate

## Executive Summary

- **13 unapplied migrations** audited. No destructive operations found (no DROP TABLE, no DROP COLUMN, no DELETE/UPDATE on existing production data).
- **Critical finding**: `STAGE_PAWPASS_COMPLETE.sql` and `PawPass_Migration.sql` are **byte-for-byte identical duplicates**. `STAGE_PAWPASS_BOOSTS.sql` overlaps significantly with both (same `post_boosts` table, same functions). Applying all three naively is safe due to `create table if not exists` / `create or replace function`, but is redundant and confusing.
- **All migrations are idempotent** (`create table if not exists`, `drop policy if exists`, `create or replace function`, `on conflict do nothing`).
- **Application code is compatible** with the expected final schema (database.types.ts already includes all new tables).
- **Go/no-go: CONDITIONAL GO** — pending deduplication of PawPass migrations and production backup.

---

## 1. Migration-by-Migration Findings

### Migration 1: `STAGE_21A_FINAL_BLOCKING_MIGRATION.sql`

| Item | Finding |
|------|---------|
| Tables created/modified | None (modifies policies on `profiles`, `posts`) |
| Columns/constraints/indexes | None |
| RLS policies | Creates `profiles readable`, `posts readable` (permissive base); creates `profiles_block_restrictive`, `posts_block_restrictive` (restrictive layer) |
| Functions | `is_current_user_blocked(uuid)` SECURITY DEFINER; revokes/grants `is_blocked(uuid,uuid)` |
| Triggers | `guard_like_block`, `guard_repost_block`, `guard_reply_block`, `guard_notification_block`, `follows_block_check`, `blocks_remove_follows` |
| Storage | None |
| Dependencies | `public.blocks`, `public.profiles`, `public.posts`, `public.likes`, `public.reposts`, `public.replies`, `public.notifications` (all from 0001-0003) |
| Destructive operations | None |
| Data compatibility | Safe — adds restrictive layer on top of existing permissive policies |

### Migration 2: `STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql`

| Item | Finding |
|------|---------|
| Tables created/modified | `profiles` (add column), `follows` (add column) |
| Columns | `profiles.is_private boolean not null default false`; `follows.status text not null default 'accepted'` |
| Constraints | `follows_status_check` check (status in pending/accepted/rejected) |
| Indexes | `follows_status_idx` on follows(status) |
| RLS policies | `profiles_privacy_restrictive`, `posts_privacy_restrictive` (restrictive, compose with 21A) |
| Functions/triggers | None |
| Storage | None |
| Dependencies | `public.profiles`, `public.follows`, `public.posts` |
| Destructive operations | None |
| Data compatibility | **RISK**: `follows_status_check` constraint could fail if existing `follows` rows have status values outside ('pending','accepted','rejected'). However, `status` column is being added with default 'accepted', so existing rows will have 'accepted' — safe. |

### Migration 3: `STAGE_21B_FOLLOW_REQUESTS_RLS.sql`

| Item | Finding |
|------|---------|
| Tables | None |
| RLS policies | `follows readable` — restricts pending follow requests to recipient only |
| Dependencies | `public.follows` (status column from migration 2) |
| Destructive operations | None |
| Data compatibility | Safe — read policy only, no data modification |

### Migration 4: `STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.media` |
| Columns | id, owner_id, post_id, storage_path, bucket_id, media_type, created_at |
| Constraints | unique (bucket_id, storage_path) |
| Indexes | media_owner_idx, media_post_idx, media_storage_path_idx |
| RLS policies | media read/insert/delete own (auth.uid() = owner_id) |
| Storage bucket | `media_private` (public=false), idempotent insert |
| Storage policies | upload/update/delete own folder; read closed (using false) |
| Dependencies | `public.profiles`, `public.posts` |
| Destructive operations | None |
| Data compatibility | Safe — new table, new bucket, existing public `media` bucket untouched |

### Migration 5: `0024_user_reports.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.reports` |
| Columns | id, reporter_id, target_type, target_id, reason, description, status, reviewed_by, reviewed_at, created_at |
| Constraints | check target_type in (post,reply,user); check reason in (...); check status in (...); unique (reporter_id, target_type, target_id, reason) |
| Indexes | reports_reporter_idx, reports_target_idx, reports_status_idx |
| RLS policies | reports insert own, read own, staff read/update |
| Functions | `submit_report(text,uuid,text,text)` SECURITY DEFINER |
| Dependencies | `public.profiles`, `public.posts`, `public.replies` |
| Destructive operations | None |
| Data compatibility | Safe — new table only |

### Migration 6: `0025_follow_and_mention_notifications.sql`

| Item | Finding |
|------|---------|
| Tables | None |
| Functions | `notify_on_follow()`, `notify_mentions_from_content()`, `notify_mentions_on_post()`, `notify_mentions_on_reply()` |
| Triggers | notify_on_follow_trigger (after insert on follows); notify_mentions_on_post_trigger (after insert on posts); notify_mentions_on_reply_trigger (after insert on replies) |
| Dependencies | `public.follows`, `public.posts`, `public.replies`, `public.profiles`, `public.notifications` |
| Destructive operations | None |
| Data compatibility | Safe — triggers fire on INSERT only; existing rows unaffected |

### Migration 7: `STAGE_25_MESSAGE_READ_RECEIPTS.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.message_reads` |
| Columns | id, conversation_id, message_id, user_id, read_at |
| Constraints | unique (conversation_id, message_id, user_id) |
| Indexes | message_reads_conversation_idx, message_reads_user_idx, message_reads_message_idx |
| RLS policies | members read; own insert/update |
| Functions | `mark_messages_read(uuid, uuid[])` SECURITY INVOKER |
| Dependencies | `public.conversations`, `public.messages`, `public.profiles`, `public.conversation_participants` |
| Destructive operations | None |
| Data compatibility | Safe — new table only |

### Migration 8: `STAGE_25_MESSAGE_ATTACHMENTS.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.message_attachments` |
| Columns | id, message_id, conversation_id, uploader_id, storage_path, bucket_id, media_type, file_size, created_at |
| Constraints | unique (bucket_id, storage_path) |
| Indexes | message_attachments_conversation_idx, message_attachments_message_idx, message_attachments_uploader_idx |
| RLS policies | members read; uploader insert |
| Storage bucket | `message_attachments` (public=false), idempotent insert |
| Storage policies | upload/update/delete own folder; read closed |
| Dependencies | `public.conversations`, `public.messages`, `public.profiles`, `public.conversation_participants` |
| Destructive operations | None |
| Data compatibility | Safe — new table and bucket |

### Migration 9: `STAGE_26_CONVERSATION_MUTES.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.conversation_mutes` |
| Columns | id, conversation_id, user_id, muted_at |
| Constraints | unique (conversation_id, user_id) |
| Indexes | conversation_mutes_user_idx, conversation_mutes_conversation_idx |
| RLS policies | owner only (select/insert/delete) |
| Dependencies | `public.conversations`, `public.profiles` |
| Destructive operations | None |
| Data compatibility | Safe — new table only |

### Migration 10: `STAGE_PAWPASS_COMPLETE.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.bookmark_folders`, `public.bookmark_folder_items`, `public.post_boosts` |
| Functions | create_bookmark_folder, rename_bookmark_folder, delete_bookmark_folder, add_bookmark_to_folder, remove_bookmark_from_folder, consume_post_boost, get_boost_allowance |
| RLS policies | owner only on all tables |
| Dependencies | `public.profiles`, `public.posts`, `public.pawpass_entitlements` (from 0013), `public.is_prime_member()` (from 0013) |
| Destructive operations | None |
| Data compatibility | Safe — new tables only |

### Migration 11: `PawPass_Migration.sql`

| Item | Finding |
|------|---------|
| **CRITICAL** | **Byte-for-byte identical duplicate of STAGE_PAWPASS_COMPLETE.sql** |
| Tables/functions | Same as migration 10 |
| Data compatibility | Safe individually (idempotent), but applying both is redundant |

### Migration 12: `STAGE_PAWPASS_BOOSTS.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.post_boosts` (overlaps with migrations 10 and 11) |
| Functions | consume_post_boost, get_boost_allowance (overlaps with 10 and 11) |
| RLS policies | post_boosts owner read |
| Dependencies | `public.posts`, `public.profiles`, `public.pawpass_entitlements` |
| Destructive operations | None |
| Data compatibility | Safe individually, but redundant with 10/11 |

### Migration 13: `Account_Data_Rights_Migration.sql`

| Item | Finding |
|------|---------|
| Tables created | `public.account_deletion_requests`, `public.data_export_requests` |
| Columns | account_deletion_requests: id, user_id, option, status, requested_at, scheduled_deletion_at, ...; data_export_requests: id, user_id, status, requested_at, completed_at, download_token_hash, ... |
| Constraints | check option in (...); check status in (...); unique index one active deletion request per user |
| Indexes | account_deletion_requests_one_active_per_user (partial unique), account_deletion_requests_user_idx, account_deletion_requests_status_idx, data_export_requests_user_idx |
| RLS policies | owner select only |
| Functions | request_account_deletion(text), cancel_account_deletion(uuid), request_data_export() |
| Dependencies | `public.profiles` |
| Destructive operations | None |
| Data compatibility | Safe — new tables only |

---

## 2. Migration Safety Analysis

### Destructive Operations Check

| Check | Result |
|-------|--------|
| DROP TABLE | **None found** |
| DROP COLUMN | **None found** |
| DELETE on existing records | **None found** |
| UPDATE on existing records | **None found** |
| Column type changes | **None found** |
| Constraint additions that could fail on existing data | **Low risk**: `follows_status_check` — but `status` column is added with default 'accepted', so existing rows satisfy the constraint |
| Conflicting/duplicated policies | **None** — all use `drop policy if exists` before creation |
| Functions changing existing application behavior | **None** — all new functions |
| Storage changes affecting existing files | **None** — new buckets only; existing public `media` bucket untouched |

### Idempotency Verification

All 13 migrations use idempotent patterns:
- `create table if not exists`
- `drop policy if exists` + `create policy`
- `create or replace function`
- `insert into storage.buckets ... on conflict (id) do nothing`
- `alter table ... add column if not exists`
- `create index if not exists`
- `on conflict (reporter_id, target_type, target_id, reason) do nothing`

**However**: `STAGE_PAWPASS_COMPLETE.sql` and `PawPass_Migration.sql` are exact duplicates. Applying both is harmless but wasteful and confusing. `STAGE_PAWPASS_BOOSTS.sql` overlaps with both on `post_boosts` table and functions — also harmless due to idempotency, but redundant.

---

## 3. Verified Execution Order

Migrations must be applied in dependency order:

| Order | Migration | Reason |
|-------|-----------|--------|
| 1 | `STAGE_21A_FINAL_BLOCKING_MIGRATION.sql` | Foundation — blocking helpers used by later migrations |
| 2 | `STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql` | Adds `is_private` and `follows.status` columns needed by migration 3 |
| 3 | `STAGE_21B_FOLLOW_REQUESTS_RLS.sql` | Depends on `follows.status` from migration 2 |
| 4 | `STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql` | Independent; can run anytime after base schema |
| 5 | `0024_user_reports.sql` | Independent; needs profiles/posts/replies |
| 6 | `0025_follow_and_mention_notifications.sql` | Needs follows, posts, replies, notifications |
| 7 | `STAGE_25_MESSAGE_READ_RECEIPTS.sql` | Needs conversations, messages (from 0006) |
| 8 | `STAGE_25_MESSAGE_ATTACHMENTS.sql` | Needs conversations, messages (from 0006) |
| 9 | `STAGE_26_CONVERSATION_MUTES.sql` | Needs conversations, profiles |
| 10 | `STAGE_PAWPASS_COMPLETE.sql` **OR** `PawPass_Migration.sql` (pick ONE) | Needs pawpass_entitlements (from 0013), is_prime_member |
| 11 | `Account_Data_Rights_Migration.sql` | Needs profiles |

**Note**: `STAGE_PAWPASS_BOOSTS.sql` is a subset of `STAGE_PAWPASS_COMPLETE.sql` (post_boosts + consume_post_boost + get_boost_allowance). Do NOT apply separately if `STAGE_PAWPASS_COMPLETE.sql` is applied.

**Recommended migration set** (deduplicated):
1. STAGE_21A_FINAL_BLOCKING_MIGRATION.sql
2. STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql
3. STAGE_21B_FOLLOW_REQUESTS_RLS.sql
4. STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql
5. 0024_user_reports.sql
6. 0025_follow_and_mention_notifications.sql
7. STAGE_25_MESSAGE_READ_RECEIPTS.sql
8. STAGE_25_MESSAGE_ATTACHMENTS.sql
9. STAGE_26_CONVERSATION_MUTES.sql
10. STAGE_PAWPASS_COMPLETE.sql (NOT PawPass_Migration.sql — duplicate)
11. Account_Data_Rights_Migration.sql

---

## 4. Pre-Migration Database Backup Checklist

- [ ] Full Supabase project backup (database + storage buckets)
- [ ] Verify backup is restorable on a staging project
- [ ] Record current schema version (consolidated migration state)
- [ ] Document current RLS policies for comparison post-migration
- [ ] Verify `supabase` CLI access to production project
- [ ] Schedule maintenance window (low traffic period)
- [ ] Prepare rollback SQL for each migration (drop table/function/policy)

### Pre-Migration Schema Preflight Checks

```sql
-- Verify base tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('profiles','posts','follows','conversations','messages',
                    'conversation_participants','notifications','pawpass_entitlements');

-- Verify blocking functions exist
SELECT proname FROM pg_proc WHERE proname IN ('is_current_user_blocked','is_blocked');

-- Verify no existing follows have invalid status (pre-migration 2 check)
SELECT status, count(*) FROM public.follows GROUP BY status;

-- Verify no duplicate bookmark_folders/post_boosts tables already exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('bookmark_folders','bookmark_folder_items','post_boosts',
                    'message_reads','message_attachments','conversation_mutes',
                    'reports','account_deletion_requests','data_export_requests');

-- Verify storage buckets
SELECT id, name, public FROM storage.buckets;
```

---

## 5. Expected Changes Per Migration (Summary)

| Migration | New Tables | New Columns | New Policies | New Functions | New Triggers | Storage |
|-----------|-----------|-------------|-------------|---------------|--------------|---------|
| 21A blocking | 0 | 0 | 4 | 1 | 6 | 0 |
| 21B privacy | 0 | 2 | 2 | 0 | 0 | 0 |
| 21B follow RLS | 0 | 0 | 1 | 0 | 0 | 0 |
| 21B media | 1 | 0 | 3 | 0 | 0 | 1 (media_private) |
| 0024 reports | 1 | 0 | 3 | 1 | 0 | 0 |
| 0025 notif | 0 | 0 | 0 | 4 | 3 | 0 |
| 25 receipts | 1 | 0 | 2 | 1 | 0 | 0 |
| 25 attachments | 1 | 0 | 2 | 0 | 0 | 1 (message_attachments) |
| 26 mutes | 1 | 0 | 1 | 0 | 0 | 0 |
| PawPass complete | 3 | 0 | 6 | 7 | 0 | 0 |
| Account rights | 2 | 0 | 1 | 3 | 0 | 0 |

---

## 6. Post-Migration Validation Queries

```sql
-- Verify all new tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('message_reads','message_attachments','conversation_mutes',
                    'reports','bookmark_folders','bookmark_folder_items',
                    'post_boosts','account_deletion_requests','data_export_requests',
                    'media');

-- Verify RLS is enabled on all new tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('message_reads','message_attachments','conversation_mutes',
                    'reports','bookmark_folders','bookmark_folder_items',
                    'post_boosts','account_deletion_requests','data_export_requests',
                    'media');

-- Verify storage buckets exist
SELECT id, name, public FROM storage.buckets
  WHERE id IN ('media_private','message_attachments');

-- Verify is_private default applied
SELECT is_private, count(*) FROM public.profiles GROUP BY is_private;

-- Verify follows status default applied
SELECT status, count(*) FROM public.follows GROUP BY status;

-- Verify blocking functions work
SELECT public.is_current_user_blocked('00000000-0000-0000-0000-000000000000'::uuid);
```

---

## 7. Recovery and Rollback Procedures

### Rollback SQL (if needed)

```sql
-- Migration 13: Account data rights
DROP FUNCTION IF EXISTS public.request_data_export();
DROP FUNCTION IF EXISTS public.cancel_account_deletion(uuid);
DROP FUNCTION IF EXISTS public.request_account_deletion(text);
DROP TABLE IF EXISTS public.data_export_requests;
DROP TABLE IF EXISTS public.account_deletion_requests;

-- Migration 10: PawPass complete (if applied)
DROP FUNCTION IF EXISTS public.get_boost_allowance();
DROP FUNCTION IF EXISTS public.consume_post_boost(uuid);
DROP FUNCTION IF EXISTS public.remove_bookmark_from_folder(uuid);
DROP FUNCTION IF EXISTS public.add_bookmark_to_folder(uuid, uuid);
DROP FUNCTION IF EXISTS public.delete_bookmark_folder(uuid);
DROP FUNCTION IF EXISTS public.rename_bookmark_folder(uuid, text);
DROP FUNCTION IF EXISTS public.create_bookmark_folder(text);
DROP TABLE IF EXISTS public.post_boosts;
DROP TABLE IF EXISTS public.bookmark_folder_items;
DROP TABLE IF EXISTS public.bookmark_folders;

-- Migration 9: Conversation mutes
DROP TABLE IF EXISTS public.conversation_mutes;

-- Migration 8: Message attachments
DROP TABLE IF EXISTS public.message_attachments;
-- Note: storage bucket deletion requires Supabase API/CLI, not SQL

-- Migration 7: Read receipts
DROP FUNCTION IF EXISTS public.mark_messages_read(uuid, uuid[]);
DROP TABLE IF EXISTS public.message_reads;

-- Migration 6: Notifications
DROP TRIGGER IF EXISTS notify_mentions_on_reply_trigger ON public.replies;
DROP TRIGGER IF EXISTS notify_mentions_on_post_trigger ON public.posts;
DROP TRIGGER IF EXISTS notify_on_follow_trigger ON public.follows;
DROP FUNCTION IF EXISTS public.notify_mentions_on_reply();
DROP FUNCTION IF EXISTS public.notify_mentions_on_post();
DROP FUNCTION IF EXISTS public.notify_mentions_from_content(uuid,text,text,uuid,uuid);
DROP FUNCTION IF EXISTS public.notify_on_follow();

-- Migration 5: Reports
DROP FUNCTION IF EXISTS public.submit_report(text,uuid,text,text);
DROP TABLE IF EXISTS public.reports;

-- Migration 4: Media private
-- Note: storage bucket deletion requires Supabase API/CLI
DROP TABLE IF EXISTS public.media;

-- Migration 3: Follow RLS
DROP POLICY IF EXISTS "follows readable" ON public.follows;

-- Migration 2: Profile privacy
DROP POLICY IF EXISTS "profiles_privacy_restrictive" ON public.profiles;
DROP POLICY IF EXISTS "posts_privacy_restrictive" ON public.posts;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_private;
ALTER TABLE public.follows DROP COLUMN IF EXISTS status;

-- Migration 1: Blocking
DROP POLICY IF EXISTS "profiles_block_restrictive" ON public.profiles;
DROP POLICY IF EXISTS "posts_block_restrictive" ON public.posts;
DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
DROP POLICY IF EXISTS "posts readable" ON public.posts;
DROP TRIGGER IF EXISTS guard_like_block ON public.likes;
DROP TRIGGER IF EXISTS guard_repost_block ON public.reposts;
DROP TRIGGER IF EXISTS guard_reply_block ON public.replies;
DROP TRIGGER IF EXISTS notifications_block_check ON public.notifications;
DROP TRIGGER IF EXISTS follows_block_check ON public.follows;
DROP TRIGGER IF EXISTS blocks_remove_follows ON public.blocks;
DROP FUNCTION IF EXISTS public.is_current_user_blocked(uuid);
```

### Rollback Order
Apply rollback in **reverse order** (13 → 1) to respect dependencies.

---

## 8. Migrations Requiring Manual Intervention

| Migration | Issue | Required Action |
|-----------|-------|-----------------|
| `STAGE_PAWPASS_COMPLETE.sql` | Duplicate of `PawPass_Migration.sql` | Apply only ONE of the two |
| `PawPass_Migration.sql` | Duplicate of `STAGE_PAWPASS_COMPLETE.sql` | Do NOT apply if STAGE_PAWPASS_COMPLETE applied |
| `STAGE_PAWPASS_BOOSTS.sql` | Subset of STAGE_PAWPASS_COMPLETE (post_boosts + functions) | Do NOT apply if STAGE_PAWPASS_COMPLETE applied |
| `STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql` | Adds `follows.status` column with NOT NULL default | Verify no existing follows have null status before adding NOT NULL |
| `STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql` | Creates storage bucket `media_private` | Verify bucket name doesn't conflict with existing production buckets |

---

## 9. Application Compatibility Check

| Area | Compatible? | Evidence |
|------|-------------|----------|
| Privacy enforcement | ✅ | `canViewProfile()` handles `is_private` (true/false/null → false) |
| Blocking | ✅ | Bidirectional block checks in all API routes + DB triggers |
| Messaging | ✅ | All API routes use `(supabase as any)` casts for new tables |
| Read receipts | ✅ | `database.types.ts` includes `message_reads`; API route implemented |
| Attachments | ✅ | `database.types.ts` includes `message_attachments`; API routes implemented |
| Conversation mutes | ✅ | `database.types.ts` includes `conversation_mutes`; UI implemented |
| Notifications | ✅ | `message` notification type handled in UI |
| Account data rights | ✅ | New tables only; existing code unaffected |

**database.types.ts** already includes type definitions for `message_reads`, `message_attachments`, `conversation_mutes`, and `mark_messages_read` function — application code is compatible with the final schema.

---

## 10. Critical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Duplicate PawPass migrations | Medium | Apply only `STAGE_PAWPASS_COMPLETE.sql`; skip `PawPass_Migration.sql` and `STAGE_PAWPASS_BOOSTS.sql` |
| `follows.status` NOT NULL constraint | Low | Column added with default 'accepted'; verify no nulls exist pre-migration |
| Storage bucket creation | Low | Use `on conflict do nothing`; verify bucket name uniqueness |
| Trigger on follows/posts/replies (0025) | Low | Triggers fire on INSERT only; existing rows unaffected |
| No rollback tested | Medium | Test rollback SQL on staging before production |

---

## 11. Outstanding Production Requirements

1. **Apply migrations** — Requires explicit permission. Use deduplicated list (10 migrations, not 13).
2. **Backup before migration** — Full Supabase project backup required.
3. **Test on staging** — Apply migrations to a staging project first to validate.
4. **Rate limiting** — No application-level rate limiting exists; recommended for production.
5. **SMTP configuration** — Email notifications require SMTP setup.
6. **PawPass migration overlap** — Confirm 0012-0021 in consolidated don't conflict with STAGE_PAWPASS_COMPLETE.

---

## 12. Final Go/No-Go Recommendation

**CONDITIONAL GO** ✅

### Conditions to meet before go:
1. [ ] Deduplicate PawPass migrations — apply only `STAGE_PAWPASS_COMPLETE.sql`, skip `PawPass_Migration.sql` and `STAGE_PAWPASS_BOOSTS.sql`
2. [ ] Full production backup taken and verified restorable
3. [ ] Migration tested on staging project
4. [ ] Rollback SQL prepared and tested
5. [ ] SMTP/email infrastructure confirmed (if email features needed)
6. [ ] Explicit permission to apply production migrations

### If all conditions met: **GO** for production migration.

### If any condition unmet: **NO-GO** until resolved.

---

## Verification Results

- TypeScript: `tsc --noEmit` clean
- Tests: 332 passed across 33 files
- Production build: `next build --turbopack` succeeded (45 routes)
- No production migrations applied
- No production data modified
- No deploy/push performed
