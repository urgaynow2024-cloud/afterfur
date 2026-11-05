# Stage 30 Final Acceptance Matrix – Staging Migration Rehearsal

## 1. Stage 29 Count Discrepancy – Resolved

**Discrepancy**: Stage 29 stated "10 deduplicated migrations" but the execution order table listed 11 migrations.

**Root cause**: Counting error in the narrative text. The table was correct; the prose was wrong.

**Correct count**: **11 deduplicated migrations** (down from 13 raw files).

### Reduction from 13 to 11

| Raw file | Status | Reason |
|----------|--------|--------|
| `STAGE_21A_FINAL_BLOCKING_MIGRATION.sql` | Applied | Foundation blocking layer |
| `STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql` | Applied | Profile privacy + follows.status |
| `STAGE_21B_FOLLOW_REQUESTS_RLS.sql` | Applied | Follow request RLS |
| `STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql` | Applied | Private media bucket |
| `0024_user_reports.sql` | Applied | User reports |
| `0025_follow_and_mention_notifications.sql` | Applied | Follow/mention notification triggers |
| `STAGE_25_MESSAGE_READ_RECEIPTS.sql` | Applied | Read receipts |
| `STAGE_25_MESSAGE_ATTACHMENTS.sql` | Applied | Message attachments |
| `STAGE_26_CONVERSATION_MUTES.sql` | Applied | Conversation mutes |
| `STAGE_PAWPASS_COMPLETE.sql` | Applied | PawPass (replaces 2 other files) |
| `PawPass_Migration.sql` | SKIPPED | Byte-identical duplicate of STAGE_PAWPASS_COMPLETE.sql |
| `STAGE_PAWPASS_BOOSTS.sql` | SKIPPED | Subset of STAGE_PAWPASS_COMPLETE.sql |
| `Account_Data_Rights_Migration.sql` | Applied | Account deletion + data export |

**13 raw files → 11 applied migrations (2 skipped as redundant).**

---

## 2. PawPass Migration Overlap – Confirmed

### SHA256 hash comparison

| File | SHA256 |
|------|--------|
| `STAGE_PAWPASS_COMPLETE.sql` | `8DAD8991A5938862FAEAB72CC05E1E00D0BEC66CBD1D05B3549CE83B79FBE0EC` |
| `PawPass_Migration.sql` | `8DAD8991A5938862FAEAB72CC05E1E00D0BEC66CBD1D05B3549CE83B79FBE0EC` |
| `STAGE_PAWPASS_BOOSTS.sql` | `027ECB607F98879DA853B70816FD974D7BB11E4C5A7130ABC8CA18EFD19C1349` |

### Findings

| Question | Answer |
|----------|--------|
| Are STAGE_PAWPASS_COMPLETE.sql and PawPass_Migration.sql byte-identical? | **Yes** – identical SHA256 hashes |
| Does STAGE_PAWPASS_BOOSTS.sql contain unique functionality? | **No** – it contains only the `post_boosts` table, `consume_post_boost()`, and `get_boost_allowance()`, all of which are already in STAGE_PAWPASS_COMPLETE.sql |
| Does STAGE_PAWPASS_COMPLETE.sql preserve everything from all three? | **Yes** – it includes bookmark folders, bookmark folder items, post_boosts, all related functions, indexes, RLS policies |
| Is skipping PawPass_Migration.sql and STAGE_PAWPASS_BOOSTS.sql safe? | **Yes** – STAGE_PAWPASS_COMPLETE.sql is a strict superset; both skipped files add nothing new |

---

## 3. Staging Rehearsal

### Environment Availability

No staging or disposable Supabase environment was found in the project. The only Supabase connection information exists in `.env.local`, which points to the **production** Supabase project (`kunwfddahxkpvsivmmkm.supabase.co`).

Per the rules, production was **not** connected to or modified as a substitute for staging.

### Manual Rehearsal Instructions

Since no staging environment is available, the following reproducible manual rehearsal must be performed against an authorized staging Supabase project before production execution.

#### Pre-Rehearsal Checklist

- [ ] Provision a staging Supabase project (separate from production)
- [ ] Apply the consolidated migration (`ALL_MIGRATIONS_CONSOLIDATED.sql`) to bring staging to current schema baseline
- [ ] Take a full backup/snapshot of the staging database
- [ ] Record the current list of tables, functions, policies, and storage buckets
- [ ] Have rollback SQL ready (from Stage 29 Section 7)

#### Migration Execution Script (staging)

Execute migrations **in order**, recording the result of each:

```sql
-- Migration 1/11
\i supabase/migrations/STAGE_21A_FINAL_BLOCKING_MIGRATION.sql

-- Migration 2/11
\i supabase/migrations/STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql

-- Migration 3/11
\i supabase/migrations/STAGE_21B_FOLLOW_REQUESTS_RLS.sql

-- Migration 4/11
\i supabase/migrations/STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql

-- Migration 5/11
\i supabase/migrations/0024_user_reports.sql

-- Migration 6/11
\i supabase/migrations/0025_follow_and_mention_notifications.sql

-- Migration 7/11
\i supabase/migrations/STAGE_25_MESSAGE_READ_RECEIPTS.sql

-- Migration 8/11
\i supabase/migrations/STAGE_25_MESSAGE_ATTACHMENTS.sql

-- Migration 9/11
\i supabase/migrations/STAGE_26_CONVERSATION_MUTES.sql

-- Migration 10/11
\i supabase/migrations/STAGE_PAWPASS_COMPLETE.sql

-- Migration 11/11
\i supabase/migrations/Account_Data_Rights_Migration.sql
```

#### Post-Migration Validation Queries (run against staging)

```sql
-- Verify all expected tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN (
    'message_reads','message_attachments','conversation_mutes',
    'reports','bookmark_folders','bookmark_folder_items',
    'post_boosts','account_deletion_requests','data_export_requests',
    'media'
  )
  ORDER BY tablename;

-- Verify RLS enabled on all new tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN (
    'message_reads','message_attachments','conversation_mutes',
    'reports','bookmark_folders','bookmark_folder_items',
    'post_boosts','account_deletion_requests','data_export_requests',
    'media'
  );

-- Verify storage buckets exist
SELECT id, name, public FROM storage.buckets
  WHERE id IN ('media_private','message_attachments');

-- Verify is_private default applied
SELECT is_private, count(*) FROM public.profiles GROUP BY is_private;

-- Verify follows status default applied
SELECT status, count(*) FROM public.follows GROUP BY status;

-- Verify functions exist
SELECT proname FROM pg_proc WHERE proname IN (
  'mark_messages_read','submit_report','notify_on_follow',
  'notify_mentions_from_content','create_bookmark_folder',
  'consume_post_boost','get_boost_allowance','request_account_deletion',
  'cancel_account_deletion','request_data_export'
);

-- Verify triggers exist
SELECT tgname, tgrelid::regclass FROM pg_trigger
  WHERE tgname IN (
    'notify_on_follow_trigger',
    'notify_mentions_on_post_trigger',
    'notify_mentions_on_reply_trigger'
  );
```

#### RLS and Storage Access Tests (against staging)

| Test | Expected Result |
|------|----------------|
| Public profile visible to unauthenticated user | Returns profile data |
| Private profile visible to unauthenticated user | Returns empty/403 |
| Private profile visible to owner | Returns profile data |
| Private profile visible to accepted follower | Returns profile data |
| Private profile visible to non-follower | Returns empty/403 |
| Blocked user cannot view blocker's profile | Returns empty/403 |
| Message request between non-blocked users succeeds | Returns 201 |
| Read receipt marking by conversation member succeeds | Returns 200 |
| Attachment signed URL accessible by conversation member | Returns signed URL |
| Attachment signed URL denied to non-member | Returns 403 |
| Muted conversation suppresses notification | No notification created |
| Notification preference `messages: false` suppresses | No notification created |

#### Existing Data Integrity (against staging)

- [ ] Row counts on `profiles`, `posts`, `follows`, `conversations`, `messages` unchanged pre/post migration
- [ ] No null `is_private` values (all defaulted to false)
- [ ] No null `follows.status` values (all defaulted to accepted)
- [ ] Existing storage buckets (`media`, `avatars`, `banners`) unchanged
- [ ] No data loss in any existing table

---

## 4. Application Integration Verification

All application code is compatible with the expected final database schema:

| Area | Status | Evidence |
|------|--------|----------|
| Profiles & privacy | ✅ | `canViewProfile()` handles `is_private` true/false/null |
| Blocking & follow requests | ✅ | Bidirectional block checks + `is_current_user_blocked()` helper |
| Notifications | ✅ | `message` type handled in UI; `createMessageNotification()` implemented |
| Messaging & requests | ✅ | All API routes implemented and tested |
| Read receipts | ✅ | `POST /api/messages/read-receipts` + `mark_messages_read()` RPC |
| Attachments | ✅ | Upload + signed-url routes with membership enforcement |
| Conversation mutes | ✅ | `toggleMute()` in UI; `conversation_mutes` table in types |
| PawPass | ✅ | Existing PawPass tables/functions from 0013 in consolidated |
| Account data rights | ✅ | New tables only; existing code unaffected |

**`database.types.ts`** already includes type definitions for `message_reads`, `message_attachments`, `conversation_mutes`, and the `mark_messages_read` function.

### Verification Results

- TypeScript: `tsc --noEmit` clean (after clearing `.next/types` cache)
- Tests: 332 passed across 33 files
- Production build: `next build --turbopack` succeeded (45 routes)

---

## 5. Outstanding Blockers

| Blocker | Required Action | Owner |
|---------|----------------|-------|
| No staging Supabase environment available | Provision staging project before production migration | DevOps |
| Production migrations not yet applied | Requires explicit permission after staging validation | Deploy team |
| No application-level rate limiting | Recommended for production (not blocking) | Backend |
| SMTP not wired up | Email notifications require SMTP configuration | Backend |

---

## 6. Production Migration Readiness Recommendation

**CONDITIONAL GO** ✅

### Conditions to meet before production migration:

1. [ ] **Provision staging Supabase environment** (none currently exists)
2. [ ] **Run manual rehearsal** against staging using the instructions in Section 3
3. [ ] **Verify all post-migration validation queries** pass against staging
4. [ ] **Take full production backup** before applying migrations
5. [ ] **Test rollback SQL** on staging
6. [ ] **Obtain explicit permission** to apply production migrations
7. [ ] **Schedule maintenance window** for low-traffic period

### If all conditions met: GO for production migration using the 11-migration deduplicated order.

### If any condition unmet: NO-GO until resolved.

---

## Verification Results

- TypeScript: `tsc --noEmit` clean
- Tests: 332 passed across 33 files (7 pre-existing unhandled rejections from settings/page.test.tsx environment issue — not test failures)
- Production build: `next build --turbopack` succeeded (45 routes)
- No production migrations applied
- No production data modified
- No deploy/push performed
- No staging environment connected (none available)
