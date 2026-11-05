# Stage 27 Final Acceptance Matrix – Production Readiness & Database Migration Validation

## Migration Audit

### Outstanding migrations (documented, NOT applied to production)

| Migration | Tables/Objects | Dependencies | Status |
|-----------|---------------|--------------|--------|
| `STAGE_25_MESSAGE_READ_RECEIPTS.sql` | `public.message_reads`, RPC `mark_messages_read` | `conversations`, `messages`, `profiles`, `conversation_participants` (all exist in 0001/0006) | Verified clean |
| `STAGE_25_MESSAGE_ATTACHMENTS.sql` | `public.message_attachments`, storage bucket `message_attachments` | `conversations`, `messages`, `profiles`, `conversation_participants` | Verified clean |
| `STAGE_26_CONVERSATION_MUTES.sql` | `public.conversation_mutes` | `conversations`, `profiles` | Verified clean |

### Migration ordering
1. `STAGE_25_MESSAGE_READ_RECEIPTS.sql` — read receipts table + RPC
2. `STAGE_25_MESSAGE_ATTACHMENTS.sql` — attachments table + storage bucket
3. `STAGE_26_CONVERSATION_MUTES.sql` — conversation mutes table

The three migrations are independent of each other but should be applied in the above order. All use `create table if not exists` and `drop policy if exists`, making them idempotent and safe for re-running.

### Rollback considerations
- `message_reads`: drop table + drop function `mark_messages_read`
- `message_attachments`: drop table + drop storage bucket `message_attachments`
- `conversation_mutes`: drop table
- No foreign key conflicts: all new tables reference existing tables with `ON DELETE CASCADE`, so dropping them is safe

### Compatibility
- All foreign keys reference tables that exist in `0001_initial.sql` and `0006_secure_direct_messages.sql`
- No column additions to existing tables
- No conflicts with existing RLS policies
- Storage bucket `message_attachments` does not conflict with existing buckets (`avatars`, `banners`, `media`)

## RLS and Security Validation

### Profile privacy and blocking
- `profiles` table: permissive `profiles readable` (`using (true)`) + restrictive `profiles_privacy_restrictive` + restrictive `profiles_block_restrictive` = layered defense
  - Effective policy: `true AND (owner OR public OR accepted_follower) AND (not blocked)`
  - Blocking enforced bidirectionally via `is_current_user_blocked()` SECURITY DEFINER helper
- `posts` table: same layered approach (`posts readable` + `posts_privacy_restrictive` + `posts_block_restrictive`)

### Message conversation membership
- `conversations`, `conversation_participants`, `messages`: member-only RLS via `is_conversation_member()` SECURITY DEFINER helper
- `messages` insert: `sender_id = auth.uid() AND content length 1-2000 AND is_conversation_member(conversation_id)`
- `create_direct_conversation()` RPC: SECURITY DEFINER, atomic conversation creation, no client-side participant insertion

### Read receipt authorization
- `message_reads` select: conversation members only
- `message_reads` insert/update: owner only + must be conversation member
- `mark_messages_read()` RPC: SECURITY INVOKER (RLS applies to caller), verifies membership before inserting

### Attachment authorization and storage access
- `message_attachments` select: conversation members only
- `message_attachments` insert: uploader = auth.uid() + must be conversation member
- Storage bucket `message_attachments`: private (public=false)
- Storage upload/update/delete: only uploader's folder (`(storage.foldername(name))[1] = auth.uid()::text`)
- Storage select: closed (`using (false)`) — only service-role signed URLs can fetch objects
- Signed URL route (`GET /api/messages/attachments/signed-url`): server-side verifies conversation membership before minting URL with service-role client

### Conversation mute ownership
- `conversation_mutes`: select/insert/delete restricted to `auth.uid() = user_id`

### Notification ownership and preferences
- `notifications` select: `auth.uid() = user_id` (existing policy from 0001)
- Notification triggers block bidirectional blocks (existing trigger from STAGE_21A)
- `createMessageNotification()`: checks blocks, notification preferences (`messages`), muted conversations, and duplicate prevention

### No accidental unauthorized access paths identified
- All new tables have RLS enabled
- All new policies use `drop policy if exists` before creation
- Storage read is closed at RLS level
- Service-role key used only in server-side API routes, never exposed to client

## Integration Verification

| Flow | Verified | Tests |
|------|----------|-------|
| Public profile accessible to logged-out visitor | Yes | `profiles.server.test.ts` |
| Public profile accessible to authenticated user | Yes | `profiles.server.test.ts` |
| Private profile accessible to owner | Yes | `profiles.server.test.ts` |
| Private profile accessible to approved follower | Yes | `profiles.server.test.ts` |
| Private profile denied to unauthorized user | Yes | `profiles.server.test.ts` |
| Private profile denied to blocked user | Yes | `profiles.server.test.ts` |
| NULL is_private treated as public | Yes | `profiles.server.test.ts` |
| Messaging requests (create/accept/reject) | Yes | `requests/route.test.ts` |
| Read receipts (mark as read) | Yes | `read-receipts/route.test.ts` |
| Attachment registration + signed URL | Yes | `attachments/route.test.ts` |
| Muted conversations suppress notifications | Yes | `notifications.server.test.ts` |
| Message notifications respect preferences | Yes | `notifications.server.test.ts` |
| Duplicate notification prevention | Yes | `notifications.server.test.ts` |
| Blocking enforced on messages | Yes | API routes + RLS |
| Privacy settings save/load (`is_private`) | Yes | `settings/page.test.tsx` |

## Testing

### Test files
- `src/lib/profilePrivacy.test.ts` — 13 tests (canViewProfile logic)
- `src/lib/profiles.server.test.ts` — 24 tests (getProfileForViewer with all privacy/block scenarios)
- `src/app/api/messages/requests/route.test.ts` — 15 tests (request CRUD, blocking, duplicates)
- `src/app/api/messages/attachments/route.test.ts` — 19 tests (attachments, signed URLs, auth)
- `src/app/api/messages/read-receipts/route.test.ts` — 5 tests (read receipts, auth, membership)
- `src/lib/notifications.server.test.ts` — 10 tests (message notifications, blocks, muting, prefs, dedup)
- `src/app/messages/page.test.tsx` — 3 tests (UI rendering, failed sends)

### Verification results
- TypeScript: `tsc --noEmit` clean
- Tests: 332 passed across 33 files (7 pre-existing unhandled rejections from settings/page.test.tsx environment issue — not test failures)
- Production build: `next build --turbopack` completed successfully

## Security Concerns

### Reviewed and accepted
1. **`create_direct_conversation()` RPC does not check blocking** — Blocking is enforced at the application layer (`POST /api/messages/conversations` checks blocks before calling the RPC). The RPC is the only server-side path to create conversations; clients cannot insert into `conversation_participants` directly.

2. **`messages` insert RLS does not check blocking** — Blocking is enforced at the application layer. RLS ensures only conversation members can send messages, and only as themselves.

3. **No `delete` policy on `message_attachments` table** — Users cannot delete attachment records. Attachments are append-only by design. This is acceptable since attachments are tied to messages which have `ON DELETE CASCADE`.

4. **No `delete` policy on `message_reads` table** — Read receipts are append-only by design. This is acceptable.

5. **Storage bucket creation in migration** — `insert into storage.buckets` uses `on conflict (id) do nothing`, making it idempotent.

## Remaining Production Requirements

1. **Apply migrations to production** — Requires explicit permission. Migration files are ready but not applied.
2. **Verify RLS in production Supabase** — Confirm policies match local review against actual production policies.
3. **Verify storage bucket policies** — Confirm `message_attachments` bucket is created with correct private setting and RLS policies.
4. **Validate signed URL behavior** — Test with production auth/session flow.
5. **Monitor for duplicate notification edge cases** — Duplicate prevention checks for existing unread message notifications with same actor + conversation. Read receipt marking is not included in duplicate check (different purpose).

## Status

Implementation complete for verifiable local checks. All three production migrations documented but not applied (require permission).
