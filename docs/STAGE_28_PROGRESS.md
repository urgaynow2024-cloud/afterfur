# Stage 28 Final Acceptance Matrix – Production Deployment & Launch Preparation

## 1. Environment Configuration Audit

### Environment variable separation (verified correct)
| Variable | Scope | Used in |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | `src/lib/supabase/client.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | `src/lib/supabase/server.ts` only |
| `DATABASE_URL` | Server only | Not referenced in source (configured for Supabase CLI) |
| `NEXT_PUBLIC_APP_URL` | Client + Server | Client config |
| `NEXT_PUBLIC_MEDIA_BUCKET` | Client | Not referenced in source |
| `MAX_IMAGE_BYTES`, `MAX_VIDEO_BYTES` | Server | Not referenced in source |
| `SMTP_*` | Server only | Not referenced in source |
| `AGE_VERIFICATION_*` | Server | Not referenced in source |
| `PRIME_*` | Server | Not referenced in source |

### Security verification
- `SUPABASE_SERVICE_ROLE_KEY` is **only** used in `src/lib/supabase/server.ts` — never imported by client components
- `createClient()` (anon) and `createServerClient()` (service role) are in separate modules
- `.env*` is in `.gitignore` — secrets never committed
- `.env.example` updated to list all required variable names (no secrets)
- `.env.local` contains real secrets for local development only

### Vercel compatibility
- `vercel.json` configures crons (deletion-worker, reminder-worker) and security headers
- `next.config.ts` has matching security headers and CSP
- `src/middleware.ts` sets cache-control headers for protected routes
- All env vars with `NEXT_PUBLIC_` prefix are safe for Vercel edge/runtime

## 2. Unapplied Production Migrations (Ordered)

### Already applied (in ALL_MIGRATIONS_CONSOLIDATED.sql)
Numbered migrations 0001–0023 covering: profiles, posts, likes, reposts, bookmarks, follows, replies, notifications, conversations, messages, media, badges, PawPass entitlements, replies management, badge catalogue, terms acceptance, customisation, bookmark folders, AD Creator badge, badge notifications, post length check.

### Not yet applied (in order)

| # | Migration File | Purpose | Dependencies |
|---|---------------|---------|-------------|
| 1 | `STAGE_21A_FINAL_BLOCKING_MIGRATION.sql` | Bidirectional blocking helpers, block triggers on likes/reposts/replies/notifications | 0001–0003 |
| 2 | `STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql` | `is_private` column on profiles, `status` column on follows | 0001–0003 |
| 3 | `STAGE_21B_FOLLOW_REQUESTS_RLS.sql` | Restrict pending follow requests to recipient | STAGE_21B profile privacy |
| 4 | `STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql` | `media` table + `media_private` storage bucket | 0001–0003 |
| 5 | `0024_user_reports.sql` | `reports` table for posts/replies/users | 0001–0003 |
| 6 | `0025_follow_and_mention_notifications.sql` | Follow/mention notification triggers | 0001–0003 |
| 7 | `STAGE_25_MESSAGE_READ_RECEIPTS.sql` | `message_reads` table + `mark_messages_read` RPC | 0006 (direct messages) |
| 8 | `STAGE_25_MESSAGE_ATTACHMENTS.sql` | `message_attachments` table + `message_attachments` bucket | STAGE_25 read receipts |
| 9 | `STAGE_26_CONVERSATION_MUTES.sql` | `conversation_mutes` table | 0006 (direct messages) |
| 10 | `STAGE_PAWPASS_COMPLETE.sql` | PawPass entitlements + founding claims (also in consolidated partially) | 0001–0025 |
| 11 | `PawPass_Migration.sql` | Bookmark folders + monthly discovery boosts (overlaps with 0019/0021) | STAGE_PAWPASS_COMPLETE |
| 12 | `STAGE_PAWPASS_BOOSTS.sql` | Post boosts table + consume function | STAGE_PAWPASS_COMPLETE |
| 13 | `Account_Data_Rights_Migration.sql` | Account deletion + data export requests | 0001–0003 |

### Migration compatibility notes
- All unapplied migrations use `create table if not exists`, `drop policy if exists`, `create or replace function` — idempotent
- All new tables reference existing tables with `ON DELETE CASCADE` — no orphan risk
- All new RLS policies use `drop policy if exists` before creation — safe to re-run
- STAGE_21A blocking migration modifies existing `profiles`/`posts` select policies (adds restrictive layer) — compatible with permissive base policies
- PawPass migrations partially overlap with consolidated 0012–0021 — review before applying to avoid conflicts

### Backup and recovery requirements
- Full Supabase project backup before applying any migration
- Test migration application on a staging project first
- Have rollback SQL ready for each migration (drop table/function/policy)
- Verify RLS policies after each migration batch

## 3. Production Application Checks

| Area | Status | Verification |
|------|--------|-------------|
| Authentication & sessions | ✅ | Supabase Auth with anon client; server-only service role for privileged ops |
| Public profile access | ✅ | `canViewProfile()`: `!isPrivate` → allowed for all viewers |
| Private profile access | ✅ | Owner + accepted followers only; blocked users denied |
| Blocking | ✅ | Bidirectional block checks in API routes + `is_current_user_blocked()` DB helper + triggers on likes/reposts/replies/notifications |
| Reporting | ✅ | `reports` table + `submit_report()` RPC (in 0024) |
| Messaging requests | ✅ | `POST /api/messages/requests` + `POST /api/messages/requests/[id]` accept/reject |
| Read receipts | ✅ | `POST /api/messages/read-receipts` + `mark_messages_read()` RPC |
| Attachments | ✅ | `POST /api/messages/attachments` + `GET /api/messages/attachments/signed-url` |
| Notification delivery | ✅ | `notifications` table + `createMessageNotification()` + `createFollowNotification()` |
| Notification preferences | ✅ | `isNotificationEnabled()` check before creating notifications |
| Muted conversations | ✅ | `conversation_mutes` table checked before notification creation |
| Age-gating (18+) | ✅ | Existing `access_age_verified` badge + `adult-content` route |
| Image upload limits | ✅ | `validateMediaFile()` (5MB images, 25MB videos) |
| Storage permissions | ✅ | Private bucket + RLS uploader-folder isolation + service-role signed URLs |

## 4. Performance and Reliability

### Database queries reviewed
- `get_latest_conversation_messages()` RPC — batch fetches latest messages per conversation
- `mark_messages_read()` RPC — batch marks messages read with conflict handling
- `conversation_participants` queries — indexed on `(conversation_id, user_id)`
- `message_reads` queries — indexed on `(conversation_id)`, `(user_id)`, `(message_id)`
- `message_attachments` queries — indexed on `(conversation_id)`, `(message_id)`, `(uploader_id)`

### Indexing
- All new tables have appropriate indexes on foreign key columns
- `message_reads` has composite unique constraint on `(conversation_id, message_id, user_id)`
- `message_attachments` has unique constraint on `(bucket_id, storage_path)`

### Error handling
- All API routes wrap in try/catch with structured error responses
- Supabase client returns null on missing env vars (graceful degradation)
- RLS policies enforced at database layer as defense in depth

### Rate limiting / abuse protection
- No application-level rate limiting currently implemented (recommended for production)
- Duplicate notification prevention via existing unread notification check
- Duplicate attachment prevention via unique storage_path constraint
- Advisory locks used in PawPass entitlement processing

### Memory / performance concerns
- Message list capped at 100 initial + 150 with pagination
- Realtime channel cleaned up on unmount/conversation switch
- No known memory leaks

## 5. Deployment Safety

### Vercel build configuration
- `next.config.ts`: Turbopack, security headers, CSP, image remote patterns
- `vercel.json`: Crons, security headers, cache-control for protected routes
- `src/middleware.ts`: Cache-control headers, security headers
- Build succeeds with TypeScript checking (`next build` runs tsc)

### Rollback plan
- Revert code via git revert (no production data changes)
- Database rollback: drop tables/functions/policies created by unapplied migrations
- Environment rollback: revert `.env.local`/`vercel.json`/`next.config.ts` changes
- No data migration needed (new tables only, no existing data modified)

### Post-deployment smoke-test checklist
- [ ] Public profile loads without authentication
- [ ] Private profile returns 403 for non-followers
- [ ] Blocked user cannot view blocker's profile
- [ ] Message request creation succeeds between non-blocked users
- [ ] Message request accept creates conversation
- [ ] Read receipt marking succeeds for conversation members
- [ ] Attachment upload succeeds, signed URL accessible by conversation member
- [ ] Attachment signed URL returns 403 for non-member
- [ ] Muted conversation suppresses new-message notification
- [ ] Notification preference `messages: false` suppresses notifications
- [ ] Build passes `npx next build --turbopack`
- [ ] Tests pass `npx vitest run` (332 tests)
- [ ] TypeScript passes `npx tsc --noEmit`

## 6. Documentation Updates

### Files modified
- `D:\Afterfur\.env.example` — Added all required environment variable names (was missing `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`, `NEXT_PUBLIC_MEDIA_BUCKET`, `MAX_IMAGE_BYTES`, `MAX_VIDEO_BYTES`, `SMTP_*`, `AGE_VERIFICATION_*`, `PRIME_*`)

### Files created (migrations, not applied)
- `supabase/migrations/STAGE_25_MESSAGE_READ_RECEIPTS.sql`
- `supabase/migrations/STAGE_25_MESSAGE_ATTACHMENTS.sql`
- `supabase/migrations/STAGE_26_CONVERSATION_MUTES.sql`

### Files created (documentation)
- `docs/PRIVACY_REGRESSION_FIX.md` — Root cause and fix for public/private profile regression
- `docs/STAGE_23_PROGRESS.md` — Direct messaging integration
- `docs/STAGE_24_PROGRESS.md` — Messaging reliability & security hardening
- `docs/STAGE_25_PROGRESS.md` — Read receipts & secure attachments
- `docs/STAGE_26_PROGRESS.md` — Messaging & notification integration
- `docs/STAGE_27_PROGRESS.md` — Production readiness & migration validation
- `docs/STAGE_28_PROGRESS.md` — This file

## 7. Remaining Blockers

| Blocker | Required Action | Owner |
|---------|----------------|-------|
| Production migrations not applied | Review and apply migration list above with explicit permission | Deploy team |
| No application-level rate limiting | Consider adding rate limiting for auth/API endpoints | Backend |
| `DATABASE_URL` not referenced in source | Verify if needed for Supabase CLI or direct DB access | DevOps |
| SMTP not wired up | Email notifications require SMTP configuration | Backend |
| PawPass migration overlap with 0012–0021 | Review for conflicts before applying | Database |

## Verification Results
- TypeScript: `tsc --noEmit` clean
- Tests: 332 passed across 33 files (7 pre-existing unhandled rejections from settings/page.test.tsx environment issue — not test failures)
- Production build: `next build --turbopack` succeeded (45 routes)
- No production migrations applied
- No production data modified
- No deploy/push performed
