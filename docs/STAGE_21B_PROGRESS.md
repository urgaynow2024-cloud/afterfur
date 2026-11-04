# Stage 21B Final Acceptance Matrix

## API Route Authorization (verified)
- `src/app/api/profile/[username]/route.ts` uses `getProfileForViewer` (server-side, uses `profilePrivacy`)
- `src/app/api/post/[id]/route.ts` uses `getPostForViewer` (server-side, uses `postPrivacy`)
- `src/app/api/posts/[id]/route.ts` POST/PATCH/DELETE enforce auth + ownership
- `src/app/api/posts/[id]/replies/route.ts` checks post access via `getPostForViewer` before allowing reply
- `src/app/api/replies/[id]/route.ts` enforces ownership
- `src/app/api/posts/[id]/repost/route.ts` checks original post access before repost
- `src/app/api/posts/[id]/bookmark/route.ts` checks original post access before bookmark
- `src/app/api/feed/home/route.ts` and `src/app/api/feed/explore/route.ts` use server-side filtering with `canShowPostInFeed`/`postPrivacy`
- `src/app/api/media/signed-url/route.ts` enforces auth, ownership/follow checks, block checks, signed URL generation server-side

## Feeds/Search
- Home/Explore/Search use server-side privacy filtering helpers; client-side filtering retained as safeguard
- `getFeedPostsForViewer` added for server-side feed retrieval

## Media/Metadata
- Signed URL requires auth and authorization; private/bucket/path checks enforced
- Profile/post metadata guards added (private profiles/posts return generic metadata)

## RLS
- Reviewed existing RLS policies (posts readable true historically; application enforces privacy). No production migrations executed. Recommendations: consider tightening RLS to rely on authenticated context where possible.

## Tests/Build
- Full test suite: 28 test files, 272 tests passed (7 unhandled rejections from pre-existing test environment issues, not test failures)
- TypeScript: `tsc --noEmit` clean
- Production build: completed (Next build output shows routes built)

## Remaining production-only checks
- Verify RLS in production Supabase against actual policies
- Verify storage bucket policies for private media
- Validate signed URL behavior with production auth/session flow
- Test direct storage URL access is blocked per bucket policy

Status: Implementation complete for verifiable local checks. Production-only verification items listed above.
