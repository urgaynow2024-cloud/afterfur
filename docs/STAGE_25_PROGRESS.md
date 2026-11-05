# Stage 25 Final Acceptance Matrix – Messaging Read Receipts & Secure Attachments

## Migration Files (documented, NOT applied to production)

### `supabase/migrations/STAGE_25_MESSAGE_READ_RECEIPTS.sql`
- Creates `public.message_reads` table: id, conversation_id, message_id, user_id, read_at, unique(conversation_id, message_id, user_id)
- RLS: members can read receipts for their conversations; members can insert/update their own receipts
- Indexes on conversation_id, user_id, message_id
- RPC `public.mark_messages_read(p_conversation_id uuid, p_message_ids uuid[])`: marks messages as read for the authenticated caller, enforces conversation membership via RLS (SECURITY INVOKER)

### `supabase/migrations/STAGE_25_MESSAGE_ATTACHMENTS.sql`
- Creates `public.message_attachments` table: id, message_id, conversation_id, uploader_id, storage_path, bucket_id, media_type, file_size, created_at, unique(bucket_id, storage_path)
- RLS: members can read attachments for their conversations; members can insert attachments for conversations they belong to
- Indexes on conversation_id, message_id, uploader_id
- Creates private storage bucket `message_attachments` (idempotent)
- Storage RLS: upload/update/delete restricted to uploader's own folder (`storage.foldername(name)[1] = auth.uid()`); read closed to authenticated (only service-role signed URLs)

## New API Routes

### `POST /api/messages/read-receipts`
- Auth required
- Validates conversation membership before calling `mark_messages_read` RPC
- Returns 200 on success, 403 for non-members, 400 for invalid input

### `POST /api/messages/attachments`
- Auth required
- Validates conversation membership and message ownership (message must belong to the conversation)
- Validates file type and size using existing `validateMediaFile` from `@/lib/media` (max 25 MB per attachment)
- Rejects path traversal in storage paths
- Prevents duplicate attachment registration (same storage_path + bucket)
- Returns 201 with attachment record on success

### `GET /api/messages/attachments/signed-url`
- Auth required
- Looks up attachment by storage_path + bucket
- Validates conversation membership before minting signed URL
- Signed URL generated server-side with service-role client (key never reaches browser)
- Configurable expiry (60s–3600s, default 300s)

## Client-Side Changes (`src/app/messages/page.tsx`)

### Read Receipts
- `readReceipts` state tracks message IDs read by the current user
- `markMessagesRead(conversationId, messageIds)` calls the read-receipts API
- Messages are marked as read when loaded and when they arrive via realtime (if from peer)
- Message bubbles show "Read" / "Delivered" status indicator

### Attachments
- File input in the composer with "Attach file" label
- Client-side validation via `validateMediaFile` and 25 MB size cap
- Direct upload to `message_attachments` storage bucket using anon client (RLS enforces uploader folder isolation)
- Attachment message created with `[Attachment] filename` content
- Attachment row registered in `message_attachments` table after upload
- Upload state shown ("Uploading…")

## Tests Added

### `src/app/api/messages/attachments/route.test.ts` (19 tests)
- Read receipts: unauthenticated (401), missing fields (400), empty messageIds (400), non-member (403), success (200)
- Attachments: unauthenticated (401), missing fields (400), non-member (403), unknown message (404), wrong conversation (404), invalid path (400), oversized file (400), success (201), duplicate (409)
- Signed URL: unauthenticated (401), missing path (400), unknown attachment (404), non-member (403), success (200)

## Verification
- TypeScript: `tsc --noEmit` clean
- Tests: 309 passed across 31 files (7 pre-existing unhandled rejections from settings/page.test.tsx)
- Build: `next build --turbopack` completed successfully

## Security Notes
- Service-role key used only in API routes (server-side), never exposed to client
- Attachment storage read is closed at RLS level; only service-role signed URLs can fetch objects
- Conversation membership enforced on every attachment/read-receipt operation
- File type and size validated server-side using existing `validateMediaFile`
- No existing tables, routes, or UI features were removed or duplicated

## Status
Implementation complete for verifiable local checks. Two production migrations documented but not applied (require permission).
