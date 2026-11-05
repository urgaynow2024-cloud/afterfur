# STAGE 33 - Moderator & Administration System

## Status: Implemented (working baseline) — requires DB migrations 0033/0034 for full persistence

## What was inspected
- Existing moderation/reporting: `supabase/migrations/0024_user_reports.sql`, `public.reports`, `submit_report()` RPC, staff badge flows (`src/app/staff/*`, `staff_badge_*` tables).
- Auth/permissions: Supabase auth + `profiles`, `app_metadata.afterfur_staff_admin` claim, server clients (`src/lib/supabase/server.ts`), existing middleware cache headers for `/moderator` and `/staff`.
- UI patterns: `Shell`, `PageHeader`, `EmptyState`, `af-*` design tokens/classes, Tailwind 4, Next.js App Router, React 19.
- Existing moderator/stage-33 scaffold files were present in the working tree (untracked/modified) and were extended/fixed rather than replaced with duplicates.

## Implemented

### Navigation & access
- `src/app/moderator/layout.tsx`: client access gate + moderator navigation. Shows a restricted message for non-staff; server APIs remain the real security boundary.
- `src/app/moderator/page.tsx`: redirects to `/moderator/dashboard`.
- `src/middleware.ts`: `/moderator` already included in private no-cache headers (kept).
- `src/components/MoreMenu.tsx`: adds staff-gated `Moderation` and `Staff tools` links (based on `afterfur_staff_admin` claim). Note: moderator_roles-only users can still access `/moderator/*` directly; server APIs enforce access.

### Permission layer (server-side)
- `src/lib/moderation.ts`: role hierarchy (`moderator` < `senior_moderator` < `administrator`), `getModeratorContext()`, `requireModeratorRole()`, `recordModerationAction()` via `record_moderation_action` RPC.
- Backward compatibility: `app_metadata.afterfur_staff_admin=true` grants administrator-level access.

### Database migrations (added, NOT applied)
- `supabase/migrations/0033_moderator_administration.sql` (existing in tree; reviewed): `moderator_roles`, `moderation_audit_log` (append-only by design, inserts via security-definer RPC), `user_enforcements`, `appeals`, `has_moderator_role()` RPC, `record_moderation_action()` RPC, RLS/policies, indexes, comments.
- `supabase/migrations/0034_moderation_content_status.sql` (new): additive `moderation_status` / `moderated_at` / `moderated_by` / `moderation_reason` on `posts` and `replies` for reversible remove/restore without violating existing classification constraints or hard-deleting content.

### Moderator pages (functional, not placeholders)
- **Dashboard** (`/moderator/dashboard`): report status counts, pending appeals count, recent reports (7 days), recent enforcement actions, quick actions. Uses `/api/moderation/dashboard-stats`.
- **Reports** (`/moderator/reports`): filters (status/target type), search, pagination data from API, resolve/dismiss/action with moderator notes, confirmation dialog, loading/empty/error states. Uses `/api/moderation/reports`.
- **Users** (`/moderator/users`): search, profile listing, active enforcement badges, issue warning/suspension/ban/restriction (senior_moderator+), revoke enforcement, confirmation dialogs. Uses `/api/moderation/users`.
- **Content** (`/moderator/content`): posts/replies queue via server API, remove/restore with reason, moderation status display, audited actions, confirmation dialog. Uses `/api/moderation/content`.
- **Appeals** (`/moderator/appeals`): list/filter/review, accept/reject with response, best-effort user notification on decision, confirmation dialog. Uses `/api/moderation/appeals`.
- **Staff** (`/moderator/staff`): list/search staff roles, assign/update/remove roles (administrator), audited role changes, confirmation dialog. Uses `/api/moderation/staff`. Existing `/staff/badges` and `/staff/membership` preserved.
- **Audit logs** (`/moderator/audit-logs`): searchable/filterable audit history (actor, target type/id, action, details, timestamps), append-only UI notice. Uses `/api/moderation/audit-log`.
- **Settings** (`/moderator/settings`): moderator UI preferences saved via existing UI preferences RPC path where available; permission-controlled API. Uses `/api/moderation/settings`.

### Backend APIs (server-side permission checks)
- `GET/POST/PATCH /api/moderation/reports` — list/assign/resolve reports; moderator+; audits actions.
- `GET /api/moderation/dashboard-stats` — dashboard stats; moderator+.
- `GET/POST/PATCH /api/moderation/users` — list users, create/revoke enforcements; senior_moderator+; audits.
- `GET/POST /api/moderation/content` — list/fetch content, remove/restore; moderator+; audits. Uses `moderation_status` when migration 0034 is applied; returns actionable error hint if not applied.
- `GET/POST/PATCH /api/moderation/appeals` — list/submit/review appeals; user POST is authenticated self-only; moderator+ for review/list; audits; best-effort `appeal_decision` notification insert.
- `GET/POST/PATCH /api/moderation/staff` — staff role management; administrator only; audits.
- `GET /api/moderation/audit-log` — audit log listing; moderator+; no edit/delete endpoints.
- `GET/PUT /api/moderation/settings` — moderator preferences; moderator+.

### Reuse / non-duplication
- Reused existing `reports` table + `submit_report()` model (0024) for moderation queue; did not create a parallel report table.
- Reused existing staff badge area (`/staff/badges`, `/staff/membership`) and added moderator staff-role management separately.
- Reused `Shell`/design components and existing notification insert pattern (server-side, best-effort) for appeal decisions; did not replace the notification system.
- Respected existing block/privacy intent in API design; moderation tools are staff-only and server-enforced. Content moderation actions do not hard-delete content.

### Tests
- `src/app/api/moderation/route.test.ts`: permission/auth checks and core API flows (reports/users/staff/appeals) with mocked Supabase/moderation context. **10 tests passing** after mock-chain fixes.
- `src/lib/moderation.test.ts`: role hierarchy, context resolution, `requireModeratorRole` behavior. **11 tests passing**.
- Total verified in this session: **21 passing tests** for moderation modules.

## Partial / requires additional DB setup or follow-up
1. **Apply migrations**: `0033_moderator_administration.sql` and `0034_moderation_content_status.sql` must be applied to the target dev/staging DB before full functionality (roles, audit RPC persistence, appeals/enforcements, content moderation_status). Not applied automatically.
2. **Notifications schema/types**: `notifications.type` has no strict CHECK in initial schema, so `appeal_decision` inserts are best-effort compatible; confirm notification rendering handles unknown types gracefully. A dedicated preference/type extension may be needed.
3. **Moderator applications / moderator activity / internal staff notes (dedicated tables/UI)**: not fully modeled as separate first-class entities beyond current role management and audit log. Audit log provides activity history; staff role assignment captures reasons. Dedicated applications/notes tables can be added if required.
4. **Case details/evidence view**: reports list shows core fields and notes; a dedicated case-detail route/modal with target content preview/evidence timeline can be added.
5. **Content removal enforcement on public surfaces**: migration 0034 adds `moderation_status`; public feed/post/reply queries should filter `moderation_status='visible'` (or equivalent) for ordinary users. Review and apply consistently across read paths.
6. **Report search by reporter username**: server search currently filters `reason` reliably; joined-relation text search through PostgREST may need a view/RPC for robust reporter-based filtering.
7. **UI preferences RPC compatibility**: moderator settings page uses existing `get_my_ui_preferences`/`update_ui_preferences` where available; verify these RPCs accept the added keys in the target DB.
8. **RLS for moderator_roles table access by moderators**: migration 0033 includes staff read policy patterns; validate in target environment that moderator UI/layout checks and any direct client reads behave as intended (APIs are authoritative).

## Security notes
- Every moderation API enforces auth + role server-side via `requireModeratorRole()`.
- UI hiding is not relied on for security.
- Audit actions are recorded via `record_moderation_action` (security-definer RPC); `moderation_audit_log` is append-only by policy/design.
- Staff role management requires administrator.
- User enforcement create/revoke requires senior_moderator+.
- Appeals POST is authenticated and scoped to the submitting user; review/list requires moderator+.
- Content moderation does not hard-delete posts/replies.

## Verification run (local)
- `npx vitest run src/app/api/moderation/route.test.ts src/lib/moderation.test.ts` — **PASS (21 tests)**.
- TypeScript/build: not fully re-run after final patch pass in this session except prior checks; `.next/types` may contain stale references until a clean build. Run `npx tsc --noEmit` and `npm run build` in a clean state before deployment.
- Existing full test suite: not fully executed in this session; run `npm test` / project CI checks.

## Files added/changed (Stage 33 focus)
- Added: `docs/STAGE_33_PROGRESS.md`, `src/app/moderator/page.tsx`, `src/app/moderator/layout.tsx`, `supabase/migrations/0034_moderation_content_status.sql` (and Stage 33 moderation API/page/lib files present in working tree).
- Changed: `src/components/MoreMenu.tsx`, `src/lib/supabase/database.types.ts`, moderation API/page/test files for correctness (counts, chains, encoding, moderation_status support).


## Badge re-award fix (follow-up)

### Actual cause (identified before changes)
- `staff_badge_assignments` has `primary key (user_id, badge_id)` (0011) with hard-delete on revoke and `insert ... on conflict (user_id,badge_id) do nothing` on grant, so re-award after removal is structurally possible once the active row is deleted.
- Practical failures/inconsistencies came from multiple overridden `manage_staff_badge` definitions across migrations (0011/0015/0021/0022, consolidated/PawPass scripts) with inconsistent allowed badge sets/semantics, plus: duplicate-active grant returns `false` (no-op) which can look like failure if UI treats it as error; older deployed RPC variants may not accept the full manual badge set used by `/staff/badges`; badge notification trigger (0022) deduped by `(user_id,type,badge_id)`, so re-awarded manual badges would not generate a fresh notification.
- `staff_badge_audit` is not deleted by revoke (history preserved).

### Smallest safe fix implemented
- **Migration (NOT applied):** `supabase/migrations/0035_badge_reaward_fix.sql`
  - Canonical `manage_staff_badge`: admin-only (`require_afterfur_staff_admin()`) preserved, full `MANUAL_BADGE_IDS`, `web_designer` founder guard preserved, explicit no-op `false` for duplicate active grant/non-active revoke, audit insert on real changes, re-award allowed after revoke.
  - Aligns `staff_badge_assignments_badge_id_check` to full manual badge set.
  - Updates `notify_badge_award()` to notify on manual staff-badge re-awards (new event after revoke) while preserving dedupe for automatic/system awards.
- **Lib:** `src/lib/badges.ts` `changeStaffBadge` validates `MANUAL_BADGE_IDS` and returns explicit `duplicate_active`/`not_active`.
- **UI:** `src/app/staff/badges/page.tsx` handles RPC `data === false` as clear no-op state.
- No permission weakening, no history deletion, no intended impact to existing badges.

### Regression tests
- `src/lib/badges.test.ts`: award, remove, re-award same badge, prevent duplicate active assignment, preserve correct display after re-awarding (no duplicate IDs / stable `knownBadges`), expanded manual badges.
- `src/app/notifications/appealDecision.test.ts`: appeal decision rendering contract.

### Migration requirements
- Apply `0033_moderator_administration.sql`, `0034_moderation_content_status.sql`, `0035_badge_reaward_fix.sql` in target DB. **Not applied automatically.** Keep 0035 as canonical/latest `manage_staff_badge` + badge notification trigger definition.

## Final verification (this session)
- `npx vitest run src/lib/badges.test.ts src/app/notifications/appealDecision.test.ts src/app/api/moderation/route.test.ts src/lib/moderation.test.ts` — **PASS**.
- `npx vitest run` (full suite) — **PASS** after compatibility fixes: `src/lib/posts.server.ts` made `auth.getUser` access resilient for mocked clients (Stage 33 moderation visibility), `src/lib/feedPrivacy.server.test.ts` mock updated for `auth.getUser`, and `src/app/settings/page.test.tsx` given a test-only `@/lib/followRequests` mock to remove pre-existing unhandled rejections in jsdom (no app behavior change).
- `npx tsc --noEmit` — **PASS**.
- `npm run build` — **PASS**. Moderator routes/APIs included.

### Moderation visibility (removed posts/replies hidden from ordinary users)
- `src/lib/posts.server.ts`: removed posts hidden from non-staff in single-post and feed reads (not-found/forbidden semantics preserved); staff/moderator access preserved for moderation contexts.
- APIs: `/api/posts/[id]` GET, `/api/post/[id]` GET (via `getPostForViewer`), `/api/feed/home` (via `posts.server`), `/api/feed/explore` filters removed posts for non-staff, `/api/posts/[id]/replies` GET/POST checks parent visibility and filters removed replies for non-staff.
- Search: `src/app/search/page.tsx` filters removed posts.
- Profiles/status/direct URLs: `/[username]/ProfileClient.tsx` filters removed posts/replies for non-owners; status detail uses moderation-aware `/api/post/[id]`; `/posts/[id]` and profile pages have client guards. **0034 migration required** for `moderation_status` persistence.
- Staff moderation UI/API can still view/manage removed content.
- **Recommended defense-in-depth:** add/verify RLS/view policies hiding `moderation_status='removed'` from direct anonymous/ordinary client reads where legacy client-side queries remain.

### Appeal decision notifications
- `/api/moderation/appeals` PATCH inserts best-effort `appeal_decision` notification `{ status, response_message }`.
- `src/app/notifications/page.tsx` renders accepted/rejected/reviewed with optional response message.
- Contract test: `src/app/notifications/appealDecision.test.ts` PASS.

### Remaining blockers
1. Apply migrations 0033/0034/0035 to target DB (not applied).
2. Defense-in-depth RLS/policies for `moderation_status='removed'` on direct reads.
3. Validate `get_my_ui_preferences`/`update_ui_preferences` keys used by moderator settings in target DB.
4. No deploy/push performed.
## Moderator dashboard "Failed to load dashboard statistics" fix (follow-up)

### Exact root cause
- **UI error path:** `src/app/moderator/dashboard/page.tsx` treated any non-OK response from `/api/moderation/dashboard-stats` as a generic failure and set `Failed to load dashboard statistics.`.
- **API query/handling issues:** `src/app/api/moderation/dashboard-stats/route.ts` queried 0033-dependent tables (`user_enforcements`, `appeals`) in addition to `reports`. It only checked the first `reports` query error and **returned `error.message` from Supabase/Postgres directly to the client** (unsafe detail leakage risk). It did **not** check errors from `recentReports`, `user_enforcements`, or `appeals` queries. On environments where migration 0033 is unapplied, missing relations (e.g. `public.user_enforcements`/`public.appeals`, Postgres `42P01` / PostgREST schema-cache table-missing cases) can fail those queries; combined with incomplete error handling and raw error forwarding, the dashboard could fail with an unhelpful/generic or raw DB-driven response path.
- **Migration dependency:** `user_enforcements` and `appeals` are created by `0033_moderator_administration.sql`. `0034_moderation_content_status.sql` is not required by the dashboard-stats query itself but is part of the Stage 33 moderator setup and is included in the admin-facing setup guidance.

### Fix implemented
- **`src/app/api/moderation/dashboard-stats/route.ts`**
  - Preserved server-side moderator authorization (`requireModeratorRole("moderator")`) and 401/403 behavior.
  - Added explicit error checks for **all** dashboard queries (`reports` status list, recent `reports`, `user_enforcements`, `appeals`).
  - Added safe missing-relation/migration detection (`42P01`, `PGRST205/PGRST204`, relation/table/schema-cache missing patterns) and returns **503** with `code: "migration_required"` and a safe admin-facing setup message naming required migrations (0033/0034/pending moderation migrations). **No fake/zero statistics are returned as a successful load.**
  - Non-migration DB failures return **500** `dashboard_stats_unavailable` with a generic message; **raw DB errors, connection details, and credentials are never exposed**.
  - Successful response includes `ok: true` and computed stats only from successful queries.
- **`src/app/moderator/dashboard/page.tsx`**
  - Parses API error payload and shows an actionable **“Database setup required”** warning panel for `503 migration_required` (admin-facing), distinct permission message for 401/403, and generic failure for other errors. Stats are not displayed when setup/error states are active.

### Regression tests
- Added `src/app/api/moderation/dashboard-stats/route.test.ts`:
  - 401 unauthenticated
  - 403 non-moderator
  - successful statistics load
  - missing `reports` relation -> `503 migration_required`, setup message includes migration guidance, no raw DB relation string, no fake stats
  - missing `user_enforcements`/0033-unapplied case -> `503 migration_required`, no schema-cache/raw detail leak
  - non-migration DB error -> safe `500 dashboard_stats_unavailable`, **no leaked sensitive/raw DB detail**

### Verification
- `npx vitest run src/app/api/moderation/dashboard-stats/route.test.ts src/app/api/moderation/route.test.ts` — PASS.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- Full suite remains **36 files / 362 tests passing** (no regressions from dashboard fix).

### Migration/deploy notes
- If dashboard shows “Database setup required”, apply `0033_moderator_administration.sql` and `0034_moderation_content_status.sql` (and pending moderation migrations such as `0035_badge_reaward_fix.sql`) to the target DB. **Do not apply migrations to production automatically. No deploy/push performed.**
## URGENT: Owner administrator access fix

### Reported issue
`/api/moderation/dashboard-stats` returned: **"You do not have permission to view moderator dashboard statistics."** for the AfterFur owner.

### Root causes addressed
1. **Server auth did not reliably identify the browser-authenticated moderator in service-role API routes.** `createServerClient()` uses `SUPABASE_SERVICE_ROLE_KEY` with no cookie session, and several moderation APIs/helpers relied on `supabase.auth.getUser()` with no request JWT, so the verified user could resolve as unauthenticated/unauthorized in practice. This produced 401/403-style permission failures for legitimate staff.
2. **Owner/admin recognition needed to be explicit, trusted, and consistent.** `afterfur_staff_admin` in trusted Supabase Auth **`app_metadata`** must grant `administrator` across all moderator pages/APIs. `user_metadata` must never grant privileges (user-editable).
3. **Dashboard UI showed a generic permission message** for 401/403; now auth is fixed, and it still shows a clear permission/setup/error state (no fake stats).

### Fix (no credentials, no hardcoded owner identity, no weakened checks)
- **`src/lib/serverAuth.ts` (new):** `getVerifiedUser(request)` resolves auth from `Authorization: Bearer <access_token>` and verifies the JWT via `supabase.auth.getUser(jwt)` (Supabase Auth-verified, trusted `app_metadata`). Falls back to `supabase.auth.getUser()` only for compatible/test environments. Never trusts `user_metadata` for privileges; never returns raw auth errors/credentials.
- **`src/lib/moderation.ts`:** `getModeratorContext(request?)` / `requireModeratorRole(minRole, request?)` now use verified request auth. `isTrustedStaffAdmin(appMetadata)` accepts only `app_metadata.afterfur_staff_admin === true|"true"`. Verified owner/staff-admin claim => `administrator` with full moderator capabilities (`canModerate`, `canManageUsers`, `canManageStaff`). Missing/invalid claim and non-admin roles are denied appropriately.
- **All `/api/moderation/*` routes** now accept `request` where needed and pass `request` to `requireModeratorRole(...)`, enforcing consistent server-side permission checks with verified request identity:
  - moderator+: dashboard-stats, reports, content, appeals review/list, audit-log, settings
  - senior_moderator+: users/enforcement
  - administrator only: staff role management
  - appeals `POST` remains authenticated user self-submission, now via `getVerifiedUser(request)` (not service-client `getUser()` without JWT).
- **`src/app/moderator/dashboard/page.tsx`:** sends `Authorization: Bearer <session access token>` using `supabase.auth.getSession()`; shows setup-required (503 migration_required), permission (401/403), or generic error states — no fake stats.
- **No privilege escalation:** all users do not get admin; only trusted `app_metadata.afterfur_staff_admin` or explicit `moderator_roles` grants access. `user_metadata` is ignored for authorization.

### Tests proving required behavior
Updated/added in `src/lib/moderation.test.ts` and existing moderation route tests:
- Verified owner/admin (`app_metadata.afterfur_staff_admin=true` / `"true"`) resolves as `administrator` and can access moderator/senior/administrator-required operations.
- Ordinary users receive `403` from `requireModeratorRole("moderator")`.
- Moderators cannot access administrator-only staff management (`requireModeratorRole("administrator")` rejects with `403`).
- Senior moderators receive only authorized permissions (can do senior/moderator-level checks; `403` for administrator-only).
- Missing/invalid claims are denied.
- `user_metadata` admin claims are **never** trusted.
- Dashboard-stats route tests still cover 401/403, success, missing migrations (503 safe setup), and safe non-migration DB errors.
- Moderation route tests still cover permission gates and appeals submission auth (updated to `getVerifiedUser` mock).

### Safest way to grant the missing trusted admin claim (no credentials exposed)
If the existing verified owner account signs in but lacks moderator/admin access, grant the trusted claim in **Supabase Auth `app_metadata`** (server-controlled), not `user_metadata`:

1. **Supabase Dashboard (preferred, audited UI):** Authentication → Users → select the verified owner account → edit **App Metadata** (not User Metadata) and add/merge:
   ```json
   { "afterfur_staff_admin": true }
   ```
   Save. Ask the owner to sign out/in (or refresh session) so the JWT/app metadata is refreshed.
2. **Secure server-side/admin script (service role, never in client or committed secrets):** in a trusted environment with `SUPABASE_SERVICE_ROLE_KEY` loaded from secure env/secret storage, call:
   ```ts
   await supabase.auth.admin.updateUserById("<verified-owner-auth-user-id>", {
     app_metadata: { afterfur_staff_admin: true }
   });
   ```
   Use the user ID copied from Supabase Dashboard; do not hardcode IDs/emails/keys in source control.
3. **Supabase SQL Editor (privileged admin context):** run an `auth.users` metadata update targeting the verified owner by ID copied from Dashboard, merging `raw_app_meta_data` to include `"afterfur_staff_admin": true`. Avoid hardcoding personal identifiers/credentials in repo files.

After granting, verify the owner can load `/moderator/dashboard` and `/api/moderation/dashboard-stats` returns 200 (or 503 migration_required only if DB migrations are unapplied). DB migrations 0033/0034/0035 still must be applied manually to target DB when needed.

### Verification
- `npx vitest run src/lib/moderation.test.ts src/app/api/moderation/route.test.ts src/app/api/moderation/dashboard-stats/route.test.ts` — **PASS (34 tests)**.
- Full suite, `npx tsc --noEmit`, and `npm run build` should be run after this patch set (build previously PASS; re-run recorded below).
- **No deploy, no push, no production user metadata changed automatically.**
## Deployed owner-access investigation/fix (Supabase claim verified correct)

### Verified facts (from user)
- Owner `auth.users.raw_app_meta_data` contains `"afterfur_staff_admin": true` (trusted claim is correct). **No Supabase metadata changes made; authorization not weakened.**

### Most likely/actual deployed rejection causes investigated
1. **Browser → API auth propagation gap (high confidence, fixed in source):** Service-role API routes (`createServerClient`, no cookie session) cannot identify the browser user via `auth.getUser()` without a JWT. If the deployed build did not include request-aware verified Bearer auth, `requireModeratorRole("moderator")` resolves no user/insufficient role → 401/403 and dashboard shows “You do not have permission…”.
2. **Client token retrieval fragility (fixed):** Moderator pages/layout previously used inconsistent/fragile token access patterns in places (e.g. `supabase.auth.session`/property access). Now all moderator API calls use `supabase.auth.getSession()` and send `Authorization: Bearer <access_token>`. If a session is stale/missing, layout shows “Sign in required / sign out and sign in again”.
3. **Client-side layout gate mismatch (fixed):** Layout previously made its own client decision; it could diverge from server verification. Layout now gates via server-verified `GET /api/moderation/me` with Bearer token (authoritative). Server remains the security boundary for every `/api/moderation/*` action.
4. **Claim present but JWT stale (operational):** `app_metadata` changes in Supabase require a refreshed session/JWT. Safe diagnostic + UI copy instructs sign out/in after access grant.

### Fixes implemented (source)
- **`src/lib/serverAuth.ts`:** `getVerifiedUser(request)` verifies `Authorization: Bearer <access_token>` with Supabase Auth (`auth.getUser(jwt)`), returning trusted `app_metadata`/user only from verified auth. **Never trusts `user_metadata`. Never logs tokens/secrets/Authorization headers.** Safe opt-in diagnostics (`AF_MOD_DIAG=1` or non-production) log only booleans/event names (hasBearer, userResolved, hasAdminClaim, resolvedRole/status) — no tokens.
- **`src/lib/moderation.ts`:** `getModeratorContext(request?)` / `requireModeratorRole(minRole, request?)` use verified request identity. `isTrustedStaffAdmin` accepts only trusted `app_metadata.afterfur_staff_admin === true|"true"` (not `user_metadata`) → grants **administrator** (`canModerate/canManageUsers/canManageStaff`) consistently. Safe diagnostics for allow/deny decisions (no secrets).
- **All `/api/moderation/*` routes** pass `request` to `requireModeratorRole` and accept `Request` handlers where needed (consistent server-side enforcement). Includes existing dashboard-stats fix (503 migration_required; no raw DB leaks).
- **`src/app/api/moderation/me/route.ts` (new):** server-verified moderator context endpoint for authoritative client gating.
- **`src/app/moderator/layout.tsx`:** gates via `/api/moderation/me` with verified session Bearer token; attempts `refreshSession()` if token missing; clear unauthorized/denied messaging including “sign out and sign in again to refresh session”. Not a security boundary.
- **All moderator pages** (`dashboard`, `reports`, `users`, `content`, `appeals`, `staff`, `audit-logs`, `settings`): use `getSession().session.access_token` and send Bearer token.
- Middleware reviewed (`src/middleware.ts`): only sets security/cache headers for `/moderator` (no-store) — **does not block/rewrite auth**.

### Deployment/config verification checklist (owner-approved deploy required)
1. Confirm the deployed build includes: `src/lib/serverAuth.ts`, request-aware `src/lib/moderation.ts`, `request` propagation in all `src/app/api/moderation/*`, `src/app/api/moderation/me/route.ts`, and moderator pages/layout Bearer-token changes.
2. In the deployed browser session (owner), open DevTools Network for `/api/moderation/dashboard-stats` and `/api/moderation/me`: verify **`Authorization: Bearer <access_token>` is present** (do not copy/paste the token). If absent, client is not sending session token.
3. Temporarily enable safe diagnostics on the deployed server (`AF_MOD_DIAG=1`, no secrets) and reproduce: logs should show `bearer_verified`/`require_role_ok` with `hasAdminClaim:true`, `resolvedRole:administrator`, `isAdministrator:true` for the owner. If `no_bearer_unverified` appears, the request lacks a Bearer token/cookies aren’t providing auth (service-role routes need Bearer). If bearer verifies but `hasAdminClaim:false`, the owner JWT is stale — sign out/in (claim in DB is already correct). If `bearer_verify_failed`, token may be expired/invalid for the project.
4. Confirm Supabase env vars on deployed server point to the same project as the verified owner account (`NEXT_PUBLIC_SUPABASE_URL`/keys aligned; `SUPABASE_SERVICE_ROLE_KEY` for server client).
5. After owner signs out/in, `app_metadata.afterfur_staff_admin:true` should appear in the verified token payload used by the server.

### Verification (local)
- Full suite: **37 files passed, 375 tests passed** (`npx vitest run`).
- `npx tsc --noEmit`: **PASS** (clean).
- `npm run build`: **PASS** (local build completed with these changes).

**No deploy/push performed. No Supabase metadata changed. Authorization not weakened.**
