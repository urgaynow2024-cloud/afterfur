# AfterFur 2.0 — Midnight Redesign Progress

## Goal
Redesign entire application using Midnight visual direction. Preserve all functionality.

## Routes inspected
- [ ] src/app/page.tsx (Home feed)
- [ ] src/app/explore/page.tsx
- [ ] src/app/search/page.tsx
- [ ] src/app/notifications/page.tsx
- [ ] src/app/messages/page.tsx
- [ ] src/app/bookmarks/page.tsx
- [ ] src/app/after-dark/page.tsx
- [ ] src/app/settings/page.tsx
- [ ] src/app/[username]/page.tsx + ProfileClient
- [ ] src/app/[username]/status/[id]/page.tsx + PostClient
- [ ] src/app/posts/[id]/page.tsx
- [ ] src/app/edit-profile/page.tsx
- [ ] src/app/profile/page.tsx
- [ ] auth pages (signin/signup/forgot/reset)
- [ ] policy pages

## Components redesigned
- [ ] Global nav/layout (src/app/layout.tsx)
- [ ] PostCard
- [ ] GlobalComposer
- [ ] BadgeList
- [ ] profile/* components
- [ ] post/* components
- [ ] settings/* components
- [ ] ui/* components
- [ ] NotificationProvider / NotificationNavBadge

## Features preserved
- Supabase integration, auth, posts/replies/likes/reposts, bookmarks, media upload/compression, signed URLs, private media, Stage 21A blocking, Stage 21B private profiles/follow requests, privacy/RLS, APIs/DB.

## Remaining work
(Will be populated as progress continues.)

## Tests completed
- TypeScript (tsc --noEmit): PASS
- Lint: 19 errors, 127 warnings (pre-existing)
- Build: PASS
- Tests: 233 passed (22 files)

## Known failures
- (none yet)
" filePath">
D:\Afterfur\AFTERFUR_2_REDESIGN_PROGRESS.md