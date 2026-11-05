# Stage 26 Final Acceptance Matrix – Messaging & Notification Integration

## Migration File (documented, NOT applied to production)

### `supabase/migrations/STAGE_26_CONVERSATION_MUTES.sql`
- Creates `public.conversation_mutes` table: id, conversation_id, user_id, muted_at, unique(conversation_id, user_id)
- RLS: users can read/insert/delete their own mutes only
- Indexes on user_id and conversation_id

## New Server-Side Helper (`src/lib/notifications.server.ts`)

### `createMessageNotification(opts)`
Follows the exact pattern of `createFollowNotification`:
- Rejects self-messages (actorId === recipientId)
- Enforces bidirectional block checks (blocks table)
- Checks `messages` notification preference via `isNotificationEnabled()`
- Checks `conversation_mutes` — skips notification if recipient has muted the conversation
- Duplicate prevention: checks for existing unread `message` notification with same `actor_id` + `conversation_id` in payload
- Inserts notification with type `message`, payload `{ actor_id, conversation_id }`, read: false

## Updated `notificationPreferences.ts`
- Added `messages: boolean` to `NotificationPrefs` type (default: true)

## New API Route (`src/app/api/messages/[conversationId]/notify/route.ts`)
- `POST /api/messages/[conversationId]/notify`
- Auth required
- Verifies caller is a conversation participant
- Finds the other participant as recipient
- Calls `createMessageNotification` (server-side handles blocks, prefs, muting, dedup)
- Returns 401 unauthenticated, 403 non-participant, 400 no recipient, 200 success

## Updated API Routes
- `POST /api/messages/read-receipts` — already existed from Stage 25, unchanged
- `POST /api/messages/attachments` — already existed from Stage 25, unchanged
- `GET /api/messages/attachments/signed-url` — already existed from Stage 25, unchanged

## Client-Side Changes (`src/app/messages/page.tsx`)

### Unread Message Counts
- `loadConversations` now computes unread counts per conversation by querying `messages` (from peers) left-joined against `message_reads` (user's reads)
- Unread count displayed as a badge on each conversation in the list
- Realtime: when a peer message arrives and the user is NOT viewing that conversation, unread count increments
- When viewing a conversation, new peer messages are immediately marked as read (no unread count change)

### Muted Conversations
- `loadConversations` loads muted conversation IDs from `conversation_mutes`
- `toggleMute(conversationId)` inserts/deletes a mute row and updates local state
- Muted conversations show a muted indicator (small dot) and "Unmute" button in the list
- Muting a conversation resets its unread count to 0
- Muted indicator shown next to unread count badge

### Notification Integration
- `doSendMessage` calls `POST /api/messages/${activeId}/notify` after successful message insert
- `handleFileSelect` (attachment upload) calls the same notify API after successful upload
- Server-side enforces all restrictions (blocks, prefs, muting, dedup, membership)

### Conversation List UI
- Unread count badge shown for conversations with unread messages (when not active)
- Muted indicator dot shown for muted conversations
- Mute/Unmute button on each conversation row
- Clicking mute/unmute does not navigate (stopPropagation)

## Updated Notifications Page (`src/app/notifications/page.tsx`)

- `NotificationRow` type updated: payload now includes optional `conversation_id`
- `describe()` handles `message` type: `"{name} sent you a message"`
- Notification href for `message` type links to `/messages`
- Existing realtime subscription and unread count logic from `NotificationProvider` automatically covers new `message` type notifications

## Tests Added

### `src/lib/notifications.server.test.ts` (10 tests)
- createMessageNotification: self-message (no-op), actor blocked recipient (no-op), recipient blocked actor (no-op), conversation muted (no-op), messages notifications disabled (no-op), duplicate unread notification prevented (no-op)
- Notify API route: unauthenticated (401), non-participant (403), participant success (200), no other participant (400)

## Verification
- TypeScript: `tsc --noEmit` clean
- Tests: 319 passed across 32 files (7 pre-existing unhandled rejections from settings/page.test.tsx)
- Build: `next build --turbopack` completed successfully

## Security Notes
- Service-role key used only in server-side helpers and API routes, never exposed to client
- Conversation membership enforced on notify API route
- Blocking enforced bidirectionally in `createMessageNotification`
- Conversation muting respected before creating notifications
- Duplicate notifications prevented by checking for existing unread message notifications
- Notification links open `/messages` for message type (client handles conversation activation)

## Status
Implementation complete for verifiable local checks. One production migration documented but not applied (requires permission).
