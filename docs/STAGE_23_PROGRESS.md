# Stage 23 Final Acceptance Matrix – Direct Messaging

## Messaging API Routes (verified existing)
- `GET /api/messages` — lists conversations with peers and latest messages
- `POST /api/messages/conversations` — creates a direct conversation; enforces bidirectional block checks
- `GET /api/messages/requests` — lists incoming and outgoing message requests with profiles
- `POST /api/messages/requests` — creates a pending message request; enforces bidirectional block checks, duplicate request detection, self-message rejection
- `POST /api/messages/requests/[id]` — accept or reject a message request; accept creates a conversation via `create_direct_conversation` RPC; only the recipient can act

## Messaging UI (src/app/messages/page.tsx)
- Conversation list with peer avatars, names, last message preview, unread indicators
- Direct message composer (send messages within active conversation)
- "Start conversation by username" form that sends a message request (POST /api/messages/requests)
- Incoming requests section with Accept/Reject buttons per request
- Outgoing requests section with status display (pending/accepted/rejected)
- Pending request counts shown for both incoming and outgoing sections
- Accept/reject actions refresh requests and conversations lists on success

## Block / Privacy Enforcement
- Bidirectional block checks on conversation creation (POST /api/messages/conversations)
- Bidirectional block checks on message request creation (POST /api/messages/requests)
- Only the request recipient can accept/reject (POST /api/messages/requests/[id])
- Privacy enforced via the request/accept flow: no direct messaging without an accepted request

## Tests
- New: `src/app/api/messages/requests/route.test.ts` — 15 tests covering GET/POST routes and accept/reject actions
  - Unauthenticated access rejected (401)
  - Missing/invalid toUserId rejected (400)
  - Self-message rejected (400)
  - Blocked in either direction rejected (403)
  - Duplicate request returns 409
  - Successful request creation returns 201
  - Unknown request returns 404
  - Non-recipient action returns 403
  - Accept/reject actions return 200; accept creates a conversation
  - Invalid action returns 400
- Existing test suite: 287 tests passed across 29 files (7 pre-existing unhandled rejections from settings/page.test.tsx environment issue)

## Verification
- TypeScript: `tsc --noEmit` clean
- Build: `next build --turbopack` completed successfully
- No production migrations executed
- No deployments or pushes performed

## Database Schema
- No changes to existing tables. `blocks` and `message_requests` tables are referenced by existing API routes but are not defined in local migration files (expected to exist in the linked Supabase project).
- `database.types.ts` does not include `blocks` or `message_requests` table types; API routes use `(supabase as any)` casts for these tables.

## Status
Implementation complete for verifiable local checks.
