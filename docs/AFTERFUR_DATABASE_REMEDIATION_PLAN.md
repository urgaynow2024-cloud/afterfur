# AfterFur Database Remediation Plan

**Generated:** 2026-11-12
**Source:** Repository audit findings (AFTERFUR_FULL_DATABASE_AUDIT.sql, AFTERFUR_DATABASE_SCHEMA_INVENTORY.md) and application code analysis.

---

## Executive Summary

This plan addresses **confirmed schema defects** identified through audit and code analysis. Three tables are entirely missing from the database but referenced by 20+ application files. Multiple RLS policies compose incorrectly. The `posts.classification` CHECK constraint is not properly enforced. Moderation columns from migration 0034 are missing. Profile and follow schema extensions from STAGE_21B are missing.

**All fixes are forward-only, idempotent where possible, and preserve existing data.**

---

## Phase 1: Confirmed Defects (Must Fix)

### 1.1 Missing Tables (Critical - Application Will Fail)

| Table | Referenced By | Status |
|-------|---------------|--------|
| `blocks` | 15+ files (STAGE_21A, posts.server, feed, notifications, messages, mentions, followRequests, profiles.server) | **MISSING** - No CREATE TABLE in any migration |
| `notification_preferences` | src/lib/notificationPreferences.ts, src/app/api/notifications/preferences/route.ts | **MISSING** - No CREATE TABLE |
| `message_requests` | src/app/api/messages/requests/route.ts | **MISSING** - No CREATE TABLE |

### 1.2 Schema Columns Missing (Confirmed by Audit)

| Table | Missing Columns | Expected Source Migration |
|-------|-----------------|---------------------------|
| `posts` | `moderation_status`, `moderated_at`, `moderated_by`, `moderation_reason` | 0034_moderation_content_status.sql |
| `replies` | `moderation_status`, `moderated_at`, `moderated_by`, `moderation_reason` | 0034_moderation_content_status.sql |
| `follows` | `status`, `created_at` | STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql |
| `profiles` | `is_private` | STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql |

### 1.3 Constraint Defects

| Object | Issue | Severity |
|--------|-------|----------|
| `posts.classification` | Column exists (from 0001_initial) but CHECK constraint `(classification in ('SFW','NSFW'))` not enforced; 0042 migration made it nullable with `check (classification is null or classification in ('SFW','NSFW'))` conflicting with NOT NULL default | **HIGH** - Data integrity |
| `follows` | Missing CHECK constraint `follows_status_check (status in ('pending','accepted','rejected'))` | **HIGH** - Data integrity |
| `posts.moderated_by` | Missing FK to `profiles(id)` (0034 defined it) | **MEDIUM** - Referential integrity |
| `replies.moderated_by` | Missing FK to `profiles(id)` (0034 defined it) | **MEDIUM** - Referential integrity |

### 1.4 RLS Policy Composition Defects

| Table | Issue |
|-------|-------|
| `posts` | Multiple permissive + restrictive policies may not compose correctly; 0044 migration attempted fix but block/privacy restrictive policies must AND with classification permissive policies |
| `profiles` | Restrictive privacy policy from STAGE_21B must compose with STAGE_21A block policy |
| `follows` | STAGE_21B_FOLLOW_REQUESTS_RLS policy assumes `status` column exists |
| `replies` | May need block enforcement consistent with posts |

### 1.5 Security Hardening

| Function | Issue |
|----------|-------|
| `public.is_current_user_blocked(uuid)` | SECURITY DEFINER, has search_path - OK |
| `public.is_blocked(uuid, uuid)` | SECURITY DEFINER, must be service_role only - enforced in STAGE_21A |
| Multiple SECURITY DEFINER functions | Verify all have explicit `set search_path = pg_catalog, public` or `public, pg_temp` |

---

## Phase 2: Objects With Unknown Live Existence (Defensive Migrations)

These objects are defined in migration files but audit cannot confirm they were applied. Migrations will use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` and validate preconditions.

| Object | Migration Source | Defensive Approach |
|--------|------------------|---------------------|
| `badge_registry` + related badge tables | 0011, 0015 | Already confirmed in inventory |
| `pawpass_entitlements` + related | 0013 | Already confirmed |
| `media` table | STAGE_21B_MEDIA_PRIVATE_MIGRATION | Already confirmed |
| `conversation_mutes` | STAGE_26_CONVERSATION_MUTES | Already confirmed |
| `message_attachments`, `message_reads` | STAGE_25_* | Already confirmed |
| `moderator_roles`, `moderation_audit_log`, `user_enforcements`, `appeals` | 0033 | Already confirmed |
| `reports` table | 0024 | Already confirmed |
| `bookmark_folders`, `bookmark_folder_items` | 0019 | Already confirmed |
| `user_ui_preferences` | 0017 | Already confirmed |
| `staff_badge_assignments`, `staff_badge_audit`, `user_badge_awards`, `badge_account_origins` | 0011 | Already confirmed |

---

## Phase 3: Ordered Remediation Plan

### Step 1: Create Missing Tables (Independent, No Dependencies)
1. **0048_blocks_table.sql** - `blocks` table with FKs, RLS, triggers
2. **0049_notification_preferences.sql** - `notification_preferences` table with RLS
3. **0050_message_requests.sql** - `message_requests` table with RLS

### Step 2: Fix Core Schema Constraints (Depend on Step 1 for blocks FKs)
4. **0051_fix_classification_constraint.sql** - Enforce `posts.classification CHECK (classification IN ('SFW','NSFW'))` NOT NULL
5. **0052_add_moderation_columns.sql** - Add moderation columns to posts/replies with FKs, indexes, CHECKs (idempotent re-application of 0034)
6. **0053_follows_schema_fix.sql** - Add `status`, `created_at` to follows with CHECK constraint and index
7. **0054_profiles_schema_fix.sql** - Add `is_private` to profiles with default false

### Step 3: RLS Policy Composition (Depend on schema columns existing)
8. **0055_rls_policy_composition.sql** - Fix policy composition for posts, profiles, follows, replies, blocks

### Step 4: Missing Indexes, FKs, Constraints
9. **0056_add_missing_indexes_fks.sql** - Add any remaining indexes, verify all FKs exist

---

## Migration Design Principles

1. **Forward-only** - No DROP COLUMN, no DROP TABLE, no data deletion
2. **Idempotent** - Use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` before CREATE
3. **Defensive** - Check preconditions; fail with clear error if assumptions violated
4. **Order-preserving** - Numbered 0048-0056 to follow existing sequence (gap at 0026-0032 acknowledged)
5. **RLS-first** - Enable RLS before creating policies; grant minimal privileges
6. **Function hardening** - All SECURITY DEFINER functions get explicit search_path

---

## Application Compatibility Checklist

| Component | Schema Dependency | Verification |
|-----------|-------------------|--------------|
| `posts.server.ts` | posts.moderation_status, blocks, follows.status, profiles.is_private | SELECT * queries compatible |
| `feedPrivacy.ts` / `postPrivacy.ts` / `profilePrivacy.ts` | profiles.is_private, follows.status, blocks | Logic unchanged |
| `notifications.server.ts` | blocks, notification_preferences | Table must exist |
| `mentions.server.ts` | blocks, profiles | Table must exist |
| `notificationPreferences.ts` / API route | notification_preferences (all boolean columns + updated_at) | Columns must match |
| `messages/requests/route.ts` | message_requests, blocks | Tables must exist |
| `followRequests.ts` | blocks, follows.status | Columns must exist |
| `profiles.server.ts` | blocks, follows.status, profiles.is_private | Columns must exist |
| TypeScript types | All column names in SELECT * | No breaking changes |

---

## Validation Steps

1. **Static SQL validation** - Run migration files through `psql --dry-run` or equivalent
2. **TypeScript compile** - `npm run typecheck` (tsc --noEmit)
3. **Test suite** - `npm test` (vitest)
4. **Lint** - `npm run lint`
5. **Schema diff** - Compare generated types vs migration expectations

---

## Supabase Application Instructions

```bash
# 1. Verify current migration history in Supabase Dashboard
# 2. Apply migrations in order (0048 through 0056):
#    supabase db push --include-all  # or manually via SQL Editor
# 3. Verify each migration applied successfully
# 4. Run application test suite against staging
# 5. Monitor logs for RLS policy violations or constraint errors
```

**DO NOT APPLY TO PRODUCTION** until validated in staging with full test coverage.

---

## Rollback Strategy

Each migration is forward-only and additive. If issues arise:
- RLS policies: `DROP POLICY IF EXISTS "policy_name" ON table;` (original policies preserved in earlier migrations)
- Columns: Cannot drop safely; would require new migration with data migration
- Tables: New tables only; `DROP TABLE IF EXISTS` in emergency rollback migration

---

## Dependencies Graph

```
0048 (blocks) ──────────────────┐
                                ├──→ 0055 (RLS composition needs blocks table)
0049 (notification_prefs) ──────┤
                                │
0050 (message_requests) ────────┘

0051 (classification) ──────────┐
                                ├──→ 0055 (RLS needs classification CHECK)
0052 (moderation cols) ─────────┤
                                │
0053 (follows cols) ────────────┤
                                ├──→ 0055 (RLS needs status, is_private)
0054 (profiles is_private) ─────┘

0056 (indexes/FKs) ─────────────→ Can run after 0051-0054, before or after 0055
```

---

## Estimated Effort

| Phase | Migrations | Est. Time |
|-------|------------|-----------|
| Missing Tables | 3 | 2 hours |
| Schema Fixes | 4 | 3 hours |
| RLS Composition | 1 | 2 hours |
| Indexes/FKs | 1 | 1 hour |
| Validation | - | 2 hours |
| **Total** | **9** | **~10 hours** |