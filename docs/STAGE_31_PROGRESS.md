# Stage 31 Final Acceptance Matrix – Staging Environment Provisioning & Migration Rehearsal Preparation

## 1. Environment Separation – Inspected and Documented

### Current Supabase configuration (inspected, credentials not exposed)

| Component | Configuration | Production-specific? |
|-----------|--------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | In `.env.local` (gitignored) | Yes — points to production project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | In `.env.local` (gitignored) | Yes — production anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | In `.env.local` (gitignored) | Yes — production service role key |
| `vercel.json` CSP | `https://*.supabase.co https://*.supabase.in` | Yes — production host patterns |
| `next.config.ts` CSP | `https://*.supabase.co` | Yes — production host patterns |

### Environment separation confirmed

- `.gitignore` excludes all `.env*` files — no env secrets committed
- `.env.example` contains variable names only (no secrets) — created in Stage 28
- `.env.staging.example` created — staging-specific template with staging placeholder values
- No staging Supabase project currently configured
- **Production credentials are NOT used by development or staging** — no staging config exists at all

### Staging environment variables required

| Variable | Purpose | Staging value source |
|----------|---------|---------------------|
| `NEXT_PUBLIC_APP_NAME` | App display name | "AfterFur Staging" |
| `NEXT_PUBLIC_SITE_URL` | Site URL for staging | `https://staging.afterfur.example` |
| `NEXT_PUBLIC_APP_URL` | App URL for staging | `https://staging.afterfur.example` |
| `NEXT_PUBLIC_SITE_NAME` | Site name | "AfterFur Staging" |
| `NEXT_PUBLIC_SUPABASE_URL` | Staging Supabase project URL | Staging project dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon key | Staging project settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service role key | Staging project settings > API |
| `DATABASE_URL` | Staging Postgres connection string | Staging project settings > Database |
| `NEXT_PUBLIC_MEDIA_BUCKET` | Default media bucket | `media` |
| `MAX_IMAGE_BYTES` | Image upload limit | `5242880` (5 MB) |
| `MAX_VIDEO_BYTES` | Video upload limit | `26214400` (25 MB) |
| `SMTP_*` | Email infrastructure | Not required for migration rehearsal |
| `AGE_VERIFICATION_*` | Age gating | Not required for migration rehearsal |
| `PRIME_*` | Prime membership | Not required for migration rehearsal |

### Credential separation rules

- **Never** copy `.env.local` (production) to `.env.staging.local`
- **Always** generate new staging credentials from the staging Supabase project dashboard
- **Never** print or log credential values
- **Always** use `.env.staging.example` as the template (names only, no secrets)

---

## 2. Staging Setup Preparation

### Safest way to provision a separate Supabase project

1. **Create a new Supabase project** via the Supabase dashboard (separate from production project `kunwfddahxkpvsivmmkm`)
2. **Name it** `afterfur-staging` or similar — clearly distinguishable from production
3. **Region**: Same region as production for realistic latency testing
4. **Do NOT** link it to the production Vercel project
5. **Do NOT** import production data — start with empty schema

### Required project settings

| Setting | Value | Reason |
|---------|-------|--------|
| Project name | `afterfur-staging` | Clear separation from production |
| Database | Empty Postgres (fresh Supabase project) | No production data |
| Auth | Enabled (email/password + OAuth if used) | Needed for testing authenticated flows |
| Storage | Enabled with `media_private` and `message_attachments` buckets | Created by migrations |
| Realtime | Enabled | Needed for messaging realtime tests |
| Edge functions | Not required | Not used by migrations |

### Staging environment configuration template

Created: `D:\Afterfur/.env.staging.example`

Copy to `.env.staging.local` and fill with staging-only credentials:
```
cp .env.staging.example .env.staging.local
```

Then edit `.env.staging.local` with values from the staging Supabase project dashboard.

---

## 3. Migration Rehearsal Tooling

Two PowerShell scripts created for repeatable migration verification:

### `scripts/rehearse-migrations.ps1`

Executes the 11 approved migrations in order against staging with:
- Preflight checks (file existence, non-production host confirmation)
- Ordered execution with timing
- Execution logging to `logs/migration-rehearsal-<timestamp>.log`
- Pass/fail summary

### `scripts/validate-migration-schema.ps1`

Validates the staging schema after migration with checks for:
- All 10 expected tables exist
- RLS enabled on all new tables
- Both storage buckets are private
- All expected functions exist
- All expected triggers exist

### Approved migration order (11 deduplicated migrations)

| Order | Migration | Purpose |
|-------|-----------|---------|
| 1 | `STAGE_21A_FINAL_BLOCKING_MIGRATION.sql` | Bidirectional blocking helpers + block triggers |
| 2 | `STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql` | `is_private` column + `follows.status` column + privacy RLS |
| 3 | `STAGE_21B_FOLLOW_REQUESTS_RLS.sql` | Restrict pending follow requests to recipient |
| 4 | `STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql` | `media` table + `media_private` storage bucket |
| 5 | `0024_user_reports.sql` | User reports table + `submit_report` RPC |
| 6 | `0025_follow_and_mention_notifications.sql` | Follow/mention notification triggers |
| 7 | `STAGE_25_MESSAGE_READ_RECEIPTS.sql` | `message_reads` table + `mark_messages_read` RPC |
| 8 | `STAGE_25_MESSAGE_ATTACHMENTS.sql` | `message_attachments` table + `message_attachments` bucket |
| 9 | `STAGE_26_CONVERSATION_MUTES.sql` | `conversation_mutes` table |
| 10 | `STAGE_PAWPASS_COMPLETE.sql` | PawPass (bookmark folders + post_boosts) |
| 11 | `Account_Data_Rights_Migration.sql` | Account deletion + data export requests |

### Skipped migrations (redundant)

| File | Reason |
|------|--------|
| `PawPass_Migration.sql` | Byte-identical duplicate of `STAGE_PAWPASS_COMPLETE.sql` |
| `STAGE_PAWPASS_BOOSTS.sql` | Subset of `STAGE_PAWPASS_COMPLETE.sql` (post_boosts only) |

### Migration execution commands

```powershell
# Load staging env and run rehearsal
.\scripts\rehearse-migrations.ps1

# Or provide credentials explicitly
.\scripts\rehearse-migrations.ps1 -StagingUrl <staging-url> -ServiceRoleKey <staging-key>

# Validate schema after migration
.\scripts\validate-migration-schema.ps1
```

### Post-migration validation queries

After running migrations against staging, verify:

```sql
-- All expected tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('message_reads','message_attachments','conversation_mutes',
                    'reports','bookmark_folders','bookmark_folder_items',
                    'post_boosts','account_deletion_requests','data_export_requests','media');

-- RLS enabled on all new tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('message_reads','message_attachments','conversation_mutes',
                    'reports','bookmark_folders','bookmark_folder_items',
                    'post_boosts','account_deletion_requests','data_export_requests','media');

-- Storage buckets are private
SELECT id, name, public FROM storage.buckets
  WHERE id IN ('media_private','message_attachments');

-- Functions exist
SELECT proname FROM pg_proc WHERE proname IN (
  'mark_messages_read','submit_report','notify_on_follow',
  'notify_mentions_from_content','create_bookmark_folder',
  'consume_post_boost','get_boost_allowance',
  'request_account_deletion','cancel_account_deletion','request_data_export'
);
```

---

## 4. Staging Data Strategy (Synthetic / Anonymized)

### Principle: No production data in staging

- **Never** copy production user profiles, posts, messages, or any PII into staging
- **Never** export production data for staging use
- Use **synthetic data** only for testing

### Synthetic data seeding (for staging only)

If application testing against the migrated staging schema is needed, seed with synthetic data:

```sql
-- Example synthetic profiles (NOT production data)
INSERT INTO public.profiles (id, username, display_name, is_private) VALUES
  ('00000000-0000-0000-0000-000000000001', 'staging_alice', 'Alice Staging', false),
  ('00000000-0000-0000-0000-000000000002', 'staging_bob', 'Bob Staging', true),
  ('00000000-0000-0000-0000-000000000003', 'staging_carol', 'Carol Staging', false);

-- Example synthetic follows
INSERT INTO public.follows (follower_id, following_id, status) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'pending');
```

### Data categories for staging tests

| Category | Synthetic data needed? | Production data allowed? |
|----------|----------------------|-------------------------|
| Profiles | Yes (synthetic usernames) | No |
| Posts | Yes (synthetic content) | No |
| Follows | Yes (synthetic relationships) | No |
| Messages | Yes (synthetic conversations) | No |
| Blocks | Yes (synthetic blocks) | No |
| Storage objects | Yes (synthetic files) | No |

---

## 5. Safety Rules

| Rule | Enforcement |
|------|-------------|
| No production credentials | `.env.local` is gitignored; `.env.staging.local` must use staging-only values |
| No production connection | Rehearsal script explicitly rejects `kunwfddahxkpvsivmmkm.supabase.co` |
| No production data copy | Synthetic data only; no production export/import |
| No production migration application | Scripts are for staging rehearsal only |
| No deploy or push | No git operations in this stage |
| No secret exposure | Credentials never printed or logged |
| No RLS weakening | All migrations enable RLS; validation script verifies RLS is on |

---

## 6. Next Steps (Before Production)

| # | Action | Owner |
|---|--------|-------|
| 1 | Provision staging Supabase project (`afterfur-staging`) | DevOps |
| 2 | Create `.env.staging.local` with staging credentials | Developer |
| 3 | Run `rehearse-migrations.ps1` against staging | Developer |
| 4 | Run `validate-migration-schema.ps1` against staging | Developer |
| 5 | Seed staging with synthetic data and test application flows | QA |
| 6 | Take full production backup | DevOps |
| 7 | Obtain explicit permission to apply production migrations | Product/Engineering lead |
| 8 | Apply the 11 migrations to production in order | Deploy team |
| 9 | Run post-migration validation against production | QA |

---

## Verification Results

- TypeScript: `tsc --noEmit` clean (after clearing `.next/types` cache)
- Tests: 332 passed across 33 files
- Production build: `next build --turbopack` succeeded (45 routes)
- No staging environment connected (none available yet)
- No production migrations applied
- No production data modified
- No deploy/push performed
