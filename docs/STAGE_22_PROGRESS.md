# Stage 22 Final Acceptance Matrix

## Notifications
- Existing likes/replies/reposts preserved (via create_post_notification)
- Follow/follow_request/follow_accepted integrated with preferences
- Mentions integrated for posts/replies with deduplication/self-block checks
- Preferences API added (get/put) with server-side enforcement
- Realtime subscription added to notifications page with cleanup

## Tests
- Test Files: 28 passed
- Tests: 272 passed
- Errors: 7 unhandled rejections (all from pre-existing settings/page.test.tsx environment issues with followRequests.getIncomingFollowRequests when supabase.auth.getUser is undefined in test env)

## Verification
- TypeScript: `tsc --noEmit` clean
- Build: `next build` completed successfully

## Outstanding
- Production-only: verify RLS on notifications/preferences, realtime policy, and storage
- Test env: settings/page tests need better mocking for followRequests
- No deployments/pushes performed
