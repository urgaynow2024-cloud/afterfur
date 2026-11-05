# Stage 32 Final Acceptance Matrix – Staging Environment Integration

## 1. Environment Loading

### New file: `scripts/load-staging-env.ps1`

A shared environment loader that:
- Loads **only** `.env.staging.local` (never `.env.local` / production)
- Validates all required staging variables are present
- Rejects any variable pointing to the production Supabase project
- Exports validated variables as environment variables for caller scripts
- Never prints or exposes credential values
- Supports `-ValidateOnly` switch for validation without side effects

### Required staging variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Staging Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Staging service role key |
| `NEXT_PUBLIC_APP_NAME` | No | App display name (default: "AfterFur Staging") |
| `NEXT_PUBLIC_SITE_URL` | No | Staging site URL |
| `NEXT_PUBLIC_APP_URL` | No | Staging app URL |
| `NEXT_PUBLIC_MEDIA_BUCKET` | No | Default media bucket |
| `MAX_IMAGE_BYTES` | No | Image upload limit (default: 5242880) |
| `MAX_VIDEO_BYTES` | No | Video upload limit (default: 26214400) |

### Template: `.env.staging.example`

Copy to `.env.staging.local` and fill with staging-only credentials:
```powershell
cp .env.staging.example .env.staging.local
# Edit .env.staging.local with staging project credentials
```

### Safety: no accidental production override

- `.env.local` (production) is **never** loaded by staging scripts
- `.env.staging.local` is the **only** env file loaded
- Production host `kunwfddahxkpvsivmmkm.supabase.co` is explicitly rejected
- Missing credentials cause immediate failure (no silent fallback)

---

## 2. Migration Safety Hardening

### Updated: `scripts/rehearse-migrations.ps1`

Safety enhancements:

| Safety Measure | Implementation |
|----------------|---------------|
| Explicit confirmation | `-Confirm` switch is **mandatory** |
| Production host rejection | Rejects `kunwfddahxkpvsivmmkm.supabase.co` |
| Staging host allowlist | Only `*.supabase.co`, `*.supabase.in`, `localhost`, `127.0.0.1` allowed |
| No silent fallback | Fails if credentials missing; never reads `.env.local` |
| Execution logging | JSON log to `logs/migration-rehearsal-<timestamp>.log` |
| Preflight checks | Validates all 11 migration files exist before execution |

### Usage

```powershell
# Step 1: Load and validate staging environment
. ./scripts/load-staging-env.ps1

# Step 2: Run migration rehearsal (requires -Confirm)
.\scripts\rehearse-migrations.ps1 -Confirm
```

### Approved migration order (11 deduplicated migrations)

| Order | Migration |
|-------|-----------|
| 1 | `STAGE_21A_FINAL_BLOCKING_MIGRATION.sql` |
| 2 | `STAGE_21B_PROFILE_PRIVACY_MIGRATION.sql` |
| 3 | `STAGE_21B_FOLLOW_REQUESTS_RLS.sql` |
| 4 | `STAGE_21B_MEDIA_PRIVATE_MIGRATION.sql` |
| 5 | `0024_user_reports.sql` |
| 6 | `0025_follow_and_mention_notifications.sql` |
| 7 | `STAGE_25_MESSAGE_READ_RECEIPTS.sql` |
| 8 | `STAGE_25_MESSAGE_ATTACHMENTS.sql` |
| 9 | `STAGE_26_CONVERSATION_MUTES.sql` |
| 10 | `STAGE_PAWPASS_COMPLETE.sql` |
| 11 | `Account_Data_Rights_Migration.sql` |

### Skipped (redundant)

| File | Reason |
|------|--------|
| `PawPass_Migration.sql` | Byte-identical duplicate of `STAGE_PAWPASS_COMPLETE.sql` |
| `STAGE_PAWPASS_BOOSTS.sql` | Subset of `STAGE_PAWPASS_COMPLETE.sql` |

---

## 3. CSP Configuration

### Updated: `next.config.ts`

The Content Security Policy now reads `NEXT_PUBLIC_SUPABASE_URL` from environment variables:

- **Production**: When `NEXT_PUBLIC_SUPABASE_URL` is unset or points to production, CSP uses the existing restrictive wildcard scope (`https://*.supabase.co`, `wss://*.supabase.co`, etc.)
- **Staging**: When `NEXT_PUBLIC_SUPABASE_URL` points to a staging Supabase project, the specific staging host (`https://<host>`, `wss://<host>`) is added explicitly to `connect-src` and `img-src`
- **No unrestricted wildcards**: Staging hosts are added as specific hostnames, not wildcards

### CSP headers affected

| Directive | Production | Staging (when URL set) |
|-----------|-----------|----------------------|
| `connect-src` | `'self' https://*.supabase.co wss://*.supabase.co` | + `https://<staging-host> wss://<staging-host>` |
| `img-src` | `'self' data: blob: https://*.supabase.co` | + `https://<staging-host>` |

### vercel.json

No changes needed - CSP is managed by `next.config.ts` at build time. Vercel dashboard headers remain for production.

---

## 4. Validation Tooling

### Updated: `scripts/validate-migration-schema.ps1`

Enhanced validation checks:

| Check | Description |
|-------|-------------|
| Migration execution log | Verifies log file exists and reports success/failure counts |
| Tables | 10 expected tables exist |
| RLS enabled | Row level security on all new tables |
| RLS policies | 20 expected policies across all tables |
| Storage buckets | 2 private buckets (`media_private`, `message_attachments`) |
| Storage policies | 8 expected storage object policies |
| Storage read closed | Read policy uses `using (false)` on both buckets |
| Functions | 11 expected functions exist |
| Triggers | 3 expected triggers exist |
| Data integrity | Profiles table is empty or small (no production data leak) |

### Validation report

A JSON report is written to `logs/migration-validation-<timestamp>.json` with:
- Timestamp, staging host, pass/fail/warning counts
- Overall status (PASSED/FAILED)
- Reference to migration log file

### Rerun safety

- All checks are **read-only** - safe to rerun indefinitely
- Previously applied migrations are handled by idempotent SQL (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`)
- No data is modified by validation

### Usage

```powershell
# Step 1: Load staging environment
. ./scripts/load-staging-env.ps1

# Step 2: Validate schema (with optional log file reference)
.\scripts\validate-migration-schema.ps1 -LogFile logs/migration-rehearsal-<timestamp>.log
```

---

## 5. Complete Workflow

```powershell
# 1. Create staging env file
cp .env.staging.example .env.staging.local
# Edit .env.staging.local with staging-only credentials

# 2. Load and validate environment
. ./scripts/load-staging-env.ps1

# 3. Run migration rehearsal (requires explicit -Confirm)
.\scripts\rehearse-migrations.ps1 -Confirm

# 4. Validate staging schema
.\scripts\validate-migration-schema.ps1 -LogFile logs/migration-rehearsal-<timestamp>.log

# 5. Review logs in logs/ directory
```

---

## 6. Verification Results

- TypeScript: `tsc --noEmit` clean (after clearing `.next/types` cache)
- Tests: 332 passed across 33 files
- Production build: `next build --turbopack` succeeded (45 routes)
- No staging environment connected (none available yet)
- No production migrations applied
- No production data modified
- No deploy/push performed
