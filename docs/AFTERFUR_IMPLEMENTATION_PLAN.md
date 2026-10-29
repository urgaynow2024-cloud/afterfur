# AFTERFUR IMPLEMENTATION PLAN

## Phase A â€” Repository Audit

### Stack
- Next.js 16.4.3 (App Router, webpack build)
- React 19, TypeScript
- Tailwind CSS 4 (PostCSS)
- Supabase (client: `src/lib/supabase/client.ts`)
- Auth: `src/components/AuthProvider.tsx`

### Routes
Home `/`, Explore `/explore`, Search `/search`, Notifications `/notifications`, Messages `/messages`, Bookmarks `/bookmarks`, After Dark `/after-dark`, Profile `/profile`, Settings `/settings`, Sign In `/signin`, Sign Up `/signup`, Forgot/Reset password, Privacy/Terms/Guidelines/Safety, Post detail `/posts/[id]`.

### Components
- `Shell.tsx`: layout, nav, PageHeader, EmptyState. Uses `usePathname` (wrapped in Suspense).
- `AuthProvider.tsx`: session/user context.
- `PostCard.tsx`: feed card.

### Supabase data flow (client)
- Posts: `supabase.from("posts")` select/insert.
- Replies: `replies` table insert/select by `post_id`.
- Profiles: `profiles` table.
- Auth: `supabase.auth`.

### Status (initial)
- Auth/profile mapping: PARTIAL (needs server verification)
- Posts/replies/likes/reposts/bookmarks/follows/media/notifications: to be traced in code.

### X feature comparison (initial)
| X capability | AfterFur equivalent | Status | Work needed |
|---|---|---|---|
| Home feed | `/` feed | PARTIAL | real follows-based feed |
| Post detail | `/posts/[id]` | PARTIAL | reply fix |
| Likes/reposts/bookmarks | PostCard actions | PARTIAL | persistence verified |
| Profiles | `/profile` | PARTIAL | tabs/media |
| Search/Explore | `/search`,`/explore` | PARTIAL | real data |
| Notifications | `/notifications` | PARTIAL | real events |
| Messages | `/messages` | PARTIAL | real DMs |
| Settings | `/settings` | PARTIAL | categories |

### Next steps
- Complete the reply system review and confirm nested replies, loading/error states, and notification creation against the existing Supabase policies.
- Review server-side authorization and RLS without weakening policies or applying migrations as part of UI work.
- Perform desktop and mobile browser verification of the feed, composer, canonical profile and post routes, and responsive navigation.
- Resolve the remaining Supabase client factory lint error by introducing useful generated database types incrementally; avoid an app-wide typing rewrite.
- Review and approve the prepared count-only likes RPC migration before applying it to any Supabase environment. Current `likes manage own` RLS exposes only the signed-in user's own rows, so aggregate totals are hidden until this migration is reviewed and applied.

### UI/UX implementation progress (2026-10-28)
- Added shared dark palette, surface, border, focus, spacing, shell-width, and reduced-motion tokens in `src/app/globals.css`.
- Refined the shared `Shell` with consistent desktop columns, active navigation, mobile bottom navigation, safe-area spacing, and a reachable post action.
- Updated the home feed, inline and modal composers, post cards, media previews, loading/error/empty states, and Creator Spotlight presentation. Preserved For You and Following filters and the local successful-insert feed update.
- Improved public profile, own-profile, canonical post, and discussion page presentation while retaining public `/{username}` and `/{username}/status/{postId}` routes.
- Applied shared styling to search, explore, notifications, messages, settings, authentication, and legal placeholder routes. Legal pages remain placeholders; no policy text or fake data was added.
- Added/extended feed tests for immediate publication, failed inserts, deduplication/order, and initial-fetch races.
- Stabilization: webpack's production build tried `readlink` on the ordinary `src/app/after-dark/page.tsx` file and failed with `EISDIR`. `fs.lstat` confirms the file is a normal file; direct Node `readlinkSync` reproduces `EISDIR` for this Windows file. Turbopack successfully builds the same route tree, so `dev` and `build` scripts now use the already-configured Turbopack integration.
- Reduced lint errors from 40 to 1 and warnings from 34 to 25: removed unsafe auth form casts, corrected post-detail loading dependencies, typed notification/bookmark/profile post data, and fixed effect-triggered loading paths. No rules were disabled.
- Prior redesign verification: `npm run test` passed (17 tests); TypeScript passed; `npm run build` passed with Turbopack and generated all 24 routes. Lint was reduced from 40 errors/34 warnings to 1 error/25 warnings. Browser-based visual verification is outstanding; no browser runner or installed browser executable was available in this environment.
- Custom Like, Bookmark, and Repost: supplied PNG artwork is wired into the shared `PostCard`, backed by centralized per-user state in `PostInteractionProvider`. Mutations are optimistic, protected against duplicate requests, verified against Supabase, and reconciled or rolled back; repost undo is supported. Like and repost totals use count-only RPCs, never the current user's own rows as totals. Bookmark totals are omitted. Existing RLS policies are unchanged.
- Prepared `supabase/migrations/0004_secure_post_like_counts.sql` for review. It returns aggregate counts only for existing post UUIDs, grants execution to `anon` and `authenticated` because posts are publicly readable, and uses `SECURITY DEFINER` with a fixed `pg_catalog, public` search path. It has not been applied. Null arrays/null IDs/nonexistent IDs yield no result rows; existing posts with no likes yield zero; malformed UUID input is rejected by Postgres/PostgREST UUID parsing.
- Prepared `supabase/migrations/0005_secure_post_repost_counts.sql` for review. The `reposts` table has a `(user_id, post_id)` primary key and an own-row-only RLS policy, so accurate totals require an aggregate RPC. The function returns only totals for existing public posts; null arrays/null IDs/nonexistent IDs return no row and existing posts without reposts return zero. Execution is revoked from `PUBLIC` and granted to `anon` and `authenticated`, with `SECURITY DEFINER` and the same fixed search path. It has not been applied.
- Custom interaction regression tests cover transitions, persisted-state reconciliation, zero/nonzero and increment/decrement counts, invalid/missing count rows, refresh/navigation consistency, and duplicate locking; existing feed merge tests continue to cover deduplication and ordering. Verification on 2026-10-28: `npm run test` passed (30 tests), `npx tsc --noEmit --incremental false` passed, `npm run build` passed with Turbopack and generated 24 routes, and `git diff --check` passed. `npm run lint` still exits 1 for the existing explicit `any` in `src/lib/supabase/client.ts`; it reports 29 image optimization warnings. Removing that `any` without adding a generated `Database` schema introduced broad errors across the app, so the typecheck-preserving implementation remains and a focused schema-typing task is still needed. No browser verification was performed. Migrations `0004_secure_post_like_counts.sql` and `0005_secure_post_repost_counts.sql` remain review-only and unapplied; approval is needed before applying them to any environment.

### Accelerated sprint progress (2026-10-29)

Scoring uses ten equally weighted feature areas from this checklist. A feature earns 1 point when its implementation and regression/build checks pass without a pending prerequisite for its core path; 0.5 when implemented and statically/test verified but still depends on an unapplied local migration or live/browser verification; 0 when missing. This measures verified code readiness, not production deployment.

| Feature area | Status | Points | Evidence / limitation |
|---|---:|---:|---|
| Authentication and account access | Complete | 1 | Existing auth provider and account flows typecheck/build; no auth semantics changed. |
| Feed publication and immediate merge | Complete | 1 | Insert success updates visible feed, feed merge is deduplicated/ordered, failure regression tests pass. |
| Likes, bookmarks, and reposts | Partial | 0.5 | Shared optimistic state/tests are in place; secure aggregate migrations 0004/0005 are not applied. |
| Profiles, follows, profile settings | Partial | 0.5 | Public profile, follow handling, own profile/settings compile; live RLS/storage behavior not browser-tested. |
| Canonical post pages and metadata | Partial | 0.5 | Dynamic metadata and canonical route build; post detail needs a real Supabase/browser pass. |
| Replies and discussion counts | Partial | 0.5 | Thread loading/submission and shared count state implemented; reply-count and notification RPC migrations are pending. |
| Search | Partial | 0.5 | Real profile and post queries implemented and typechecked; live query behavior not verified. |
| Explore / creator discovery | Partial | 0.5 | Real creator/post queries and retry states implemented; no live database/browser verification. |
| Notifications | Partial | 0.5 | Read-state actions and canonical links implemented; secure action migration 0009 is pending. |
| Direct messages | Partial | 0.5 | Conversation, message loading, send, and validation implemented; RLS/RPC migrations 0006/0010 are pending. |

**Verified implementation score: 6/10 = 60%.** Tests, TypeScript, lint, production build, and whitespace checks for this sprint are recorded in the completion report. This is a code-level threshold only: no browser session or live Supabase environment was used, and migrations 0004â€“0010 remain un-applied review artifacts. Do not treat messaging, secure aggregate counts, replies, or notification actions as production-ready until these migrations are reviewed/applied to a development Supabase project and integration/browser journeys pass.

Sprint work after the prior UI/reaction pass:
- Resolved the Next 16 Cache Components metadata prerender error without caching request-specific Supabase metadata: `generateMetadata()` remains dynamic, while request-time post rendering is isolated behind a Suspense boundary and `connection()` in the page component.
- Added shared like/repost/reply aggregate-count hydration and optimistic repost count reconciliation across post cards; moved the interaction provider above route content so pages outside `Shell` share the same state.
- Added real-data search and Explore results, unread/read notification actions with canonical destinations, validated profile settings, home-feed pagination, own-post editing, and discussion retry/error handling.
- Implemented conversation listing, message history, direct conversation creation, and message submission against the existing schema, with least-privilege local migrations prepared for review.
- Prepared `0006_secure_direct_messages.sql`, `0007_own_post_edits.sql`, `0008_public_post_reply_counts.sql`, `0009_secure_notification_actions.sql`, and `0010_latest_conversation_messages.sql`. None of migrations 0004â€“0010 has been applied. Existing RLS policies were not weakened.
- Verification on 2026-10-29: `npm run test` passed (33 tests); `npx tsc --noEmit --incremental false` passed; `npm run build` passed with Turbopack and generated all 24 routes; `git diff --check` passed. `npm run lint` exits 1 for the existing explicit `any` in `src/lib/supabase/client.ts` and reports 31 `@next/next/no-img-element` warnings. The newly introduced message loading effect lint error and unnecessary interaction provider dependency were corrected. Browser verification remains outstanding.

### Next task

Confirm a dedicated development Supabase target and approve applying migrations 0004â€“0010 there; then regenerate the database types against that schema and run database integration plus browser journeys for interactions, profiles, replies, notifications, and direct messaging. Complete the remaining image optimization warnings and perform desktop/mobile accessibility verification. Legal pages remain placeholders.

### Database migration and development-target review (2026-10-29)

- Offline review completed for migrations 0004â€“0010 against the checked-in schema in 0001â€“0003. No migration was applied and no database-changing command was run.
- `0004_secure_post_like_counts.sql` and `0005_secure_post_repost_counts.sql`: depend on the existing likes/reposts primary-key tables and publicly-readable posts policy. Return aggregate rows only; fixed `pg_catalog, public` paths, `SECURITY DEFINER`, and explicit `anon`/`authenticated` execution grants after revoking defaults. Re-runs replace functions/grants. The checked-in schema has no private-post field, so they count all existing posts consistently with current public read policy.
- `0006_secure_direct_messages.sql`: depends on the conversations, participant, and message tables already created in 0001. It adds member-only reads, caller-owned message inserts, a membership-check helper, and an atomic caller/recipient conversation RPC. Existing checked-in schema has no DM policies, so the new named policies do not conflict with earlier migrations. RLS is preserved; no direct membership write policy is added. If another environment has extra permissive policies with different names, PostgreSQL's permissive-policy OR semantics mean that schema drift must be reviewed before applying this policy set.
- `0007_own_post_edits.sql`: `edited_at` already exists in 0001, so `ADD COLUMN IF NOT EXISTS` is an intentional harmless repeat. It adds an authenticated owner-only update policy with both `USING` and `WITH CHECK`; the tracked baseline has no other post update policy. Rollback should remove the new policy, not drop the pre-existing `edited_at` column.
- `0008_public_post_reply_counts.sql`: depends on the public replies read policy and returns aggregate counts as `SECURITY INVOKER`, so caller RLS remains in effect. It grants only function execution to `anon`/`authenticated`, after revocation from `PUBLIC`.
- `0009_secure_notification_actions.sql`: depends on likes/reposts/replies and owner-readable notifications from 0001. Definer RPCs validate caller, post author, and a matching persisted interaction before creating a notification; read RPCs constrain updates to `auth.uid()`. Direct notification writes remain unavailable under the checked-in RLS policy. A NULL notification type ultimately fails the table's NOT NULL constraint; explicit NULL rejection would improve the error but does not bypass ownership. Advisory locking prevents duplicate notification rows for the same actor/type/post pair.
- `0010_latest_conversation_messages.sql`: depends on 0006's member-only messages read policy. It is `SECURITY INVOKER`, returns only the latest row per requested conversation, and is executable only by authenticated callers.
- All seven files use `CREATE OR REPLACE` or drop/recreate their named policies and are re-runnable against the tracked baseline. They contain no destructive table/data operations. Rollback of 0006 should drop its functions/policies and will return messaging to the baseline's deny-by-default state; conversations/messages created during testing are not automatically removed. For database-changing tests, use an empty dedicated development project or snapshot and retain test data until an intentional cleanup is approved.
- The prior 0003 auth trigger is SECURITY DEFINER with `search_path = public` rather than `pg_catalog, public`, and uses unqualified `profiles`; it is pre-existing and outside 0004â€“0010. Review its effective schema CREATE grants and consider a later hardening migration that qualifies objects and fixes the path. No permissions were changed in this sprint.
- Development target is **unconfirmed**. `.env.local` configures project reference `kunwfddahxkpvsivmmkm`; `.env.example` contains blanks; there is no `supabase/config.toml`, linked project-ref metadata, or installed Supabase CLI. The reference alone does not identify whether this is development or production. Stop before any database-changing command until the owner confirms this exact project is a dedicated development target, or provides a separate development project reference/URL. No credentials were printed.
- Added local schema-derived TypeScript types in `src/lib/supabase/database.types.ts` and typed the client factory. These are hand-maintained from checked-in SQL because the Supabase CLI/project link is unavailable; regenerate and compare them against the confirmed development schema before relying on them for remote schema coverage. Nullability reflects the SQL constraints, and incomplete message timestamps/participants are rejected from the UI mapping.
- Local automated tests and static/build checks are not live database verification. No browser environment is available in this session; create/edit/delete, interaction persistence, reply threads, profile updates, discovery, notifications, DMs, privacy, and signed-out journeys remain unverified against Supabase.
- Completion remains **60% implementation/code readiness** under the ten-area checklist above; the live-database verification portion remains **0% for this review**, because no target could be confirmed. Do not present the former percentage as end-to-end feature completion.
- Verification follow-up (2026-10-29): `npm run test` passed (33 tests); `npx tsc --noEmit --incremental false` passed with the schema-derived client types; `npm run lint` passed with 0 errors and 25 remaining `no-img-element` warnings; `npm run build` passed and generated 24 routes; `git diff --check` passed. The custom reaction PNGs now use `next/image`; remaining warnings are dynamic profile/media URLs and blob previews, for which no trusted fixed remote-image policy is configured. This is automated/static verification only; the warnings and all live Supabase/browser journeys remain outstanding.

### Sprint hardening follow-up (2026-10-29)

- Made feed reconciliation use the same deterministic descending `(created_at, id)` order as cursor pagination. Posts sharing an identical timestamp no longer risk being skipped or duplicated across page boundaries. Added a regression test for merge and insertion ordering.
- Hardened reply and direct-message submission paths with synchronous duplicate-submit locks and `try/finally` cleanup. Reply drafts remain available after failed inserts; notification failures after a successful reply are reported separately so a persisted reply is not misrepresented as failed. Message loading and conversation-list failures now surface recoverable errors.
- Focused verification: `npx vitest run src/lib/feed.test.ts` passed (18 tests); `npx tsc --noEmit --incremental false` passed; targeted ESLint passed with three existing image-element warnings in the post discussion page.
- Full sprint verification is being rerun for this follow-up below. No live Supabase target was confirmed, no migrations were applied, and no live database or browser journey was verified. Completion stays at 60% code readiness under the ten equally weighted feature areas above; these changes strengthen already-counted feed/reply/message areas and do not justify increasing the score.

Final verification for the 2026-10-29 sprint follow-up:
- `npm run test`: passed, 34 tests across 3 files (Vitest emitted a Vite config-loader compatibility warning).
- `npx tsc --noEmit --incremental false`: passed.
- `npm run lint`: passed with 0 errors and 25 existing `@next/next/no-img-element` warnings.
- `npm run build`: passed with Next.js 16.4.3/Turbopack; all 24 routes generated.
- `git diff --check`: passed; Git printed only line-ending normalization warnings for existing modified files.

The feed ordering regression test and submission reliability changes are included in the local working tree. No live browser or Supabase verification was performed. Migrations 0004–0010 remain pending and the development project is still unconfirmed.

### Final 11% sprint follow-up (2026-10-29)

- Profile data loading now distinguishes query failures from empty posts/replies/likes, catches rejected requests, and discards stale results after a username change or unmount. Follow/unfollow uses a synchronous duplicate-request guard and releases the guard on both resolved errors and rejected requests.
- The local `.env.local` points at project ref `kunwfddahxkpvsivmmkm`; its secrets were not displayed. This checkout has no Supabase CLI, linked-project metadata, or configured environment label identifying that project as development. Therefore the remote migration history could not be checked safely, migrations 0004–0010 are **not confirmed applied**, and no database connection or database-changing operation was attempted. User-reported setup alone does not establish which environment this project ref represents.
- Final local verification: `npm run test` passed (34 tests in 3 files; Vite emitted its config-loader compatibility warning); `npx tsc --noEmit --incremental false` passed; `npm run lint` passed (0 errors, 25 existing image optimization warnings); `npm run build` passed with Next.js 16.4.3/Turbopack and generated 24 routes; `git diff --check` passed (line-ending normalization warnings only).
- No live Supabase operations, database feature journeys, or browser checks were performed. The score remains **60% code readiness** using the unchanged ten-feature equally weighted checklist (6/10); this follow-up improves profile failure handling but does not verify remote policies or persistence. The next task is to identify the configured project explicitly as a dedicated development environment, inspect its migration history, then run approved integration/browser journeys against that environment. Migrations 0004–0010 remain pending confirmation; do not apply them until the target is positively identified and database changes are approved.

### Feature delivery sprint (2026-10-29)

- Search results now support additional real post pages (20 posts per request) with deterministic `created_at`/ID ordering, merged-by-ID updates, protection against stale overlapping searches, and recoverable network/load-more errors. Existing real user results and canonical profile/post navigation remain intact.
- Explore now supports paginating recent real posts (12 per request) with deterministic ordering, author mapping, duplicate-safe merges, and a retryable load-more error while keeping already loaded results visible. Creator discovery remains based on recently joined profiles; no synthetic rankings or data were added.
- Added tested shared page-range and ID-merge helpers in `src/lib/search.ts` with regression coverage in `src/lib/search.test.ts`.
- Final verification: `npm run test` passed (36 tests across 4 files); `npx tsc --noEmit --incremental false` passed; `npm run lint` passed with 0 errors and 25 existing image warnings; `npm run build` passed (Next.js 16.4.3/Turbopack, 24 routes); `git diff --check` passed with line-ending normalization warnings.
- The 60% code-readiness score remains unchanged (6/10 equally weighted plan areas). Search and Explore pagination improve existing areas but don't verify Supabase RLS, remote migration state, or real-user journeys. No live Supabase or browser testing was performed; migrations 0004–0010 remain unconfirmed/unapplied. Next task: verify that the configured project is a dedicated development target and run database/browser journeys after its migration state is reviewed.
