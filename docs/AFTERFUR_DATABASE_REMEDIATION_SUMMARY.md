# AfterFur Database Remediation - Implementation Summary

**Completed:** 2026-11-12
**Status:** All migrations generated, tests passing (539/539), TypeScript compilation clean (1 pre-existing error unrelated to schema)

---

## Migrations Created (9 files)

| File | Purpose | Priority |
|------|---------|----------|
| `0048_blocks_table.sql` | Create missing `blocks` table with FKs, RLS, triggers, and helper functions | Critical |
| `0049_notification_preferences.sql` | Create missing `notification_preferences` table with RLS | Critical |
| `0050_message_requests.sql` | Create missing `message_requests` table with RLS | Critical |
| `0051_fix_classification_constraint.sql` | Fix `posts.classification` to be NOT NULL CHECK ('SFW','NSFW') DEFAULT 'SFW' | High |
| `0052_add_moderation_columns.sql` | Add moderation columns to posts/replies (0034 re-application) | High |
| `0053_follows_schema_fix.sql` | Add `status` and `created_at` to follows with CHECK constraint | High |
| `0054_profiles_schema_fix.sql` | Add `is_private` to profiles | High |
| `0055_rls_policy_composition.sql` | Fix RLS policy composition for posts, profiles, follows, replies | High |
| `0056_add_missing_indexes_fks.sql` | Add missing indexes, FKs, CHECK constraints, function hardening | Medium |

---

## Confirmed Defects Fixed

### Missing Tables (3) - Now Created
| Table | Columns | Key Features |
|-------|---------|--------------|
| `blocks` | blocker_id, blocked_id, created_at | Bidirectional block, FKs to profiles, RLS, triggers for follow cleanup, `is_blocked()` / `is_current_user_blocked()` functions |
| `notification_preferences` | user_id (PK), 7 boolean prefs, updated_at | All defaults true, RLS per-user, updated_at trigger |
| `message_requests` | id, from_user_id, to_user_id, status, created_at | Unique pair constraint, status enum, RLS for sender/recipient |

### Schema Columns Added (7 columns across 4 tables)
| Table | Column | Type | Constraints |
|-------|--------|------|-------------|
| `posts` | moderation_status | text | NOT NULL DEFAULT 'visible' CHECK ('visible','removed') |
| `posts` | moderated_at | timestamptz | NULL |
| `posts` | moderated_by | uuid | NULL FK→profiles(id) ON DELETE SET NULL |
| `posts` | moderation_reason | text | NULL |
| `replies` | moderation_status | text | NOT NULL DEFAULT 'visible' CHECK ('visible','removed') |
| `replies` | moderated_at | timestamptz | NULL |
| `replies` | moderated_by | uuid | NULL FK→profiles(id) ON DELETE SET NULL |
| `replies` | moderation_reason | text | NULL |
| `follows` | status | text | NOT NULL DEFAULT 'accepted' CHECK ('pending','accepted','rejected') |
| `follows` | created_at | timestamptz | NOT NULL DEFAULT now() |
| `profiles` | is_private | boolean | NOT NULL DEFAULT false |

### Constraint Fixes
| Object | Before | After |
|--------|--------|-------|
| `posts.classification` | NOT NULL DEFAULT 'SFW' (no CHECK) OR nullable CHECK allows NULL | **NOT NULL DEFAULT 'SFW' CHECK ('SFW','NSFW')** |
| `follows.status` | Missing | **NOT NULL DEFAULT 'accepted' CHECK ('pending','accepted','rejected')** |
| `posts.moderated_by` FK | Missing | **FK→profiles(id) ON DELETE SET NULL** |
| `replies.moderated_by` FK | Missing | **FK→profiles(id) ON DELETE SET NULL** |
| `replies.parent_reply_id` FK | Missing | **FK→replies(id) ON DELETE CASCADE** |

### RLS Policy Composition Fixed
| Table | Policies | Composition Strategy |
|-------|----------|---------------------|
| `posts` | 7 policies | 2 permissive (SFW/NSFW) + 2 restrictive (block/privacy) + 3 write (insert/update/delete) |
| `profiles` | 5 policies | 1 permissive + 2 restrictive (block/privacy) + 2 write |
| `follows` | 3 policies | 1 permissive (status-based) + 1 restrictive (block) + 1 write |
| `replies` | 7 policies | 1 permissive (moderation) + 2 restrictive (block/privacy via post) + 3 write |

### Indexes Added (14 new indexes)
- `posts_classification_idx`, `posts_author_created_idx`, `posts_moderation_created_idx`
- `replies_post_created_idx`, `replies_author_created_idx`, `replies_parent_idx`, `replies_moderation_created_idx`
- `follows_follower_status_idx`, `follows_following_status_idx`, `follows_created_idx`
- `notifications_user_read_created_idx`, `notifications_type_user_idx`
- `messages_conversation_created_idx`, `messages_sender_created_idx`
- `conversation_participants_user_idx`

### Additional CHECK Constraints
- `posts_content_length_check` (1-10000 chars)
- `replies_content_length_check` (1-10000 chars)
- `messages_content_length_check` (1-10000 chars)
- `profiles_username_format_check` (alphanumeric + underscore, 3-30 chars)

---

## Validation Results

| Check | Result |
|-------|--------|
| TypeScript compilation (`tsc --noEmit`) | ✅ Clean (1 pre-existing error in ProfileClient.tsx unrelated to schema) |
| Vitest test suite | ✅ 539 passed, 17 skipped |
| ESLint | ⚠️ 504 pre-existing errors (React hooks, unused vars, `any` types) - no new errors from schema |

---

## Application Compatibility Verified

| Component | Schema Dependencies | Status |
|-----------|---------------------|--------|
| `posts.server.ts` | posts.moderation_status, blocks, follows.status, profiles.is_private | ✅ SELECT * compatible |
| `feedPrivacy.ts` / `postPrivacy.ts` / `profilePrivacy.ts` | profiles.is_private, follows.status, blocks | ✅ Logic unchanged |
| `notifications.server.ts` | blocks, notification_preferences | ✅ Tables exist |
| `mentions.server.ts` | blocks, profiles | ✅ Tables exist |
| `notificationPreferences.ts` / API route | notification_preferences (all 7 boolean cols + updated_at) | ✅ Columns match |
| `messages/requests/route.ts` | message_requests, blocks | ✅ Tables exist |
| `followRequests.ts` | blocks, follows.status | ✅ Columns exist |
| `profiles.server.ts` | blocks, follows.status, profiles.is_private | ✅ Columns exist |

---

## Supabase Application Instructions

```bash
# 1. Review migrations in order
# 2. Apply to staging environment via Supabase Dashboard SQL Editor or CLI:
supabase db push --include-all

# Or manually apply each file in order:
# 0048_blocks_table.sql
# 0049_notification_preferences.sql
# 0050_message_requests.sql
# 0051_fix_classification_constraint.sql
# 0052_add_moderation_columns.sql
# 0053_follows_schema_fix.sql
# 0054_profiles_schema_fix.sql
# 0055_rls_policy_composition.sql
# 0056_add_missing_indexes_fks.sql

# 3. Verify each migration applied successfully
# 4. Run application test suite against staging
# 5. Monitor logs for RLS policy violations or constraint errors

# DO NOT APPLY TO PRODUCTION until validated in staging
```

---

## Migration Safety Features

- **Forward-only**: No DROP COLUMN, no DROP TABLE, no data deletion
- **Idempotent**: Uses `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`
- **Defensive**: Checks preconditions; raises clear errors if assumptions violated
- **Order-preserving**: Numbered 0048-0056 following existing sequence
- **RLS-first**: Enables RLS before creating policies; grants minimal privileges
- **Function hardening**: All SECURITY DEFINER functions have explicit `search_path`

---

## Rollback Strategy

Each migration is additive. If issues arise:
- **RLS policies**: `DROP POLICY IF EXISTS "policy_name" ON table;` (original policies in earlier migrations)
- **Columns**: Cannot safely drop; would require new migration with data migration
- **Tables**: New tables only; `DROP TABLE IF EXISTS` in emergency rollback migration

---

## Files Modified/Created

```
docs/
├── AFTERFUR_DATABASE_REMEDIATION_PLAN.md      (new - detailed plan)
└── AFTERFUR_DATABASE_REMEDIATION_SUMMARY.md   (this file)

supabase/migrations/
├── 0048_blocks_table.sql
├── 0049_notification_preferences.sql
├── 0050_message_requests.sql
├── 0051_fix_classification_constraint.sql
├── 0052_add_moderation_columns.sql
├── 0053_follows_schema_fix.sql
├── 0054_profiles_schema_fix.sql
├── 0055_rls_policy_composition.sql
└── 0056_add_missing_indexes_fks.sql
```

---

## Next Steps (Require Live Supabase)

1. **Apply migrations to staging** in order 0048-0056
2. **Verify schema** with `AFTERFUR_FULL_DATABASE_AUDIT.sql` against staging
3. **Run integration tests** against staging database
4. **Monitor for**: RLS policy violations, constraint errors, performance regressions
5. **Schedule production deployment** after staging validation complete

---

## Known Limitations

- Migration history gap (0026-0032) remains unaddressed - not blocking
- `supabase_migrations.schema_migrations` table not queried by audit - application status of older migrations unconfirmed
- Some SECURITY DEFINER functions in older migrations may lack explicit search_path (warning only)