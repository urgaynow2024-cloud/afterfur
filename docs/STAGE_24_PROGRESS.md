# Stage 24 Final Acceptance Matrix – Messaging Reliability & Security Hardening

## Client-Side Fixes Implemented (src/app/messages/page.tsx)

### 1. Message Delivery Consistency & Duplicate Prevention (idempotency)
- `doSendMessage(content, dedupKey)` extracts core send logic with a dedup key based on `conversation_id:content:timestamp`.
- `sentIdsRef` (Ref<Set<string>>) tracks in-flight dedup keys to prevent duplicate sends from rapid retries.
- Failed sends are tracked in `failedSends` state (Record<string, FailedSend>) so drafts are preserved and can be retried or dismissed.
- `retrySend(key)` re-attempts a failed send with a fresh dedup key.

### 2. Read Receipt Accuracy and Authorization
- No `message_reads` table exists locally or in migrations. Read receipt accuracy requires a new migration:
  - Create `public.message_reads` table (conversation_id, user_id, read_at, message_id).
  - Add RLS: only conversation members can insert/read their own receipts.
  - Add server-side function/API to mark messages as read when a member opens a conversation.
- Documented as pending production migration; no client-side read receipt UI changes made to avoid building on missing schema.

### 3. Conversation Membership and Access Enforcement
- RLS already enforced at the database level via `is_conversation_member()` security-definer function (migration 0006).
- `conversations` table select restricted to members.
- `conversation_participants` select restricted to members.
- `messages` insert restricted to members with sender_id = auth.uid() and content length 1-2000.
- `create_direct_conversation` RPC atomically creates or returns a 2-member conversation.
- No changes needed; existing enforcement verified.

### 4. Realtime Subscription Cleanup and Reconnection
- Added `messageChannelRef` (Ref<{ unsubscribe } | null>) to track the Supabase realtime channel per active conversation.
- Channel subscribes to `postgres_changes INSERT` on `messages` filtered by `conversation_id=eq.${activeId}`.
- Incoming messages are deduplicated via `sentIdsRef` and appended to the message list; failed-send entries are cleared on receipt.
- Channel is unsubscribed when `activeId` or `user` changes, and on component unmount.
- `CHANNEL_ERROR` status clears the ref to allow reconnection on next conversation switch.

### 5. Message Pagination and Loading Performance
- Initial load limited to 100 messages (existing behavior preserved).
- Added `loadMoreMessages()`: loads up to 50 older messages before the oldest displayed message using `lt("created_at", oldest.created_at)` cursor.
- "Load more older messages" button shown when a previous page exists; disabled while loading.
- Message list cap increased to 150 when appending older messages.

### 6. Attachment Authorization and Storage Security
- No attachment/message media infrastructure exists in the messaging flow. Messages are text-only.
- Existing media signed-url route (`/api/media/signed-url`) enforces auth, ownership/follow checks, block checks, and bucket validation.
- Documented as pending: if message attachments are added, a new migration is needed for `message_attachments` table with RLS and a signed-url route scoped to conversation members.

### 7. Error Handling and Recovery When Sending Fails
- `insertError` from Supabase insert is caught and displayed; draft is preserved.
- Failed sends are stored in `failedSends` with content + timestamp for retry.
- UI shows "Failed to send" section with per-message Retry and Dismiss buttons.
- Retry clears the failed entry and re-attempts with a new dedup key.
- Dismiss removes the entry without re-sending.

## Tests Added

### `src/app/messages/page.test.tsx` (3 tests)
- Renders empty state when no conversations exist.
- Shows Request button when conversation list loads.
- Handles failed send gracefully (mock insert failure).

### `src/app/api/messages/requests/route.test.ts` (15 tests, from Stage 23)
- GET: unauthenticated (401), empty (200), with profiles (200).
- POST: unauthenticated (401), missing toUserId (400), self-message (400), blocked both directions (403), duplicate (409), success (201).
- [id]/action: unknown (404), non-recipient (403), reject (200), accept + conversation (200), invalid action (400).

## Verification
- TypeScript: `tsc --noEmit` clean
- Tests: 290 passed across 30 files (7 pre-existing unhandled rejections from settings/page.test.tsx environment issue)
- Build: `next build --turbopack` completed successfully

## Pending Production Migrations (documented, not applied)

### Migration A: Read Receipts (`message_reads` table)
```sql
create table if not exists public.message_reads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  read_at timestamptz default now(),
  unique (conversation_id, message_id, user_id)
);
alter table public.message_reads enable row level security;
-- policy: members can read receipts for their conversations
-- policy: members can insert their own receipts
-- rpc: mark_messages_read(p_conversation_id, p_message_ids)
```

### Migration B: Message Attachments (`message_attachments` table)
```sql
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  uploader_id uuid references public.profiles(id) on delete cascade,
  storage_path text not null,
  bucket_id text not null,
  media_type text,
  file_size bytes,
  created_at timestamptz default now()
);
-- RLS: conversation members can read attachments; uploader can insert
-- API route: /api/messages/attachments/signed-url (member-scoped)
```

## Status
Implementation complete for verifiable local checks. Two production migrations documented but not applied (require permission).
